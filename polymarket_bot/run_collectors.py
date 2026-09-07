"""Phase 1 entry point: connect every feed and prove it delivers.

    python -m polymarket_bot.run_collectors --duration 60
    python -m polymarket_bot.run_collectors --discover
    python -m polymarket_bot.run_collectors --duration 30 --print-events 20

This is a diagnostic, not a trading process. It opens the four feeds, prints
what arrives, and reports per-venue counts, staleness and local parse cost. It
places no orders and writes nothing to disk — the recorder is Phase 2.

What to look for before believing a feed:

* every enabled venue shows a non-zero event count and a small last-event age;
* `unknown` stays at zero (a rising count means the venue changed a message
  shape and something downstream is being quietly starved);
* `parse_errors` stays at zero;
* the Polymarket section lists a market whose window is actually the current
  one — a discovery that returns nothing looks exactly like a quiet market
  until you check.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import logging
import signal
import time

from .collectors.base import WSCollector
from .collectors.binance import BinanceCollector
from .collectors.coinbase import CoinbaseCollector
from .collectors.market_tracker import ActiveMarketTracker
from .collectors.okx import OKXCollector
from .collectors.polymarket import PolymarketCollector
from .collectors.polymarket_markets import MarketDiscovery
from .config.settings import Settings
from .core.bus import EventBus
from .core.clock import now_ns
from .core.events import ConnectionEvent, MarketEvent, UnknownEvent, as_record

log = logging.getLogger("run_collectors")


def _quiet_transport_errors(loop: asyncio.AbstractEventLoop, context: dict) -> None:
    """Collapse socket-teardown noise into one line.

    When a connection dies mid-handshake — a proxy 403, a reset — the transport
    can raise from a callback the WebSocket library no longer has state for.
    The default handler prints a multi-frame traceback for each one, which on a
    dead uplink means four collectors flooding stderr several times a second and
    burying the reconnect messages that actually matter. The condition is
    already reported: `WSCollector.run` logs it and publishes an ERROR
    ConnectionEvent.
    """
    exception = context.get("exception")
    if isinstance(exception, (ConnectionError, EOFError, AttributeError,
                              asyncio.InvalidStateError, StopIteration)):
        log.debug("transport teardown: %s", context.get("message"))
        return
    loop.default_exception_handler(context)


def build_collectors(settings: Settings, bus: EventBus) -> list[WSCollector]:
    collectors: list[WSCollector] = []
    ex = settings.exchanges
    if ex.binance.enabled:
        collectors.append(
            BinanceCollector(
                bus,
                ex.binance.symbols,
                host=ex.binance.host,
                depth_levels=ex.binance.depth_levels,
                depth_speed_ms=ex.binance.depth_speed_ms,
                time_unit=ex.binance.time_unit,
                stale_after_s=ex.binance.stale_after_s,
            )
        )
    if ex.okx.enabled:
        collectors.append(
            OKXCollector(
                bus,
                ex.okx.inst_ids,
                url=ex.okx.url,
                channels=ex.okx.channels,
                stale_after_s=ex.okx.stale_after_s,
            )
        )
    if ex.coinbase.enabled:
        collectors.append(
            CoinbaseCollector(
                bus,
                ex.coinbase.product_ids,
                url=ex.coinbase.url,
                channels=ex.coinbase.channels,
                stale_after_s=ex.coinbase.stale_after_s,
            )
        )
    return collectors


async def drain(bus: EventBus, print_events: int) -> None:
    """Consume the bus so its queues do not fill.

    Phase 1 has no real consumer; without one, every subscriber queue fills and
    the drop counters climb, which would look like a bug in the bus rather than
    the absence of a recorder.
    """
    sub = bus.subscribe("drain")
    printed = 0
    while True:
        event: MarketEvent = await sub.queue.get()
        if isinstance(event, (ConnectionEvent, UnknownEvent)):
            log.info("%s", as_record(event))
        elif printed < print_events:
            printed += 1
            log.info("%s", as_record(event))


async def report(collectors: list[WSCollector], tracker: ActiveMarketTracker | None,
                 bus: EventBus, interval_s: float) -> None:
    while True:
        await asyncio.sleep(interval_s)
        now = now_ns()
        print("\n--- feeds " + time.strftime("%H:%M:%S") + " ---")
        for collector in collectors:
            snapshot = collector.stats.snapshot(now)
            stale = "STALE" if collector.is_stale(now) else "ok"
            age = snapshot["last_event_age_ms"]
            age_text = "never" if age is None else f"{age:.0f}ms"
            print(
                f"{collector.name:<12} {stale:<5} events={snapshot['events']:<8}"
                f" msgs={snapshot['messages']:<8} age={age_text:<9}"
                f" parse={snapshot['mean_parse_ms']:.3f}ms"
                f" errors={snapshot['parse_errors']} unknown={snapshot['unknown']}"
                f" reconnects={snapshot['disconnects']}"
            )
        if tracker is not None:
            for row in tracker.summary():
                print(
                    f"  market {row['window_s']}s ends_in={row['ends_in_s']}s"
                    f" up={str(row['up_token'])[:12]}… {row['question'][:60]}"
                )
            if not tracker.markets:
                print("  market  (none discovered)")
        stats = bus.stats()
        print(f"bus published={stats['published']} dropped={bus.total_dropped}")


async def discover_only(settings: Settings) -> None:
    async with MarketDiscovery(
        gamma_url=settings.polymarket.gamma_url,
        clob_url=settings.polymarket.clob_url,
        timeout_s=settings.polymarket.http_timeout_s,
    ) as discovery:
        for seconds in settings.polymarket.window_seconds:
            refs = await discovery.find_current_and_next(seconds)
            print(f"\n=== {seconds}s windows: {len(refs)} found")
            for ref in refs:
                remaining = ref.seconds_remaining(time.time())
                print(f"  {ref.question}")
                print(f"    slug={ref.slug} condition={ref.condition_id}")
                print(f"    outcomes={ref.outcomes}")
                print(f"    up={ref.up_token_id}")
                print(f"    down={ref.down_token_id}")
                print(f"    ends in {remaining:.0f}s  accepting_orders={ref.accepting_orders}")
                if ref.up_token_id:
                    tick = await discovery.tick_size(ref.up_token_id)
                    print(f"    tick_size={tick}")


async def main_async(args: argparse.Namespace) -> int:
    settings = Settings.load(args.config)
    logging.basicConfig(
        level=getattr(logging, settings.logging.level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    if args.discover:
        await discover_only(settings)
        return 0

    bus = EventBus()
    collectors = build_collectors(settings, bus)
    tasks = [asyncio.create_task(drain(bus, args.print_events))]

    tracker: ActiveMarketTracker | None = None
    discovery: MarketDiscovery | None = None
    if settings.polymarket.enabled:
        discovery = MarketDiscovery(
            gamma_url=settings.polymarket.gamma_url,
            clob_url=settings.polymarket.clob_url,
            timeout_s=settings.polymarket.http_timeout_s,
        )
        poly = PolymarketCollector(
            bus,
            url=settings.polymarket.ws_url,
            stale_after_s=settings.polymarket.stale_after_s,
            keepalive_interval_s=settings.polymarket.keepalive_interval_s,
        )
        tracker = ActiveMarketTracker(
            discovery,
            poly,
            window_seconds=tuple(settings.polymarket.window_seconds),
            refresh_s=settings.polymarket.discovery_refresh_s,
        )
        tasks.append(asyncio.create_task(tracker.run()))

    for collector in collectors:
        tasks.append(asyncio.create_task(collector.run()))
    tasks.append(asyncio.create_task(report(collectors, tracker, bus, args.report_every)))

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    loop.set_exception_handler(_quiet_transport_errors)
    for sig in (signal.SIGINT, signal.SIGTERM):
        with contextlib.suppress(NotImplementedError):
            loop.add_signal_handler(sig, stop.set)

    if args.duration:
        with contextlib.suppress(asyncio.TimeoutError):
            await asyncio.wait_for(stop.wait(), timeout=args.duration)
    else:
        await stop.wait()

    for collector in collectors:
        collector.stop()
    if tracker is not None:
        tracker.stop()
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    if discovery is not None:
        await discovery.aclose()

    print("\n=== final ===")
    now = now_ns()
    for collector in collectors:
        print(collector.name, collector.stats.snapshot(now))
    print("bus", bus.stats())
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--config", default=None, help="path to a YAML config")
    parser.add_argument("--duration", type=float, default=0.0,
                        help="stop after N seconds (0 = run until interrupted)")
    parser.add_argument("--report-every", type=float, default=10.0,
                        help="seconds between status tables")
    parser.add_argument("--print-events", type=int, default=0,
                        help="print the first N market events")
    parser.add_argument("--discover", action="store_true",
                        help="resolve the active Up/Down markets and exit")
    args = parser.parse_args()
    try:
        return asyncio.run(main_async(args))
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
