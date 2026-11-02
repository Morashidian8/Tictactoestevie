"""Command line entry point.

    syndicate audit path/to/contracts --docs whitepaper.md --out report.md
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .graph import run_audit
from .llm import DEFAULT_CONFIG, AnthropicLLM, load_role_configs
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
    args = ap.parse_args(argv)

    source = load_sources(args.target)
    docs = "\n\n".join(Path(d).read_text() for d in args.docs)
    llm = AnthropicLLM(load_role_configs(args.config))
    state = run_audit(llm, target=Path(args.target).name, source_code=source, docs=docs)

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
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
