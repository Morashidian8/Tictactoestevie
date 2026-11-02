# Micro-benchmarks

Small hand-written cases for cheap smoke runs of the Gym. Each case directory holds:

- `contracts/*.sol`: the only thing the syndicate sees
- `docs.md` (optional): spec handed to Agent 1
- `judged_report.yaml`: the answer key. **Only the judge reads it.**

Rules for adding a case:
1. No comment in the code may hint at a bug. The code has to stand on its own.
2. List only high and medium issues in `judged_report.yaml`. Lows are not scored.
3. Keep at least one clean case (`expected: []`), so false positives cost something.

These cases are handwritten, so they cannot be contaminated by training data, but
they are easier than real contests. Score well here before moving on to real
post-cutoff Code4rena/Sherlock contests; scoring well here is not the goal.
