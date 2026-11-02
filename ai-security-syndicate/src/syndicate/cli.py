"""Command line entry point.

    syndicate audit path/to/contracts --docs whitepaper.md --out report.md
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .graph import run_audit
from .llm import DEFAULT_CONFIG, AnthropicLLM, NullLLM, load_role_configs
from .loader import load_sources


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="syndicate", description="White-hat multi-agent smart-contract auditor")
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("audit", help="audit a .sol file or project directory you are authorised to test")
    a.add_argument("target")
    a.add_argument("--docs", action="append", default=[], help="spec/whitepaper file (repeatable)")
    a.add_argument("--config", default=str(DEFAULT_CONFIG))
    a.add_argument("--out", default="reports/report.md")
    a.add_argument("--json", dest="json_out", help="also write findings as JSON")
    a.add_argument("--no-static", action="store_true", help="skip Slither/Aderyn (LLM-only pipeline)")
    a.add_argument("--solc", help="path to a solc binary (default: $SYNDICATE_SOLC or solc on PATH)")
    a.add_argument("--router", choices=["auto", "llm"], default="auto",
                   help="auto: deterministic risk scoring when static analysis works (free); llm: always ask Claude")
    a.add_argument("--focus-min-risk", type=int, default=5, help="hunters spend most depth on functions scored >= this")
    a.add_argument("--static-only", action="store_true", help="free mode: Slither + risk map only, no API calls")
    a.add_argument("--max-usd", type=float, default=None, help="stop making API calls once this much is spent")
    args = ap.parse_args(argv)

    source = load_sources(args.target)
    docs = "\n\n".join(Path(d).read_text() for d in args.docs)
    if args.static_only and args.no_static:
        ap.error("--static-only needs the static tools; drop --no-static")
    llm = NullLLM() if args.static_only else AnthropicLLM(load_role_configs(args.config), budget_usd=args.max_usd)
    options = {"llm": not args.static_only, "static": not args.no_static, "solc": args.solc, "router": args.router, "focus_min_risk": args.focus_min_risk}
    state = run_audit(llm, target=Path(args.target).name, source_code=source, docs=docs,
                      target_path=args.target, options=options)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(state["report_markdown"])
    if args.json_out:
        Path(args.json_out).write_text(
            json.dumps([f.model_dump(mode="json") for f in state.get("final_findings") or []], indent=2)
        )
    n = len(state.get("final_findings") or [])
    print(f"{n} finding(s) → {out}")
    for e in state.get("errors") or []:
        print(f"warning: {e}", file=sys.stderr)
    for role, u in sorted(llm.usage.items()):
        print(f"  {role:18} calls={u.calls} in={u.input_tokens} out={u.output_tokens} "
              f"cache_read={u.cache_read_tokens} ${u.usd:.4f}")
    print(f"API spend: ${llm.spent_usd:.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
