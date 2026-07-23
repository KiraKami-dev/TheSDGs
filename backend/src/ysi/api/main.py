"""FastAPI backend driving both agents.

Agent runs happen as background asyncio tasks rather than blocking the
request, since a run can take several minutes (the local Qwen model's
reasoning is verbose). The frontend polls /status for elapsed time + a feed
of recent tool calls instead of staring at a blank spinner.

When a Clean run finishes, it automatically kicks off a default "portfolio
overview" Analyze run in the background too, so the Explore step isn't an
empty chat box waiting for a question, it already has a baseline view by the
time the user gets there. Both stages persist versioned snapshots to disk so
a demo can load a known-good result instantly instead of re-running live.

Sessions are kept in-process memory (dict keyed by session_id): fine for a
prototype, not meant to survive a server restart.
"""

import asyncio
import time
import uuid
from typing import Callable

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pydantic_ai.usage import UsageLimits

from ysi import config
from ysi.agents.analyze_agent import make_analyze_agent
from ysi.agents.clean_agent import make_clean_agent
from ysi.persistence import list_snapshots, load_snapshot, save_snapshot
from ysi.sandbox import Sandbox
from ysi.schemas import AnalysisResult, CleaningResult

app = FastAPI(title="YSI Impact Intelligence API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174"],
    allow_methods=["*"],
    allow_headers=["*"],
)

OVERVIEW_PROMPT = (
    "This is the first thing a programme manager will see, before they ask anything. Produce a "
    "company_roster as the main block: specific companies worth a look right now, each with why, "
    "not a topic-level summary and not a vanity list of every company. Skip vanity stat blocks "
    "like total portfolio revenue or total beneficiaries; only include a stat if the number is "
    "itself the action-relevant fact (e.g. a count of how many need support). Only add an insight "
    "block for a genuinely programme-wide pattern that is not about one company. Keep the closing "
    "note to 1-3 sentences."
)


class AgentSession:
    def __init__(self, sandbox: Sandbox, agent):
        self.sandbox = sandbox
        self.agent = agent
        self.message_history = None
        self.status = "running"  # "running" | "done" | "error" | "cancelled"
        self.error: str | None = None
        self.result = None
        self.backend = ""
        self.started_at = time.monotonic()
        self.finished_at: float | None = None
        self.task: asyncio.Task | None = None
        self.overview_session_id: str | None = None  # clean sessions only
        self.turns: list[dict] = []  # analyze sessions only: [{question, result, backend}, ...]
        # Index into sandbox.history/progress where the CURRENT run started, so the status
        # feed shows only this turn's activity instead of the whole session's accumulated log.
        self.progress_start = 0
        self.history_start = 0

    @property
    def elapsed(self) -> float:
        end = self.finished_at if self.finished_at is not None else time.monotonic()
        return end - self.started_at

    def to_status_dict(self) -> dict:
        recent = self.sandbox.history[self.history_start :][-5:]
        return {
            "status": self.status,
            "elapsed_seconds": round(self.elapsed, 1),
            "tool_calls": len(self.sandbox.history) - self.history_start,
            "recent_calls": [
                {"code": h["code"][:300], "output": h["output"][:300]} for h in recent
            ],
            "progress": self.sandbox.progress[self.progress_start :][-8:],
            "result": self.result.model_dump() if self.result else None,
            "backend": self.backend,
            "error": self.error,
            "overview_session_id": self.overview_session_id,
            "turns": (
                [
                    {
                        "question": t["question"],
                        "result": t["result"].model_dump() if t["result"] else None,
                        "backend": t["backend"],
                    }
                    for t in self.turns
                ]
                if self.turns
                else None
            ),
        }


CLEAN_SESSIONS: dict[str, AgentSession] = {}
ANALYZE_SESSIONS: dict[str, AgentSession] = {}

# pydantic-ai defaults every agent.run() call to a 50-request cap. Cleaning
# 19 messy real files legitimately takes more tool calls than that; without
# raising this, a thorough run fails partway through with UsageLimitExceeded
# rather than because anything actually went wrong.
AGENT_USAGE_LIMITS = UsageLimits(request_limit=300)


