"""Persistent Python execution environment the agents use as their one tool.

State (variables, dataframes, open connections) survives across calls within
a session, so an agent can build things up incrementally across multiple
tool calls and across a whole chat conversation, not just one shot.
"""

import contextlib
import io
import traceback

MAX_OUTPUT_CHARS = 6000


class Sandbox:
    def __init__(self, data_dir: str, db_path: str):
        import duckdb
        import pandas as pd

        self.namespace: dict = {
            "pd": pd,
            "duckdb": duckdb,
            "DATA_DIR": data_dir,
            "DB_PATH": db_path,
        }
        self.history: list[dict] = []
        self.progress: list[str] = []

    def report(self, message: str) -> str:
        self.progress.append(message)
        return "ok"

    def _auto_progress(self, code: str) -> None:
        """The model doesn't reliably call report_progress on its own, but its
        run_python code almost always opens with a plain-language comment
        (e.g. "# Verify BRA file orgs"): use that as a fallback narration so
        the feed stays fresh even when it forgets to narrate explicitly."""
        for line in code.splitlines():
            stripped = line.strip()
            if stripped.startswith("#") and len(stripped) > 2:
                self.progress.append(stripped.lstrip("#").strip())
                return

    def run(self, code: str) -> str:
        self._auto_progress(code)
        buf = io.StringIO()
        try:
            with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
                exec(code, self.namespace)  # noqa: S102 (intentional: this IS the agent's tool)
        except Exception:
            buf.write("\n" + traceback.format_exc())
        output = buf.getvalue()
        self.history.append({"code": code, "output": output})
        if len(output) > MAX_OUTPUT_CHARS:
            half = MAX_OUTPUT_CHARS // 2
            output = output[:half] + "\n...[truncated]...\n" + output[-half:]
        return output.strip() or "(no output, use print() to see results)"
