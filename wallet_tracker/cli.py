"""Command-line view of the wallet report (handy for quick checks).

    python -m wallet_tracker.cli 0xWALLET --minutes 120
    python -m wallet_tracker.cli 0xWALLET --preset 2h --json
"""

from __future__ import annotations

import argparse
import json
import sys

from .report import PRESETS, build_report


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="موجودی و سود/زیان یک کیف پول پلی‌مارکت در یک بازه زمانی.")
    p.add_argument("address", help="آدرس کیف پول روی Polygon (0x...)")
    g = p.add_mutually_exclusive_group()
    g.add_argument("--minutes", type=float, help="طول بازه به دقیقه")
    g.add_argument("--preset", choices=list(PRESETS), help="بازه آماده")
    p.add_argument("--json", action="store_true", help="خروجی خام JSON")
    args = p.parse_args(argv)

    minutes = args.minutes if args.minutes else PRESETS[args.preset or "1h"]
    try:
        rep = build_report(args.address, float(minutes))
    except ValueError as exc:
        print(f"خطا: {exc}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(rep, ensure_ascii=False, indent=2))
        return 0

    _print_human(rep)
    return 0


def _print_human(rep: dict) -> None:
    b = rep["balance"]
    w = rep["pnl_window"]
    op = rep["open_positions"]
    print(f"کیف پول: {rep['address']}")
    print(f"بازه:    {rep['window']['label']}")
    print("-" * 48)
    print(f"موجودی نقدی USDC:        {_money(b['total_cash'])}")
    print(f"  • USDC.e:              {_money(b['usdc_e'])}")
    print(f"  • USDC (native):       {_money(b['usdc_native'])}")
    print(f"ارزش پورتفولیو (پوزیشن‌ها): {_money(rep['portfolio_value'])}")
    print("-" * 48)
    print(f"سود/زیان تحقق‌یافته در بازه: {_money(w['total'])}")
    print(f"  • از معاملات:          {_money(w['realized'])}")
    print(f"  • پاداش‌ها:            {_money(w['rewards'])}")
    print(f"  • جریان نقدی خالص:     {_money(w['net_cash_flow'])}")
    print(f"  • تعداد معاملات:       {w['trades_count']}")
    print(f"سود/زیان تحقق‌نیافته (فعلی): {_money(op['unrealized_pnl_now'])}  ({op['count']} پوزیشن باز)")
    if rep["warnings"]:
        print("-" * 48)
        print("هشدارها:")
        for msg in rep["warnings"]:
            print(f"  ! {msg}")


def _money(value) -> str:
    if value is None:
        return "—"
    sign = "+" if value > 0 else ""
    return f"{sign}{value:,.2f} $"


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
