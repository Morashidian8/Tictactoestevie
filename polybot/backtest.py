"""Backtest a strategy over historical candles.

Usage:
    python -m polybot.backtest --interval 5m --limit 500 --balance 100 --stake 1

With no network access (e.g. CI) pass --demo to run on a synthetic candle series.
"""

from __future__ import annotations

import argparse
import random
from typing import List

from .candles import Candle
from .engine import TradingEngine
from .execution import PaperExecutor
from .portfolio import Portfolio
from .sizing import MartingaleSizer
from .strategy import RuleStrategy, SameColorStrategy


def synthetic_candles(n: int, *, seed: int = 0, start: float = 100.0) -> List[Candle]:
    """Generate a random-walk candle series for offline testing/demo."""
    rng = random.Random(seed)
    candles: List[Candle] = []
    price = start
    t = 0
    for _ in range(n):
        o = price
        c = o + rng.uniform(-1.0, 1.0)
        hi = max(o, c) + rng.uniform(0, 0.5)
        lo = min(o, c) - rng.uniform(0, 0.5)
        candles.append(Candle(open_time=t, close_time=t + 300, open=o, high=hi, low=lo, close=c))
        price = c
        t += 300
    return candles


def run_backtest(candles, strategy, *, balance: float, base_stake: float) -> Portfolio:
    portfolio = Portfolio(starting_balance=balance)
    sizer = MartingaleSizer(base_stake=base_stake, max_steps=6)
    engine = TradingEngine(strategy, sizer, portfolio, PaperExecutor())
    return engine.run(candles)


def main(argv=None) -> None:
    p = argparse.ArgumentParser(description="Backtest a PolyBot strategy.")
    p.add_argument("--interval", default="5m", choices=("5m", "15m", "1h", "1d"))
    p.add_argument("--limit", type=int, default=500)
    p.add_argument("--balance", type=float, default=100.0)
    p.add_argument("--stake", type=float, default=1.0)
    p.add_argument("--min-streak", type=int, default=1)
    p.add_argument("--demo", action="store_true", help="use synthetic candles (no network)")
    args = p.parse_args(argv)

    if args.demo:
        candles = synthetic_candles(args.limit)
    else:  # pragma: no cover - needs network
        from .candles import fetch_binance_candles
        candles = fetch_binance_candles(interval=args.interval, limit=args.limit)

    strategy = SameColorStrategy(min_streak=args.min_streak)
    portfolio = run_backtest(candles, strategy, balance=args.balance, base_stake=args.stake)

    print(f"Strategy : {strategy.name} (min_streak={args.min_streak}), martingale sizing")
    print(f"Candles  : {len(candles)} @ {args.interval}")
    for k, v in portfolio.summary().items():
        print(f"  {k:18}: {v}")


if __name__ == "__main__":  # pragma: no cover
    main()
