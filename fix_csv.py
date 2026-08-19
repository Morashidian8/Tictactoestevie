"""
Make a CSV readable in Excel, and add short rule codes.

Excel does not detect UTF-8 on its own: without a byte-order mark it falls back
to the system codepage, which turns every Persian rule name into mojibake. One
three-byte prefix fixes it, and rewriting the file is cheaper than regenerating
it.

While the file is open anyway, a `rules_short` column goes in — "1+7" instead of
the full names of both rules. Full names are right for a message you read once;
a spreadsheet of three thousand rows is read by scanning, and scanning wants
something narrow.

    python fix_csv.py signals_month.csv
"""

import csv
import os
import re
import sys

FA = str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789")


def short(rules):
    """
    '۱) شکستِ ۲۰ کندلی + ۷) باندِ بولینگر + RSI' -> '1+7'.

    Not by splitting on ' + ': rule 7 is named "باندِ بولینگر + RSI" and carries
    that separator inside itself, so splitting produced '1+7+RSI'. The rule
    numbers are found directly instead — each rule opens with a Persian digit
    and a bracket, and the golden tier with its cup.
    """
    if not rules:
        return ""
    out = ["🏆"] if "🏆" in rules else []
    out += [d.translate(FA) for d in re.findall(r"([۰-۹])\)", rules)]
    return "+".join(out)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    path = sys.argv[1]
    if not os.path.exists(path):
        print(f"{path} not found")
        return
    with open(path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))
    if not rows:
        print("empty file")
        return

    head = rows[0]
    body = rows[1:]
    if "rules" in head and "rules_short" not in head:
        i = head.index("rules")
        head.insert(i + 1, "rules_short")
        for r in body:
            if len(r) > i:
                r.insert(i + 1, short(r[i]))

    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(head)
        w.writerows(body)
    print(f"{path}: {len(body):,} rows rewritten with a UTF-8 mark"
          + (" and a rules_short column" if "rules_short" in head else ""))
    print("open it again — the Persian will render.")


if __name__ == "__main__":
    main()
