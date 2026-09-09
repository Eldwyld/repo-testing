"""``python -m hollow <command>``

  observe    run the workspace suite, write truth.json        (no credentials)
  gate       red-green-red + mutation for base..head           (no credentials)
  guard      path guard only, for the PR guard job              (no credentials)
  cycle      one cron cycle: reconcile, observe, act, persist   (trusted)
  dashboard  regenerate site/index.html
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from hollow import config, dashboard, gitutil
from hollow.gate import paths
from hollow.gate.redgreen import evaluate


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="hollow")
    ap.add_argument("--root", default=str(config.ROOT))
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("observe")
    p.add_argument("--out", default="truth.json")

    p = sub.add_parser("gate")
    p.add_argument("--base", required=True)
    p.add_argument("--head", required=True)
    p.add_argument("--out", default="gate-result.json")

    p = sub.add_parser("guard")
    p.add_argument("--base", required=True)
    p.add_argument("--head", required=True)

    p = sub.add_parser("cycle")
    p.add_argument("--truth", default="truth.json")
    p.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY", ""))
    p.add_argument("--dry-run", action="store_true")

    sub.add_parser("dashboard")

    args = ap.parse_args(argv)
    root = Path(args.root).resolve()
    cfg = config.load(root / "hollow.json")

    if args.cmd == "observe":
        from hollow.truth import observe
        data = observe(root, cfg["gate"]["test_timeout_seconds"] * 2)
        Path(args.out).write_text(json.dumps(data, indent=2) + "\n")
        print(json.dumps(data["totals"]))
        return 0

    if args.cmd == "gate":
        result = evaluate(root, args.base, args.head, cfg)
        result.write(Path(args.out))
        print(result.summary())
        return 0 if result.ok else 1

    if args.cmd == "guard":
        changed = gitutil.changed_files(root, args.base, args.head)
        bad = paths.violations(changed, cfg["protected_paths"])
        for b in bad:
            print(f"::error::{b}")
        print(f"{len(changed)} changed file(s), {len(bad)} violation(s)")
        return 1 if bad else 0

    if args.cmd == "cycle":
        from hollow.cycle import run_cycle
        from hollow.github import GitHub
        from hollow.providers import ModelClient
        from hollow.truth import load_truth
        truth = load_truth(Path(args.truth))
        gh = None if args.dry_run and not args.repo else GitHub(args.repo)
        ctx = run_cycle(root, cfg, gh, lambda budget: ModelClient(cfg, budget), truth,
                        dry_run=args.dry_run)
        dashboard.write(root, cfg)
        print(f"cycle {ctx.cycle_no} done; {len(ctx.outcomes)} agent outcome(s)")
        return 0

    if args.cmd == "dashboard":
        print(dashboard.write(root, cfg))
        return 0
    return 2


if __name__ == "__main__":
    sys.exit(main())
