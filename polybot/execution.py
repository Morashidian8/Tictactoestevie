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
