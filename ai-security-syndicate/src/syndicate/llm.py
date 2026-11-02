"""LLM access layer.

Agents only see the ``StructuredLLM`` protocol: give it a system prompt, a user
prompt and a Pydantic schema, get a validated instance back. ``AnthropicLLM``
is the production implementation; ``FakeLLM`` drives the tests offline.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Protocol, TypeVar

import yaml
from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)

DEFAULT_CONFIG = Path(__file__).resolve().parents[2] / "config" / "models.yaml"


class LLMError(RuntimeError):
    pass


class StructuredLLM(Protocol):
    def structured(self, *, role: str, system: str, user: str, schema: type[T]) -> T: ...


@dataclass
class RoleConfig:
    model: str
    effort: str = "high"
    max_tokens: int = 64000


def load_role_configs(path: Path | str = DEFAULT_CONFIG) -> dict[str, RoleConfig]:
    data = yaml.safe_load(Path(path).read_text())
    default = data.get("default", {})
    roles = {"default": RoleConfig(**default)}
    for name, cfg in (data.get("roles") or {}).items():
        roles[name] = RoleConfig(**{**default, **(cfg or {})})
    return roles


class AnthropicLLM:
    """Claude via the official SDK, with schema-enforced structured outputs.

    Uses adaptive thinking (always on for current Opus), per-role effort,
    streaming-friendly token limits and the server-side refusal fallback.
    """

    def __init__(self, roles: dict[str, RoleConfig] | None = None, client=None):
        import anthropic

        self.roles = roles or load_role_configs()
        self.client = client or anthropic.Anthropic()

    def _cfg(self, role: str) -> RoleConfig:
        return self.roles.get(role, self.roles["default"])

    def structured(self, *, role: str, system: str, user: str, schema: type[T]) -> T:
        import anthropic

        cfg = self._cfg(role)
        try:
            with self.client.beta.messages.stream(
                model=cfg.model,
                max_tokens=cfg.max_tokens,
                system=system,
                messages=[{"role": "user", "content": user}],
                output_format=schema,
                output_config={"effort": cfg.effort},
                thinking={"type": "adaptive"},
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            ) as stream:
                response = stream.get_final_message()
        except anthropic.RateLimitError as e:
            raise LLMError(f"[{role}] rate limited: {e.message}") from e
        except anthropic.APIStatusError as e:
            raise LLMError(f"[{role}] API error {e.status_code}: {e.message}") from e
        except anthropic.APIConnectionError as e:
            raise LLMError(f"[{role}] connection error: {e}") from e

        if response.stop_reason == "refusal":
            cat = getattr(response.stop_details, "category", None) if response.stop_details else None
            raise LLMError(f"[{role}] model refused (category={cat})")
        if response.stop_reason == "max_tokens":
            raise LLMError(f"[{role}] output truncated at max_tokens={cfg.max_tokens}")
        parsed = response.parsed_output
        if parsed is None:
            raise LLMError(f"[{role}] no structured output returned")
        return parsed


@dataclass
class FakeLLM:
    """Deterministic test double: ``responders[role](system, user) -> model``."""

    responders: dict[str, Callable[[str, str], BaseModel]]
    calls: list[tuple[str, str]] = field(default_factory=list)

    def structured(self, *, role: str, system: str, user: str, schema: type[T]) -> T:
        self.calls.append((role, user))
        result = self.responders[role](system, user)
        return schema.model_validate(result.model_dump())
