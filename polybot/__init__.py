"""PolyBot — strategy-driven Bitcoin up/down trading bot for Polymarket.

See PLAN.md for architecture and decisions. The paper-trading core has no
external dependencies beyond `requests` (only used for the live candle feed);
the strategy/sizing/engine logic is pure Python and fully unit-tested.
"""

from .candles import Candle, Color
from .strategy import Signal, Strategy, SameColorStrategy, RuleStrategy
from .sizing import FixedSizer, MartingaleSizer, PercentSizer
from .portfolio import Portfolio, Trade
from .execution import PaperExecutor
from .engine import TradingEngine

__all__ = [
    "Candle",
    "Color",
    "Signal",
    "Strategy",
    "SameColorStrategy",
    "RuleStrategy",
    "FixedSizer",
    "MartingaleSizer",
    "PercentSizer",
    "Portfolio",
    "Trade",
    "PaperExecutor",
    "TradingEngine",
]
