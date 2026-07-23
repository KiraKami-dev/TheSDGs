"""Persists completed agent runs to disk so a demo can load a known-good
result instantly instead of re-running an agent live. Each successful run
gets its own timestamped snapshot, nothing is overwritten, so you can go
back to an earlier version if a later run made things worse.

The DuckDB the Clean Agent writes to already survives on its own; this
additionally saves the structured result text and the pydantic-ai message
history so chat can keep going against a reloaded snapshot without
restarting the conversation.
"""

import json
import time
from pathlib import Path
from typing import Any

from pydantic import BaseModel
from pydantic_ai.messages import ModelMessagesTypeAdapter

BASE_DIR = Path("data/processed/snapshots")


def _dir_for(kind: str) -> Path:
    return BASE_DIR / kind


def save_snapshot(
    kind: str, result: BaseModel, message_history, backend: str, turns: list[dict] | None = None
) -> str:
    snapshot_id = time.strftime("%Y%m%d-%H%M%S")
    snapshot = {
        "id": snapshot_id,
        "created_at": time.time(),
        "result": result.model_dump(),
        "backend": backend,
        "message_history_json": ModelMessagesTypeAdapter.dump_json(message_history).decode(),
        "turns": (
            [
                {
                    "question": t["question"],
                    "result": t["result"].model_dump() if t["result"] else None,
                    "backend": t["backend"],
                }
                for t in turns
            ]
            if turns
            else None
        ),
    }
    directory = _dir_for(kind)
    directory.mkdir(parents=True, exist_ok=True)
    (directory / f"{snapshot_id}.json").write_text(json.dumps(snapshot))
    return snapshot_id


def list_snapshots(kind: str, summary_field: str) -> list[dict]:
    directory = _dir_for(kind)
    if not directory.exists():
        return []
    out = []
    for f in sorted(directory.glob("*.json"), reverse=True):
        data = json.loads(f.read_text())
        out.append(
            {
                "id": data["id"],
                "created_at": data["created_at"],
                "summary": data["result"].get(summary_field, ""),
            }
        )
    return out


def load_snapshot(kind: str, snapshot_id: str, result_type: type[BaseModel]) -> dict[str, Any] | None:
    path = _dir_for(kind) / f"{snapshot_id}.json"
    if not path.exists():
        return None
    data = json.loads(path.read_text())
    turns_raw = data.get("turns")
    turns = (
        [
            {
                "question": t["question"],
                "result": result_type.model_validate(t["result"]) if t["result"] else None,
                "backend": t["backend"],
            }
            for t in turns_raw
        ]
        if turns_raw
        else None
    )
    return {
        "result": result_type.model_validate(data["result"]),
        "backend": data["backend"],
        "message_history": ModelMessagesTypeAdapter.validate_json(data["message_history_json"]),
        "turns": turns,
    }