def _last_model_name(result) -> str:
    try:
        return result.all_messages()[-1].model_name or "unknown"
    except Exception:
        return "unknown"


async def _run_agent(
    session: AgentSession,
    message: str,
    on_success: Callable[[AgentSession], None] | None = None,
    display_question: str | None = None,
) -> None:
    session.progress_start = len(session.sandbox.progress)
    session.history_start = len(session.sandbox.history)
    try:
        result = await session.agent.run(
            message,
            deps=session.sandbox,
            message_history=session.message_history,
            usage_limits=AGENT_USAGE_LIMITS,
        )
        session.message_history = result.all_messages()
        session.result = result.output
        session.backend = _last_model_name(result)
        session.status = "done"
        session.turns.append(
            {"question": display_question, "result": session.result, "backend": session.backend}
        )
        if on_success:
            on_success(session)
    except asyncio.CancelledError:
        session.status = "cancelled"
        session.error = "Stopped by user"
        raise
    except Exception as exc:  # noqa: BLE001 (surfaced to the UI, not a demo-killing crash)
        session.status = "error"
        session.error = str(exc)
    finally:
        session.finished_at = time.monotonic()


def _start_run(
    session: AgentSession,
    message: str,
    on_success: Callable[[AgentSession], None] | None = None,
    display_question: str | None = None,
) -> None:
    session.task = asyncio.create_task(_run_agent(session, message, on_success, display_question))


async def _cancel_session(session: AgentSession) -> None:
    if session.task and not session.task.done():
        session.task.cancel()
        try:
            await session.task
        except asyncio.CancelledError:
            pass


def _save_analyze_snapshot(session: AgentSession) -> None:
    save_snapshot(
        "analyze", session.result, session.message_history, session.backend, turns=session.turns
    )


def _on_clean_success(session: AgentSession) -> None:
    save_snapshot("clean", session.result, session.message_history, session.backend)

    overview_id = str(uuid.uuid4())[:8]
    overview_sandbox = Sandbox(data_dir=config.DATA_DIR, db_path=config.DB_PATH)
    overview_session = AgentSession(overview_sandbox, make_analyze_agent())
    ANALYZE_SESSIONS[overview_id] = overview_session
    _start_run(overview_session, OVERVIEW_PROMPT, on_success=_save_analyze_snapshot)
    session.overview_session_id = overview_id


class ChatRequest(BaseModel):
    message: str


@app.post("/api/clean/start")
async def clean_start():
    session_id = str(uuid.uuid4())[:8]
    sandbox = Sandbox(data_dir=config.DATA_DIR, db_path=config.DB_PATH)
    session = AgentSession(sandbox, make_clean_agent())
    CLEAN_SESSIONS[session_id] = session
    _start_run(
        session,
        "Clean the data in DATA_DIR and write the canonical tables to DB_PATH.",
        on_success=_on_clean_success,
    )
    return {"session_id": session_id, **session.to_status_dict()}


@app.get("/api/clean/snapshots")
async def clean_snapshots():
    """All previously-completed clean runs, newest first. Lets a demo pick a
    known-good result instead of re-running the agent live."""
    return {"snapshots": list_snapshots("clean", "summary")}


@app.post("/api/clean/snapshots/{snapshot_id}/load")
async def clean_load_snapshot(snapshot_id: str):
    snapshot = load_snapshot("clean", snapshot_id, CleaningResult)
    if not snapshot:
        raise HTTPException(404, "snapshot not found")

    session_id = str(uuid.uuid4())[:8]
    sandbox = Sandbox(data_dir=config.DATA_DIR, db_path=config.DB_PATH)
    session = AgentSession(sandbox, make_clean_agent())
    session.message_history = snapshot["message_history"]
    session.result = snapshot["result"]
    session.backend = snapshot["backend"]
    session.status = "done"
    session.finished_at = session.started_at
    CLEAN_SESSIONS[session_id] = session

    # Also surface the most recent saved overview, if any, so loading a past
    # clean snapshot doesn't leave Explore empty.
    overview_snapshots = list_snapshots("analyze", "markdown")
    if overview_snapshots:
        overview_snapshot = load_snapshot("analyze", overview_snapshots[0]["id"], AnalysisResult)
        overview_id = str(uuid.uuid4())[:8]
        overview_sandbox = Sandbox(data_dir=config.DATA_DIR, db_path=config.DB_PATH)
        overview_session = AgentSession(overview_sandbox, make_analyze_agent())
        overview_session.message_history = overview_snapshot["message_history"]
        overview_session.result = overview_snapshot["result"]
        overview_session.backend = overview_snapshot["backend"]
        overview_session.turns = overview_snapshot["turns"] or [
            {
                "question": None,
                "result": overview_snapshot["result"],
                "backend": overview_snapshot["backend"],
            }
        ]
        overview_session.status = "done"
        overview_session.finished_at = overview_session.started_at
        ANALYZE_SESSIONS[overview_id] = overview_session
        session.overview_session_id = overview_id

    return {"session_id": session_id, **session.to_status_dict()}


