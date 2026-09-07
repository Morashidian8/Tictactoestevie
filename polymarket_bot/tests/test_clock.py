from polymarket_bot.core.clock import Skew, mono_ns, now_ns, ns_to_ms, parse_epoch_ns


def test_parse_epoch_units():
    assert parse_epoch_ns(1_700_000_000_000, "ms") == 1_700_000_000_000_000_000
    assert parse_epoch_ns("1700000000000000", "us") == 1_700_000_000_000_000_000
    assert parse_epoch_ns(1_700_000_000, "s") == 1_700_000_000_000_000_000
    assert parse_epoch_ns("1700000000000000000", "ns") == 1_700_000_000_000_000_000


def test_parse_epoch_is_exact_for_integer_input():
    # float(1740759191594) * 1e6 is 128ns short. At microsecond inputs that
    # error is the same order as the latencies this system measures.
    assert parse_epoch_ns("1740759191594", "ms") == 1740759191594 * 1_000_000
    assert parse_epoch_ns(1740759191594321, "us") == 1740759191594321 * 1_000


def test_parse_epoch_accepts_fractional_input():
    assert parse_epoch_ns("1700000000.5", "s") == 1_700_000_000_500_000_000


def test_parse_epoch_rejects_garbage_without_raising():
    # A bad timestamp must not kill a feed; it becomes "unknown", not zero.
    assert parse_epoch_ns(None, "ms") is None
    assert parse_epoch_ns("", "ms") is None
    assert parse_epoch_ns("not-a-number", "ms") is None
    assert parse_epoch_ns(0, "ms") is None
    assert parse_epoch_ns(-5, "ms") is None


def test_clocks_are_the_right_kind():
    assert now_ns() > 1_600_000_000_000_000_000  # after 2020, so it is wall time
    assert mono_ns() < now_ns()  # perf_counter has an arbitrary, small origin


def test_skew_estimates_offset_from_the_fastest_message():
    # Venue clock is 5ms ahead of ours; messages take 2ms, 9ms and 4ms.
    # delta = offset - delay, so the largest delta (from the 2ms message)
    # is the best available estimate of the offset.
    skew = Skew()
    offset_ns, recv = 5_000_000, 1_000_000_000
    for delay_ns in (2_000_000, 9_000_000, 4_000_000):
        skew.observe(recv + offset_ns - delay_ns, recv)
    assert skew.offset_ns == offset_ns - 2_000_000


def test_corrected_delay_is_relative_and_never_negative():
    skew = Skew()
    offset_ns, recv = 5_000_000, 1_000_000_000
    for delay_ns in (2_000_000, 9_000_000):
        skew.observe(recv + offset_ns - delay_ns, recv)
    # The fastest message becomes the zero point; the 9ms one is 7ms behind it.
    assert skew.corrected_delay_ns(recv + offset_ns - 9_000_000, recv) == 7_000_000
    assert skew.corrected_delay_ns(recv + offset_ns - 2_000_000, recv) == 0


def test_skew_ignores_events_with_no_exchange_timestamp():
    skew = Skew()
    skew.observe(None, 1_000)
    assert skew.offset_ns == 0
    assert skew.corrected_delay_ns(None, 1_000) is None


def test_ns_to_ms():
    assert ns_to_ms(2_500_000) == 2.5
