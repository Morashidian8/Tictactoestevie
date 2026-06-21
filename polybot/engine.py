"""TradingEngine — the loop that ties strategy + sizing + execution + portfolio.

The engine is fed closed candles one at a time (live) or in bulk (backtest).
For each new candle it:

  1. Resolves the bet placed on the *previous* candle against this candle's
     actual colour, updating the portfolio.
  2. Asks the strategy for a signal for the *next* candle.
  3. Sizes the bet and places it (paper or live).

It holds at most one open bet at a time — one bet per candle window — which
matches how the up/down markets work.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Sequence

from .candles import Candle
from .execution import Executor, PaperExecutor
from .portfolio import Portfolio, Trade
from .sizing import Sizer
from .strategy import Signal, Strategy


@dataclass
class _PendingBet:
    trade: Trade
    signal: Signal


class TradingEngine:
    def __init__(
        self,
        strategy: Strategy,
        sizer: Sizer,
        portfolio: Portfolio,
        executor: Optional[Executor] = None,
        *,
        min_stake: float = 1e-6,
    ) -> None:
        self.strategy = strategy
        self.sizer = sizer
        self.portfolio = portfolio
        self.executor = executor or PaperExecutor()
        self.min_stake = min_stake

        self._history: List[Candle] = []
        self._pending: Optional[_PendingBet] = None
        self._last_won: Optional[bool] = None

    @property
    def history(self) -> Sequence[Candle]:
        return self._history

    def on_candle(self, candle: Candle) -> None:
        """Process one newly-closed candle."""
        # 1. Resolve the bet placed after the previous candle — it rode on this one.
        #    Bets are one-per-window and processed in order, so the next candle the
        #    engine sees is always the one a pending bet was predicting.
        if self._pending is not None:
            trade = self._pending.trade
            won = self.executor.resolve(self._pending.signal, candle)
            self.portfolio.settle(trade, won)
            self._last_won = won
            self._pending = None

        # 2. Record history and ask the strategy what to do next.
        self._history.append(candle)
        signal = self.strategy.decide(self._history)
        if signal is Signal.NONE:
            return

        # 3. Size and place the next bet (rides on the *next* candle).
        stake = self.sizer.next_stake(self.portfolio.balance, self._last_won)
        stake = min(stake, self.portfolio.balance)
        if stake < self.min_stake:
            return  # not enough balance to keep going

        payout = getattr(self.executor, "payout_multiple", 1.95)
        next_open_time = candle.close_time  # the next candle opens when this one closes
        trade = Trade(
            candle_open_time=next_open_time,
            signal=signal,
            stake=stake,
            payout_multiple=payout,
        )
        self.portfolio.open_trade(trade)
        self.executor.place(signal, stake, next_open_time)
        self._pending = _PendingBet(trade=trade, signal=signal)

    def run(self, candles: Sequence[Candle]) -> Portfolio:
        """Feed a batch of candles in order; returns the portfolio."""
        for candle in candles:
            self.on_candle(candle)
        return self.portfolio
