"""The parts of a WebSocket collector that are the same everywhere.

A venue subclass supplies four things — a URL, the subscribe frames, a parser,
and its keepalive convention — and inherits the connection lifecycle: connect,
subscribe, read, stamp, publish, and reconnect with backoff when any of that
fails.

Two design choices worth stating, because both are load-bearing later:

* **Parsing is a pure function.** `parse` takes a raw frame and a receive
  timestamp and returns events. It touches no socket and no clock, so every
  wire format in this system is testable from a captured payload with no
  network and no mocking. Phase 6's replay engine reuses the same functions.
* **The receive timestamp is taken before anything else happens** to the
  frame — before JSON parsing, before dispatch. Stamping after parsing folds
  our own CPU time into what we later call network latency, and that is exactly
  the number the whole latency-edge question turns on.
"""

from __future__ import annotations

import asyncio
import json
import logging
import random
from abc import ABC, abstractmethod
from dataclasses import dataclass, field

import websockets
from websockets.exceptions import ConnectionClosed

from ..core.bus import EventBus
from ..core.clock import Skew, mono_ns, now_ns, ns_to_ms
from ..core.events import ConnectionEvent, ConnState, MarketEvent, Venue

log = logging.getLogger(__name__)


@dataclass
class CollectorStats:
    messages: int = 0
    events: int = 0
    parse_errors: int = 0
    unknown_messages: int = 0
    connects: int = 0
    disconnects: int = 0
    last_event_ns: int | None = None
    last_message_ns: int | None = None
    connected_since_ns: int | None = None
    #: Running sum/count of local parse cost, for a mean without keeping a list.
    _proc_ns_sum: int = 0
    _proc_ns_count: int = 0

    def observe_parse(self, proc_ns: int) -> None:
        self._proc_ns_sum += proc_ns
        self._proc_ns_count += 1

    @property
    def mean_parse_ms(self) -> float:
        if not self._proc_ns_count:
            return 0.0
        return ns_to_ms(self._proc_ns_sum / self._proc_ns_count)

    def snapshot(self, now: int) -> dict[str, object]:
        age = None if self.last_event_ns is None else ns_to_ms(now - self.last_event_ns)
        return {
            "messages": self.messages,
            "events": self.events,
            "parse_errors": self.parse_errors,
            "unknown": self.unknown_messages,
            "connects": self.connects,
            "disconnects": self.disconnects,
            "last_event_age_ms": age,
            "mean_parse_ms": round(self.mean_parse_ms, 4),
            "connected": self.connected_since_ns is not None,
        }


@dataclass
class BackoffPolicy:
    """Exponential backoff with full jitter.

    Full jitter rather than a fixed sequence on purpose: four collectors that
    all lose a shared uplink and all retry at exactly 1s, 2s, 4s will keep
    colliding, and Binance bans an IP that reconnects too eagerly.
    """

    initial_s: float = 0.5
    max_s: float = 30.0
    factor: float = 2.0

    def delay(self, attempt: int) -> float:
        ceiling = min(self.max_s, self.initial_s * (self.factor ** max(0, attempt - 1)))
        return random.uniform(0.0, ceiling)


