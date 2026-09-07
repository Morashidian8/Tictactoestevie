"""Timestamps.

Every event carries three of them, and the difference between them is the only
honest measure of how stale a signal is by the time it could have been traded:

    exchange_ts_ns   what the venue says (its own clock, and it can lie)
    recv_ts_ns       when the bytes arrived here
    proc_ts_ns       when this process finished turning them into an event

Only the last two share a clock, so only their difference is trustworthy in
isolation. The exchange-to-local gap mixes in clock skew and must be treated as
an estimate, never as a measurement — see `Skew`.

`time.time_ns()` is the wall clock: comparable across machines, but it can step
backwards when NTP corrects it. `time.perf_counter_ns()` never steps but has an
arbitrary origin. Durations use the monotonic clock; anything stored or compared
against a venue's timestamp uses the wall clock.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field

NS_PER_US = 1_000
NS_PER_MS = 1_000_000
NS_PER_S = 1_000_000_000


def now_ns() -> int:
    """Wall-clock nanoseconds since the epoch.

    Resolution is whatever the platform offers (typically ~microseconds on
    Linux); the nanosecond unit is for arithmetic, not a precision claim.
    """
    return time.time_ns()


def mono_ns() -> int:
    """Monotonic nanoseconds. Use for durations, never for storage."""
    return time.perf_counter_ns()


def ms_to_ns(ms: float | int | str) -> int:
    return int(float(ms) * NS_PER_MS)


def us_to_ns(us: float | int | str) -> int:
    return int(float(us) * NS_PER_US)


def s_to_ns(s: float | int | str) -> int:
    return int(float(s) * NS_PER_S)


def ns_to_ms(ns: int) -> float:
    return ns / NS_PER_MS


def parse_epoch_ns(value: float | int | str, unit: str) -> int | None:
    """Venue timestamp -> epoch nanoseconds. None when it is unparseable.

    Venues send epoch times as JSON strings as often as numbers, and in three
    different units. Two details matter more than they look:

    * **Integer input is scaled with integer arithmetic.** A float cannot hold
      an epoch-millisecond value and a 10^6 scale factor without losing the low
      digits — ``float(1740759191594) * 1e6`` lands 128ns off. At millisecond
      inputs that is noise; at microsecond inputs it is the same order as the
      latencies being measured.
    * **A bad timestamp returns None rather than raising.** One malformed field
      must not kill a feed, and the event is then recorded with an unknown
      exchange time, which the staleness checks treat as unknown - not as zero.
    """
    scale = {"ms": NS_PER_MS, "us": NS_PER_US, "s": NS_PER_S, "ns": 1}.get(unit)
    if scale is None:
        raise ValueError(f"unknown timestamp unit {unit!r}")
    try:
        scaled = int(value) * scale
    except (TypeError, ValueError):
        try:
            scaled = int(round(float(value) * scale))
        except (TypeError, ValueError):
            return None
    return scaled if scaled > 0 else None


@dataclass
class Skew:
    """Running estimate of (venue clock - local clock), in nanoseconds.

    Write the observation out and the estimator picks itself. For one message,

        delta = exchange_ts - recv_ts = offset - delay,   delay >= 0

    so every sample *understates* the offset by that message's transport delay,
    and the largest delta seen is the closest approach to the true offset. Hence
    the maximum, not the mean: an average is biased low by exactly the mean
    network delay, which is the quantity we were trying to measure in the first
    place.

    What comes back from `corrected_delay_ns` is therefore delay minus the
    smallest delay ever observed — a *relative* one-way latency, always >= 0.
    It is good enough to rank feeds and to spot a feed falling behind. It is not
    an absolute network delay, and must never be reported as one.
    """

    window: int = 2_000
    _samples: list[int] = field(default_factory=list)
    _max: int | None = None

    def observe(self, exchange_ts_ns: int | None, recv_ts_ns: int) -> None:
        if exchange_ts_ns is None:
            return
        delta = exchange_ts_ns - recv_ts_ns
        self._samples.append(delta)
        if len(self._samples) > self.window:
            # Recompute over the window rather than decaying: an estimate
            # anchored to one lucky packet an hour ago is worse than an O(n)
            # pass every `window` events.
            self._samples = self._samples[-self.window :]
            self._max = max(self._samples)
        elif self._max is None or delta > self._max:
            self._max = delta

    @property
    def offset_ns(self) -> int:
        return self._max or 0

    @property
    def samples(self) -> int:
        return len(self._samples)

    def corrected_delay_ns(self, exchange_ts_ns: int | None, recv_ts_ns: int) -> int | None:
        """Transport delay relative to the fastest message seen. Never negative."""
        if exchange_ts_ns is None:
            return None
        return max(0, recv_ts_ns - exchange_ts_ns + self.offset_ns)