@app.get("/api/clean/{session_id}/status")
async def clean_status(session_id: str):
    session = CLEAN_SESSIONS.get(session_id)
    if not session:
        raise HTTPException(404, "session not found")
    return session.to_status_dict()


@app.post("/api/clean/{session_id}/message")
async def clean_message(session_id: str, req: ChatRequest):
    session = CLEAN_SESSIONS.get(session_id)
    if not session:
        raise HTTPException(404, "session not found")
    if session.status == "running":
        raise HTTPException(409, "a run is already in progress for this session")
    session.status = "running"
    session.started_at = time.monotonic()
    session.finished_at = None
    _start_run(session, req.message, on_success=_on_clean_success)
    return session.to_status_dict()


@app.post("/api/clean/{session_id}/cancel")
async def clean_cancel(session_id: str):
    session = CLEAN_SESSIONS.get(session_id)
    if not session:
        raise HTTPException(404, "session not found")
    await _cancel_session(session)
    return session.to_status_dict()


@app.post("/api/overview/regenerate")
async def overview_regenerate():
    """Re-runs just the Analyze agent's overview pass against the existing
    cleaned data, without re-running Clean. Useful once the overview prompt
    or blocks improve and an old saved overview looks stale."""
    overview_id = str(uuid.uuid4())[:8]
    sandbox = Sandbox(data_dir=config.DATA_DIR, db_path=config.DB_PATH)
    session = AgentSession(sandbox, make_analyze_agent())
    ANALYZE_SESSIONS[overview_id] = session
    _start_run(session, OVERVIEW_PROMPT, on_success=_save_analyze_snapshot)
    return {"session_id": overview_id, **session.to_status_dict()}


@app.post("/api/analyze/start")
async def analyze_start(req: ChatRequest):
    session_id = str(uuid.uuid4())[:8]
    sandbox = Sandbox(data_dir=config.DATA_DIR, db_path=config.DB_PATH)
    session = AgentSession(sandbox, make_analyze_agent())
    ANALYZE_SESSIONS[session_id] = session
    _start_run(session, req.message, on_success=_save_analyze_snapshot, display_question=req.message)
    return {"session_id": session_id, **session.to_status_dict()}


@app.get("/api/analyze/{session_id}/status")
async def analyze_status(session_id: str):
    session = ANALYZE_SESSIONS.get(session_id)
    if not session:
        raise HTTPException(404, "session not found")
    return session.to_status_dict()


@app.post("/api/analyze/{session_id}/message")
async def analyze_message(session_id: str, req: ChatRequest):
    session = ANALYZE_SESSIONS.get(session_id)
    if not session:
        raise HTTPException(404, "session not found")
    if session.status == "running":
        raise HTTPException(409, "a run is already in progress for this session")
    session.status = "running"
    session.started_at = time.monotonic()
    session.finished_at = None
    _start_run(session, req.message, on_success=_save_analyze_snapshot, display_question=req.message)
    return session.to_status_dict()


@app.post("/api/analyze/{session_id}/cancel")
async def analyze_cancel(session_id: str):
    session = ANALYZE_SESSIONS.get(session_id)
    if not session:
        raise HTTPException(404, "session not found")
    await _cancel_session(session)
    return session.to_status_dict()