class WSCollector(ABC):
    """One WebSocket connection to one venue."""

    venue: Venue

    def __init__(
        self,
        bus: EventBus,
        *,
        name: str | None = None,
        stale_after_s: float = 15.0,
        ping_interval_s: float | None = 20.0,
        keepalive_interval_s: float | None = None,
        recv_timeout_s: float = 30.0,
        backoff: BackoffPolicy | None = None,
        max_queue: int | None = None,
    ) -> None:
        self.bus = bus
        self.name = name or self.venue.value
        self.stats = CollectorStats()
        self.skew = Skew()
        self.backoff = backoff or BackoffPolicy()
        self.stale_after_ns = int(stale_after_s * 1e9)
        # `ping_interval_s` drives the WebSocket protocol ping the library
        # sends. `keepalive_interval_s` drives an application-level text ping,
        # which OKX and Polymarket require instead. They are separate because a
        # venue that ignores protocol pings will still drop us for being idle.
        self.ping_interval_s = ping_interval_s
        self.keepalive_interval_s = keepalive_interval_s or ping_interval_s
        self.recv_timeout_s = recv_timeout_s
        # None lets the library buffer without bound; a bounded queue makes a
        # slow consumer surface as a closed connection instead of as memory
        # growth, which is the failure we can actually detect.
        self.max_queue = max_queue
        self._stop = asyncio.Event()

    # ---- venue-specific -------------------------------------------------

    @abstractmethod
    def url(self) -> str:
        """Endpoint to connect to."""

    def subscribe_frames(self) -> list[str]:
        """Frames to send once connected. Empty when the URL already encodes
        the subscription (Binance combined streams)."""
        return []

    @abstractmethod
    def parse(self, raw: str | bytes, recv_ts_ns: int) -> list[MarketEvent]:
        """Pure: raw frame -> normalized events. No I/O, no clock reads."""

    def keepalive_frame(self) -> str | None:
        """Application-level ping payload, for venues that need one on top of
        (or instead of) the protocol ping. OKX and Polymarket both do."""
        return None

    def is_keepalive_reply(self, raw: str | bytes) -> bool:
        """True for a frame that is only a keepalive answer, so it is not
        counted as data and does not refresh the staleness clock."""
        if isinstance(raw, bytes):
            return False
        return raw.strip().upper() in {"PONG", "PING"}

    # ---- lifecycle ------------------------------------------------------

    def stop(self) -> None:
        self._stop.set()

    def reset(self) -> None:
        """Clear the stop flag so a stopped collector can be run again.

        Used when the Polymarket feed is re-pointed at a new window: the object
        (and its stats) survives, only the connection is replaced.
        """
        self._stop.clear()

    @property
    def stopped(self) -> bool:
        return self._stop.is_set()

    def is_stale(self, now: int | None = None) -> bool:
        """No data for longer than the venue's tolerance.

        A feed that has never delivered anything is stale from the moment it
        connected — otherwise a silent subscription failure looks identical to
        a healthy but quiet market.
        """
        now = now or now_ns()
        reference = self.stats.last_event_ns or self.stats.connected_since_ns
        if reference is None:
            return True
        return (now - reference) > self.stale_after_ns

    async def run(self) -> None:
        """Connect-read-reconnect until `stop()`."""
        attempt = 0
        while not self._stop.is_set():
            attempt += 1
            try:
                await self._session()
                attempt = 0  # a clean session resets the ladder
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 - a collector must never die
                self._emit_state(ConnState.ERROR, f"{type(exc).__name__}: {exc}")
                log.warning("%s: session ended: %s", self.name, exc)
            if self._stop.is_set():
                break
            delay = self.backoff.delay(attempt)
            log.info("%s: reconnecting in %.2fs (attempt %d)", self.name, delay, attempt)
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=delay)
            except asyncio.TimeoutError:
                pass

    async def _session(self) -> None:
        url = self.url()
        self._emit_state(ConnState.CONNECTING, url)
        async with websockets.connect(
            url,
            ping_interval=self.ping_interval_s,
            ping_timeout=self.ping_interval_s,
            max_queue=self.max_queue,
            open_timeout=10,
        ) as ws:
            self.stats.connects += 1
            self.stats.connected_since_ns = now_ns()
            self._emit_state(ConnState.CONNECTED, url)
            for frame in self.subscribe_frames():
                await ws.send(frame)
            self._emit_state(ConnState.SUBSCRIBED, "")
            keepalive = self.keepalive_frame()
            tasks = [asyncio.create_task(self._read_loop(ws))]
            if keepalive is not None:
                tasks.append(asyncio.create_task(self._keepalive_loop(ws, keepalive)))
            try:
                done, pending = await asyncio.wait(
                    tasks, return_when=asyncio.FIRST_COMPLETED
                )
                for task in pending:
                    task.cancel()
                for task in done:
                    task.result()  # re-raise whatever ended the session
            finally:
                self.stats.disconnects += 1
                self.stats.connected_since_ns = None
                self._emit_state(ConnState.DISCONNECTED, "")

    async def _read_loop(self, ws) -> None:
        while not self._stop.is_set():
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=self.recv_timeout_s)
            except asyncio.TimeoutError as exc:
                # Silence past the venue's own heartbeat interval means the
                # connection is gone even though TCP has not noticed. Tear it
                # down rather than sit on a feed that will never speak again.
                raise ConnectionError(
                    f"no frame for {self.recv_timeout_s}s"
                ) from exc
            except ConnectionClosed:
                return
            recv_ts_ns = now_ns()  # first thing. See module docstring.
            self.stats.messages += 1
            self.stats.last_message_ns = recv_ts_ns
            if self.is_keepalive_reply(raw):
                continue
            self._handle(raw, recv_ts_ns)

    def _handle(self, raw: str | bytes, recv_ts_ns: int) -> None:
        started = mono_ns()
        try:
            events = self.parse(raw, recv_ts_ns)
        except Exception as exc:  # noqa: BLE001 - one bad frame is not fatal
            self.stats.parse_errors += 1
            log.debug("%s: parse error: %s: %.200s", self.name, exc, raw)
            return
        self.stats.observe_parse(mono_ns() - started)
        for event in events:
            self.skew.observe(event.exchange_ts_ns, event.recv_ts_ns)
            self.stats.events += 1
            self.stats.last_event_ns = event.recv_ts_ns
            self.bus.publish(event)

    async def _keepalive_loop(self, ws, frame: str) -> None:
        interval = self.keepalive_interval_s or 20.0
        while not self._stop.is_set():
            await asyncio.sleep(interval)
            await ws.send(frame)

    # ---- helpers for subclasses ----------------------------------------

    def _emit_state(self, state: ConnState, detail: str) -> None:
        ts = now_ns()
        self.bus.publish(
            ConnectionEvent(
                venue=self.venue,
                symbol=self.name,
                recv_ts_ns=ts,
                proc_ts_ns=ts,
                state=state,
                detail=detail,
            )
        )

    @staticmethod
    def _json(raw: str | bytes):
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        return json.loads(raw)
