import pytest
import yaml

from polymarket_bot.config.settings import Secrets, Settings


def write(tmp_path, data):
    path = tmp_path / "config.yaml"
    path.write_text(yaml.safe_dump(data))
    return path


def test_defaults_load():
    settings = Settings.load()
    assert settings.mode == "record"
    assert settings.polymarket.window_seconds == [300, 900]
    assert settings.exchanges.binance.depth_levels in (5, 10, 20)


def test_unknown_key_is_an_error(tmp_path):
    # A typo'd key that silently keeps the default is a strategy running on
    # settings nobody chose.
    path = write(tmp_path, {"exchanges": {"binance": {"symbol": ["BTCUSDT"]}}})
    with pytest.raises(ValueError, match="unknown setting"):
        Settings.load(path)


def test_weights_are_normalised_over_enabled_venues(tmp_path):
    path = write(tmp_path, {"exchanges": {"coinbase": {"enabled": False}}})
    weights = Settings.load(path).exchanges.weights()
    assert weights["coinbase"] == 0.0
    assert pytest.approx(sum(weights.values())) == 1.0
    assert pytest.approx(weights["binance"], rel=1e-6) == 0.5 / 0.8


def test_env_overrides_are_typed(tmp_path):
    path = write(tmp_path, {"mode": "record"})
    settings = Settings.load(path, env={"BOT_MODE": "paper", "RECORDER_ENABLED": "true"})
    assert settings.mode == "paper"
    assert settings.recorder.enabled is True
    assert Settings.load(path, env={"RECORDER_ENABLED": "0"}).recorder.enabled is False


def test_secrets_come_only_from_the_environment(tmp_path):
    path = write(tmp_path, {"mode": "record"})
    settings = Settings.load(path, env={"POLYMARKET_PRIVATE_KEY": "0xdeadbeef"})
    assert settings.secrets.polymarket_private_key == "0xdeadbeef"
    # ...and never leave it: not in the serialisable view, not in a repr that
    # could end up in a log line or a stack trace.
    assert "secrets" not in settings.to_dict()
    assert "0xdeadbeef" not in repr(settings.secrets)
    assert "polymarket_private_key" in repr(settings.secrets)


def test_absent_secrets_are_none():
    assert Secrets.from_env({}).clob_api_key is None
    assert Secrets.from_env({"CLOB_API_KEY": ""}).clob_api_key is None


def test_live_trading_is_not_reachable_from_config_alone():
    # Phase 1 has no executor at all. This test exists so that whoever adds one
    # has to come here and think about the switch deliberately.
    settings = Settings.load()
    assert settings.mode != "live"
