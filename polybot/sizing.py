"""Position sizing.

A sizer decides how much to stake on the next bet given the running result
history. The user chose **martingale** (double after a loss); fixed and percent
sizers are included for comparison and safer alternatives.
"""

from __future__ import annotations

from abc import ABC, abstractmethod


class Sizer(ABC):
    @abstractmethod
    def next_stake(self, balance: float, last_won: "bool | None") -> float:
        """Return the stake for the next bet.

        `last_won` is True/False for the previous settled bet, or None at the
        start (no prior bet). The stake is clamped to the available balance by
        the caller, but sizers should also respect their own caps.
        """
        raise NotImplementedError


class FixedSizer(Sizer):
    """Always stake the same amount."""

    def __init__(self, stake: float) -> None:
        if stake <= 0:
            raise ValueError("stake must be positive")
        self.stake = stake

    def next_stake(self, balance: float, last_won):  # noqa: ARG002
        return min(self.stake, balance)


class PercentSizer(Sizer):
    """Stake a fixed percentage of the current balance."""

    def __init__(self, fraction: float) -> None:
        if not 0 < fraction <= 1:
            raise ValueError("fraction must be in (0, 1]")
        self.fraction = fraction

    def next_stake(self, balance: float, last_won):  # noqa: ARG002
        return balance * self.fraction


class MartingaleSizer(Sizer):
    """Double the stake after every loss; reset to base after a win.

    Guard rails (both honest necessities for a martingale):
      - `max_steps`: cap on consecutive doublings. After this many losses the
        stake resets to base instead of growing without bound.
      - `max_stake`: absolute cap on a single stake.
    The current stake never exceeds the available balance (clamped by caller).
    """

    def __init__(
        self,
        base_stake: float,
        *,
        multiplier: float = 2.0,
        max_steps: int = 6,
        max_stake: "float | None" = None,
    ) -> None:
        if base_stake <= 0:
            raise ValueError("base_stake must be positive")
        if multiplier <= 1:
            raise ValueError("multiplier must be > 1")
        if max_steps < 1:
            raise ValueError("max_steps must be >= 1")
        self.base_stake = base_stake
        self.multiplier = multiplier
        self.max_steps = max_steps
        self.max_stake = max_stake
        self._step = 0  # number of consecutive losses so far

    @property
    def step(self) -> int:
        return self._step

    def next_stake(self, balance: float, last_won):
        if last_won is True:
            self._step = 0
        elif last_won is False:
            self._step = min(self._step + 1, self.max_steps)
        # last_won is None -> first bet, keep step at 0.

        stake = self.base_stake * (self.multiplier ** self._step)
        if self.max_stake is not None:
            stake = min(stake, self.max_stake)
        return min(stake, balance)
