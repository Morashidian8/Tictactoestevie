"""Portfolio: balance, trade log, and PnL for paper (and later live) trading."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

from .strategy import Signal


@dataclass
class Trade:
    candle_open_time: int      # the candle this bet is on (also the entry time, unix seconds)
    signal: Signal             # UP or DOWN
    stake: float               # amount risked
    payout_multiple: float     # gross return multiple on a win (e.g. 1.9 -> 0.9 profit)
    entry_price: float = 0.0   # price at the moment the bet was placed
    won: Optional[bool] = None # filled in when the candle resolves
    pnl: float = 0.0           # net profit/loss once resolved

    @property
    def resolved(self) -> bool:
        return self.won is not None


@dataclass
class Portfolio:
    starting_balance: float
    balance: float = field(init=False)
    trades: List[Trade] = field(default_factory=list)

    def __post_init__(self) -> None:
        if self.starting_balance <= 0:
            raise ValueError("starting_balance must be positive")
        self.balance = self.starting_balance

    # -- mutation ---------------------------------------------------------- #

    def open_trade(self, trade: Trade) -> None:
        """Reserve the stake out of the balance and record the open trade."""
        if trade.stake > self.balance + 1e-9:
            raise ValueError("stake exceeds balance")
        self.balance -= trade.stake
        self.trades.append(trade)

    def void_trade(self, trade: Trade) -> None:
        """Cancel an unresolved trade and refund its stake (e.g. after a feed gap:
        the candle the bet was riding on was never observed, so the bet is void)."""
        if trade.resolved:
            raise ValueError("cannot void a settled trade")
        self.balance += trade.stake
        self.trades.remove(trade)

    def settle(self, trade: Trade, won: bool) -> None:
        """Resolve a trade, crediting winnings or booking the loss."""
        if trade.resolved:
            raise ValueError("trade already settled")
        trade.won = won
        if won:
            gross = trade.stake * trade.payout_multiple
            trade.pnl = gross - trade.stake
            self.balance += gross
        else:
            trade.pnl = -trade.stake
            # stake was already removed when the trade opened.

    # -- reporting --------------------------------------------------------- #

    @property
    def resolved_trades(self) -> List[Trade]:
        return [t for t in self.trades if t.resolved]

    @property
    def wins(self) -> int:
        return sum(1 for t in self.resolved_trades if t.won)

    @property
    def losses(self) -> int:
        return sum(1 for t in self.resolved_trades if t.won is False)

    @property
    def open_stake(self) -> float:
        """Stake currently reserved in unresolved bets."""
        return sum(t.stake for t in self.trades if not t.resolved)

    @property
    def equity(self) -> float:
        """Cash balance plus stake reserved in still-open bets."""
        return self.balance + self.open_stake

    @property
    def realised_pnl(self) -> float:
        """PnL from settled trades only (ignores any still-open bet)."""
        return sum(t.pnl for t in self.resolved_trades)

    @property
    def win_rate(self) -> float:
        resolved = self.resolved_trades
        return self.wins / len(resolved) if resolved else 0.0

    def summary(self) -> dict:
        return {
            "starting_balance": round(self.starting_balance, 4),
            "balance": round(self.balance, 4),
            "equity": round(self.equity, 4),
            "realised_pnl": round(self.realised_pnl, 4),
            "trades": len(self.resolved_trades),
            "wins": self.wins,
            "losses": self.losses,
            "win_rate": round(self.win_rate, 4),
        }
