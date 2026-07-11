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

import random
from dataclasses import dataclass
from typing import List, Optional, Sequence

from .candles import Candle
from .execution import Executor, PaperExecutor
from .portfolio import Portfolio, Trade
from .risk import RiskManager
from .sizing import Sizer
from .strategy import Signal, Strategy
from .wallet import WalletManager


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
        risk: Optional[RiskManager] = None,
        wallet: Optional[WalletManager] = None,
        stake_jitter: float = 0.0,
        rng: Optional[random.Random] = None,
    ) -> None:
        if not 0.0 <= stake_jitter < 1.0:
            raise ValueError("stake_jitter must be in [0, 1)")
        self.strategy = strategy
        self.sizer = sizer
        self.portfolio = portfolio
        self.executor = executor or PaperExecutor()
        self.min_stake = min_stake
        self.risk = risk
        self.wallet = wallet
        self.stake_jitter = stake_jitter
        self._rng = rng or random.Random()

        self._history: List[Candle] = []
        self._pending: Optional[_PendingBet] = None
        self._last_won: Optional[bool] = None
        self.last_halt_reason: Optional[str] = None

    @property
    def history(self) -> Sequence[Candle]:
        return self._history

    @property
    def halted(self) -> bool:
        """True if the risk layer is currently blocking new bets."""
        return self.risk is not None and self.risk.killed

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
            if self.risk is not None:
                self.risk.post_settlement(candle.open_time, trade.pnl)
            if self.wallet is not None:
                self.wallet.record(candle.open_time, trade.pnl)
            # Stateful strategies (AlternationMartingale) track their own step.
            on_result = getattr(self.strategy, "on_result", None)
            if on_result is not None:
                on_result(won)

        # 2. Record history and ask the strategy what to do next.
        self._history.append(candle)
        next_open_time = candle.close_time  # the next candle opens when this one closes
        if self.wallet is not None:
            self.wallet.advance(next_open_time)  # rotate the active wallet on a new day

        signal = self.strategy.decide(self._history)
        if signal is Signal.NONE:
            return

        # 3. Size the bet, then run it past the risk layer (which can clamp or block).
        stake = self.sizer.next_stake(self.portfolio.balance, self._last_won)
        if self.stake_jitter:
            stake *= 1.0 + self._rng.uniform(-self.stake_jitter, self.stake_jitter)
        stake = min(stake, self.portfolio.balance)

        if self.risk is not None:
            decision = self.risk.pre_trade(next_open_time, self.portfolio.balance, stake)
            if not decision.allowed:
                self.last_halt_reason = decision.reason
                self._notify_rejected()
                return  # risk layer blocked this bet
            stake = decision.stake

        if stake < self.min_stake:
            self._notify_rejected()
            return  # not enough balance to keep going

        # 4. Get the payout quote. Executors with a `quote()` (real live odds)
        #    may return None — no real price, no bet. Never a fake default.
        quote = getattr(self.executor, "quote", None)
        if quote is not None:
            payout = quote(signal)
            if payout is None:
                self.last_halt_reason = "no_quote"
                self._notify_rejected()
                return
        else:
            payout = getattr(self.executor, "payout_multiple", 1.95)
        trade = Trade(
            candle_open_time=next_open_time,
            signal=signal,
            stake=stake,
            payout_multiple=payout,
            entry_price=round(candle.close, 4),
        )
        self.portfolio.open_trade(trade)
        self.executor.place(signal, stake, next_open_time)
        if self.risk is not None:
            self.risk.register_trade(next_open_time)
        self._pending = _PendingBet(trade=trade, signal=signal)

    def void_pending(self) -> None:
        """Refund the open bet after a feed gap (its outcome candle was never seen)
        and clear stateful strategy state — the same rule as the phone app."""
        if self._pending is not None:
            self.portfolio.void_trade(self._pending.trade)
            self._pending = None
        reset = getattr(self.strategy, "reset", None)
        if reset is not None:
            reset()

    def _notify_rejected(self) -> None:
        """Tell a stateful strategy its signal did not become a bet."""
        hook = getattr(self.strategy, "on_bet_rejected", None)
        if hook is not None:
            hook()

    def run(self, candles: Sequence[Candle]) -> Portfolio:
        """Feed a batch of candles in order; returns the portfolio."""
        for candle in candles:
            self.on_candle(candle)
        return self.portfolio
