"""Configuration loading.

One YAML file holds every tunable; environment variables override it; secrets
only ever come from the environment and never from the file. `Settings.load`
is the only way any component learns a parameter, so a backtest sweep can
re-run the identical code under a different YAML and nothing has to be
threaded through by hand.

Unknown keys are an error, not a shrug. A typo'd `min_edge` that silently keeps
the default is a strategy running on settings nobody chose.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field, fields, is_dataclass
from pathlib import Path
from typing import Any, get_args, get_origin, get_type_hints

import yaml

DEFAULT_CONFIG = Path(__file__).with_name("default.yaml")


@dataclass
class BinanceConfig:
    enabled: bool = True
    host: str = "wss://data-stream.binance.vision"
    symbols: list[str] = field(default_factory=lambda: ["BTCUSDT"])
    depth_levels: int = 20
    depth_speed_ms: int = 100
    time_unit: str = "MICROSECOND"
    stale_after_s: float = 10.0
    weight: float = 0.5


@dataclass
class OKXConfig:
    enabled: bool = True
    url: str = "wss://ws.okx.com:8443/ws/v5/public"
    inst_ids: list[str] = field(default_factory=lambda: ["BTC-USDT"])
    channels: list[str] = field(default_factory=lambda: ["books5", "trades"])
    stale_after_s: float = 10.0
    weight: float = 0.3


@dataclass
class CoinbaseConfig:
    enabled: bool = True
    url: str = "wss://ws-feed.exchange.coinbase.com"
    product_ids: list[str] = field(default_factory=lambda: ["BTC-USD"])
    channels: list[str] = field(default_factory=lambda: ["ticker", "matches"])
    stale_after_s: float = 15.0
    weight: float = 0.2


@dataclass
class ExchangesConfig:
    binance: BinanceConfig = field(default_factory=BinanceConfig)
    okx: OKXConfig = field(default_factory=OKXConfig)
    coinbase: CoinbaseConfig = field(default_factory=CoinbaseConfig)

    def weights(self) -> dict[str, float]:
        """Normalised reference-price weights over the *enabled* venues.

        Normalising here means disabling a venue does not silently shrink the
        reference price toward zero.
        """
        raw = {
            "binance": self.binance.weight if self.binance.enabled else 0.0,
            "okx": self.okx.weight if self.okx.enabled else 0.0,
            "coinbase": self.coinbase.weight if self.coinbase.enabled else 0.0,
        }
        total = sum(raw.values())
        if total <= 0:
            return {k: 0.0 for k in raw}
        return {k: v / total for k, v in raw.items()}


@dataclass
class PolymarketConfig:
    enabled: bool = True
    ws_url: str = "wss://ws-subscriptions-clob.polymarket.com/ws/market"
    gamma_url: str = "https://gamma-api.polymarket.com"
    clob_url: str = "https://clob.polymarket.com"
    window_seconds: list[int] = field(default_factory=lambda: [300, 900])
    discovery_refresh_s: float = 20.0
    http_timeout_s: float = 6.0
    stale_after_s: float = 120.0
    keepalive_interval_s: float = 30.0


@dataclass
class ReferencePriceConfig:
    max_divergence_bps: float = 25.0
    divergence_grace_s: float = 2.0
    min_sources: int = 2


@dataclass
class BusConfig:
    queue_maxsize: int = 100_000


@dataclass
class RecorderConfig:
    enabled: bool = False
    root: str = "data/raw"
    flush_interval_s: float = 5.0
    partition_by: list[str] = field(default_factory=lambda: ["date", "venue"])


@dataclass
class LoggingConfig:
    level: str = "INFO"


@dataclass
class Secrets:
    """Credentials. Loaded from the environment only — never from YAML, never
    logged, never included in `Settings.to_dict()`."""

    polymarket_private_key: str | None = None
    clob_api_key: str | None = None
    clob_secret: str | None = None
    clob_passphrase: str | None = None
    telegram_bot_token: str | None = None
    telegram_chat_id: str | None = None

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> "Secrets":
        env = env if env is not None else dict(os.environ)
        return cls(
            polymarket_private_key=env.get("POLYMARKET_PRIVATE_KEY") or None,
            clob_api_key=env.get("CLOB_API_KEY") or None,
            clob_secret=env.get("CLOB_SECRET") or None,
            clob_passphrase=env.get("CLOB_PASSPHRASE") or None,
            telegram_bot_token=env.get("TELEGRAM_BOT_TOKEN") or None,
            telegram_chat_id=env.get("TELEGRAM_CHAT_ID") or None,
        )

    def __repr__(self) -> str:  # pragma: no cover - trivial, but load-bearing
        """Never render a secret. A stack trace is not a safe place for a key."""
        present = [f.name for f in fields(self) if getattr(self, f.name)]
        return f"Secrets(set={present})"


@dataclass
class Settings:
    mode: str = "record"
    exchanges: ExchangesConfig = field(default_factory=ExchangesConfig)
    polymarket: PolymarketConfig = field(default_factory=PolymarketConfig)
    reference_price: ReferencePriceConfig = field(default_factory=ReferencePriceConfig)
    bus: BusConfig = field(default_factory=BusConfig)
    recorder: RecorderConfig = field(default_factory=RecorderConfig)
    logging: LoggingConfig = field(default_factory=LoggingConfig)
    secrets: Secrets = field(default_factory=Secrets)

    @classmethod
    def load(
        cls,
        path: str | Path | None = None,
        *,
        env: dict[str, str] | None = None,
    ) -> "Settings":
        path = Path(path) if path else DEFAULT_CONFIG
        data = yaml.safe_load(path.read_text()) or {}
        settings = _build(cls, data, "")
        settings.secrets = Secrets.from_env(env)
        _apply_env_overrides(settings, env if env is not None else dict(os.environ))
        return settings

    def to_dict(self) -> dict[str, Any]:
        """Serialisable view, with secrets omitted. Safe to log."""
        return _dump(self, skip={"secrets"})


def _build(cls: type, data: Any, path: str):
    """Recursively construct a dataclass from plain YAML data."""
    if not is_dataclass(cls):
        return data
    if data is None:
        return cls()
    if not isinstance(data, dict):
        raise TypeError(f"{path or 'config'}: expected a mapping, got {type(data).__name__}")

    # `from __future__ import annotations` turns every field type into a
    # string, so resolve them before asking whether one is a dataclass.
    hints = get_type_hints(cls)
    known = {f.name: f for f in fields(cls)}
    unknown = set(data) - set(known)
    if unknown:
        raise ValueError(
            f"{path or 'config'}: unknown setting(s) {sorted(unknown)}. "
            "A typo'd key that silently keeps the default is worse than a crash."
        )
    kwargs: dict[str, Any] = {}
    for name, value in data.items():
        field_type = hints.get(name, known[name].type)
        child_path = f"{path}.{name}" if path else name
        if is_dataclass(field_type):
            kwargs[name] = _build(field_type, value, child_path)
        else:
            kwargs[name] = _coerce(field_type, value, child_path)
    return cls(**kwargs)


def _coerce(field_type: Any, value: Any, path: str) -> Any:
    """Light type coercion, enough to keep YAML's int/float ambiguity out of
    the arithmetic later (a `stale_after_s: 10` that stays an int is harmless;
    a `weight: 1` that stays an int is not, once it is divided)."""
    origin = get_origin(field_type)
    if origin is list:
        if not isinstance(value, list):
            raise TypeError(f"{path}: expected a list")
        (inner,) = get_args(field_type) or (Any,)
        return [_coerce(inner, item, path) for item in value]
    if field_type is float and isinstance(value, (int, float)):
        return float(value)
    if field_type is int and isinstance(value, bool):
        raise TypeError(f"{path}: expected an int, got a bool")
    return value


def _dump(obj: Any, skip: set[str] | None = None) -> Any:
    if is_dataclass(obj):
        return {
            f.name: _dump(getattr(obj, f.name))
            for f in fields(obj)
            if not (skip and f.name in skip)
        }
    if isinstance(obj, list):
        return [_dump(item) for item in obj]
    return obj


#: Environment overrides for the handful of settings an operator flips without
#: editing the file. Deliberately short: a config surface that can be changed
#: from anywhere is a config surface nobody can reconstruct after the fact.
_ENV_OVERRIDES: dict[str, tuple[str, ...]] = {
    "BOT_MODE": ("mode",),
    "LOG_LEVEL": ("logging", "level"),
    "RECORDER_ENABLED": ("recorder", "enabled"),
    "RECORDER_ROOT": ("recorder", "root"),
    "POLYMARKET_WS_URL": ("polymarket", "ws_url"),
    "GAMMA_URL": ("polymarket", "gamma_url"),
    "CLOB_URL": ("polymarket", "clob_url"),
}


def _apply_env_overrides(settings: Settings, env: dict[str, str]) -> None:
    for key, target_path in _ENV_OVERRIDES.items():
        if key not in env or env[key] == "":
            continue
        target: Any = settings
        for part in target_path[:-1]:
            target = getattr(target, part)
        attribute = target_path[-1]
        current = getattr(target, attribute)
        raw = env[key]
        if isinstance(current, bool):
            value: Any = raw.strip().lower() in ("1", "true", "yes", "on")
        elif isinstance(current, int) and not isinstance(current, bool):
            value = int(raw)
        elif isinstance(current, float):
            value = float(raw)
        else:
            value = raw
        setattr(target, attribute, value)
