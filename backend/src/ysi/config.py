import os
from pathlib import Path

from dotenv import load_dotenv

# Explicit path only: load_dotenv() with no path walks up parent directories
# looking for *any* .env, which in this project tree would find the
# unrelated ~/Downloads/.env instead of this project's own.
_PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(_PROJECT_ROOT / ".env")

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "").strip()
ANTHROPIC_FALLBACK_MODEL = os.environ.get("ANTHROPIC_FALLBACK_MODEL", "claude-haiku-4-5-20251001")

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434/v1")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen3.6:35b")

# "qwen" (default): Qwen on ada first, Claude as fallback if ada is unreachable.
# "claude": skip ada entirely and use Claude directly. Faster when ada is slow/unavailable.
MODEL_BACKEND = os.environ.get("YSI_MODEL_BACKEND", "qwen").strip().lower()

DATA_DIR = os.environ.get("AURELIA_DATA_DIR", "data/raw")
DB_PATH = os.environ.get("YSI_DB_PATH", "data/processed/ysi.duckdb")


def have_api_key() -> bool:
    return bool(ANTHROPIC_API_KEY)
