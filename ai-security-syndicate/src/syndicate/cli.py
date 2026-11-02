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
    a.add_argument("--no-verify", action="store_true", help="skip Agent 7 (Foundry PoC + patch)")
    a.add_argument("--sandbox", choices=["auto", "docker", "local"], default="auto",
                   help="where PoC tests run: docker (isolated, recommended) or local forge; auto prefers docker")
    a.add_argument("--verify-max", type=int, default=5, help="verify at most this many findings (cost cap)")
    a.add_argument("--patch-dir", help="write each verified finding's patch as <id>.diff here")
    a.add_argument("--no-memory", action="store_true", help="don't inject knowledge-base checklists or lessons")
    a.add_argument("--lessons", help="lesson store file (default: $SYNDICATE_LESSONS or ~/.cache/syndicate/lessons.jsonl)")
    a.add_argument("--learn", action="store_true", help="record deterministic lessons from this run's verification outcomes")
    a.add_argument("--diff-base", help="git ref (e.g. origin/main): prioritise functions changed since it and "
                   "check upgradeable storage layouts against it")
    a.add_argument("--fail-on", choices=["none", "high", "verified"], default="none",
                   help="exit 2 if any high/critical finding (high) or any verified finding (verified); for CI")
    a.add_argument("--static-only", action="store_true", help="free mode: Slither + risk map only, no API calls")
    a.add_argument("--max-usd", type=float, default=None, help="stop making API calls once this much is spent")
    les = sub.add_parser("lesson", help="manage lessons injected into future audits")
    les_sub = les.add_subparsers(dest="action", required=True)
    la = les_sub.add_parser("add", help="add a lesson")
    la.add_argument("text")
    la.add_argument("--agent", default="all", help="role it applies to, e.g. agent4_math (default: all)")
    la.add_argument("--keywords", default="", help="comma-separated code words that make it relevant (empty: always)")
    les_sub.add_parser("list", help="list lessons")
    lr = les_sub.add_parser("remove", help="remove a lesson by id")
    lr.add_argument("id")
    for p in (la, lr, les_sub.choices["list"]):
        p.add_argument("--lessons", help="lesson store file")

    args = ap.parse_args(argv)
    if args.cmd == "lesson":
        return lesson_cmd(args)
    if args.cmd == "audit" and args.max_usd is None and not args.static_only:
        print("note: no --max-usd set; API spend is uncapped for this run", file=sys.stderr)

    source = load_sources(args.target)
    docs = "\n\n".join(Path(d).read_text() for d in args.docs)
    if args.static_only and args.no_static:
        ap.error("--static-only needs the static tools; drop --no-static")
    llm = NullLLM() if args.static_only else AnthropicLLM(load_role_configs(args.config), budget_usd=args.max_usd)
    options = {"llm": not args.static_only, "static": not args.no_static, "solc": args.solc, "router": args.router, "focus_min_risk": args.focus_min_risk,
               "verify": not args.no_verify, "sandbox": args.sandbox, "verify_max": args.verify_max,
               "memory": not args.no_memory, "lessons_path": args.lessons, "learn": args.learn}
    if args.diff_base:
        from .preprocessor.git_diff import GitError, changed_ranges, repo_root
        try:
            ranges = changed_ranges(repo_root(Path(args.target).resolve()), args.diff_base)
        except GitError as e:
            ap.error(f"--diff-base: {e}")
        options.update(diff_base=args.diff_base, diff_ranges=ranges)
        print(f"diff vs {args.diff_base}: {len(ranges)} changed .sol file(s)")
    state = run_audit(llm, target=Path(args.target).name, source_code=source, docs=docs,
                      target_path=args.target, options=options)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(state["report_markdown"])
    if args.json_out:
        Path(args.json_out).write_text(
            json.dumps([f.model_dump(mode="json") for f in state.get("final_findings") or []], indent=2)
        )
    if args.patch_dir:
        pdir = Path(args.patch_dir)
        pdir.mkdir(parents=True, exist_ok=True)
        for v in state.get("verifications") or []:
            if v.patch_diff:
                (pdir / f"{v.finding_id}.diff").write_text(v.patch_diff)
    n = len(state.get("final_findings") or [])
    print(f"{n} finding(s) → {out}")
    for e in state.get("errors") or []:
        print(f"warning: {e}", file=sys.stderr)
    for role, u in sorted(llm.usage.items()):
        print(f"  {role:18} calls={u.calls} in={u.input_tokens} out={u.output_tokens} "
              f"cache_read={u.cache_read_tokens} ${u.usd:.4f}")
    print(f"API spend: ${llm.spent_usd:.4f}")
    return gate(args.fail_on, state)


def gate(mode: str, state) -> int:
    findings = state.get("final_findings") or []
    if mode == "high" and any(f.severity.value in ("critical", "high") for f in findings):
        print("fail-on=high: high/critical finding present", file=sys.stderr)
        return 2
    if mode == "verified" and any(v.status.value == "verified" for v in state.get("verifications") or []):
        print("fail-on=verified: a finding was proven with a PoC", file=sys.stderr)
        return 2
    return 0


def lesson_cmd(args) -> int:
    from .memory.episodic_memory import Lesson, LessonStore

    store = LessonStore(args.lessons) if args.lessons else LessonStore()
    if args.action == "add":
        kws = [k.strip() for k in args.keywords.split(",") if k.strip()]
        added = store.add(Lesson(agent=args.agent, text=args.text, keywords=kws))
        print("added" if added else "already present", f"({store.path})")
    elif args.action == "list":
        for x in store.all():
            print(f"{x.id}  [{x.agent}] ({x.source}) {x.text}" + (f"  keywords={','.join(x.keywords)}" if x.keywords else ""))
    elif args.action == "remove":
        print("removed" if store.remove(args.id) else "not found")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
