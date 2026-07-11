"""Executors: how a decided bet actually gets placed and resolved.

`PaperExecutor` simulates everything locally against the real next candle.
`PolymarketExecutor` is a documented stub for the future live integration.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from .candles import Candle, Color
from .strategy import Signal


class Executor(ABC):
    @abstractmethod
    def place(self, signal: Signal, stake: float, candle_open_time: int) -> dict:
        """Place a bet. Returns a venue-specific order record."""
        raise NotImplementedError

    @abstractmethod
    def resolve(self, signal: Signal, outcome_candle: Candle) -> bool:
        """Return True if `signal` was correct for the resolved candle."""
        raise NotImplementedError


class PaperExecutor(Executor):
    """Simulated execution.

    `payout_multiple` is the gross multiple returned on a win. On Polymarket the
    effective payout depends on the YES/NO price you pay (a 0.50 price ≈ 2x gross,
    i.e. payout_multiple 2.0). Default 1.95 models a near-even market with a small
    spread. A flat (doji) outcome candle counts as a loss for any directional bet.
    """

    def __init__(self, payout_multiple: float = 1.95) -> None:
        if payout_multiple <= 1:
            raise ValueError("payout_multiple must be > 1 for a directional bet")
        self.payout_multiple = payout_multiple

    def quote(self, signal: Signal) -> "float | None":  # noqa: ARG002
        """Fixed simulated payout; shadow/live executors quote the real market."""
        return self.payout_multiple

    def place(self, signal: Signal, stake: float, candle_open_time: int) -> dict:
        return {
            "venue": "paper",
            "signal": signal.value,
            "stake": stake,
            "candle_open_time": candle_open_time,
        }

    def resolve(self, signal: Signal, outcome_candle: Candle) -> bool:
        color = outcome_candle.color
        if color is Color.NONE:
            return False
        if signal is Signal.UP:
            return color is Color.GREEN
        if signal is Signal.DOWN:
            return color is Color.RED
        return False


class ShadowPolymarketExecutor(PaperExecutor):
    """Shadow mode: paper money, REAL live Polymarket odds.

    Every bet is quoted from the live BTC up/down market for the current
    5-minute window (slug ``btc-updown-5m-<windowStart>``): the payout is
    1 / (real buy price of the chosen outcome token). If the real price cannot
    be fetched (market not listed yet, network down) `quote` returns None and
    the engine skips the bet — there is never a fake fallback price. With
    `max_entry_price` set, bets whose real price is above the cap are skipped
    too (limit mode).

    Money-wise this is identical to `PaperExecutor` — nothing is signed or sent.
    """

    def __init__(
        self,
        data=None,                       # PolymarketData; lazy default (needs network)
        *,
        interval_seconds: int = 300,
        retries: int = 3,
        retry_wait: float = 1.5,
        max_entry_price: "float | None" = None,
        _clock=None,                     # injectable time.time for tests
        _sleep=None,                     # injectable time.sleep for tests
    ) -> None:
        super().__init__(payout_multiple=2.0)  # placeholder; every bet re-quotes
        self._data = data
        self.interval_seconds = interval_seconds
        self.retries = retries
        self.retry_wait = retry_wait
        self.max_entry_price = max_entry_price
        import time as _time
        self._clock = _clock or _time.time
        self._sleep = _sleep or _time.sleep
        self.last_quote_price: "float | None" = None

    def _client(self):
        if self._data is None:  # pragma: no cover - needs network
            from .polymarket import PolymarketData
            self._data = PolymarketData()
        return self._data

    def _window_slug(self) -> str:
        start = int(self._clock() // self.interval_seconds) * self.interval_seconds
        return f"btc-updown-5m-{start}"

    def quote(self, signal: Signal) -> "float | None":
        outcome = "Up" if signal is Signal.UP else "Down"
        for attempt in range(self.retries + 1):
            try:
                markets = self._client().get_markets(slug=self._window_slug())
                if markets:
                    token = markets[0].token_for(outcome)
                    if token:
                        price = self._client().price(token, "buy")
                        if price is not None and 0.0 < price < 1.0:
                            if self.max_entry_price is not None and price > self.max_entry_price:
                                return None  # real price above the limit -> skip
                            self.last_quote_price = price
                            self.payout_multiple = 1.0 / price
                            return self.payout_multiple
            except Exception:  # noqa: BLE001 - treat any failure as "no real price"
                pass
            if attempt < self.retries:
                self._sleep(self.retry_wait)
        return None


class PolymarketExecutor(Executor):
    """Live Polymarket execution — NOT yet implemented (Phase 4).

    Integration points for the real build (via the official `py-clob-client`):

      1. Auth: derive API creds from an EIP-712 signature of the trading wallet
         (the private key lives on the server, never in the app).
      2. Market discovery: find the BTC up/down market whose window matches the
         current candle (token ids for the "Up"/"Down" outcomes).
      3. Place: submit a signed FOK/GTC order on the CLOB for the chosen outcome
         token, sized in USDC; `signal UP -> buy "Up" token`, `DOWN -> "Down"`.
      4. Resolve: read the market resolution (or settle against the oracle's
         up/down result) and report win/loss.

    Until implemented this raises so live mode can never run by accident.
    """

    def place(self, signal: Signal, stake: float, candle_open_time: int) -> dict:
        raise NotImplementedError(
            "Live Polymarket trading is Phase 4. Use PaperExecutor for now."
        )

    def resolve(self, signal: Signal, outcome_candle: Candle) -> bool:
        raise NotImplementedError(
            "Live Polymarket trading is Phase 4. Use PaperExecutor for now."
        )
