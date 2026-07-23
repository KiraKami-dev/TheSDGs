"""Builds the shared model used by both agents. Default (YSI_MODEL_BACKEND=qwen):
Qwen 3.6 35B on ada (via an SSH-tunneled Ollama server) first, Claude Haiku as
an automatic fallback if the tunnel/model is unreachable or errors, keeping
Claude API spend to just this coding session, not the app. Set
YSI_MODEL_BACKEND=claude to skip ada and use Claude directly, e.g. when ada
is slow or unavailable.
"""

from pydantic_ai.models import Model
from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.models.fallback import FallbackModel
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.settings import ModelSettings

from ysi import config

# Bounds two things at once: a demo never hangs on a stuck/overloaded Qwen
# call (it errors out and FallbackModel switches to Claude), and cancelling a
# run can't be stuck waiting on a single call for minutes. Cancellation only
# takes effect at the next checkpoint, so this caps how long that wait is.
QWEN_TIMEOUT_SECONDS = 90.0


def build_model() -> Model:
    claude = AnthropicModel(config.ANTHROPIC_FALLBACK_MODEL)
    if config.MODEL_BACKEND == "claude":
        return claude
    qwen = OpenAIChatModel(
        config.OLLAMA_MODEL,
        provider=OpenAIProvider(base_url=config.OLLAMA_BASE_URL, api_key="ollama"),
        settings=ModelSettings(timeout=QWEN_TIMEOUT_SECONDS),
    )
    return FallbackModel(qwen, claude)
