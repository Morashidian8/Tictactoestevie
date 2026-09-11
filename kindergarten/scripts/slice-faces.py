#!/usr/bin/env python3
"""
برش یک ورق چهره به عکس‌های تک‌نفره — داده نمونه.

    python3 scripts/slice-faces.py ورق.webp --start 21

ورق را می‌گیرد، شیارهای سفید بین خانه‌ها را خودش پیدا می‌کند (نه تقسیم
ساده، چون شیارها یکنواخت نیستند)، از هر خانه یک مربع کمی بالاتر از مرکز
برمی‌دارد تا چانه نبرد، و در src/core/data/local/faces می‌نویسد.

شماره‌گذاری از --start شروع می‌شود تا عکس‌های موجود بازنویسی نشوند.
پس از اجرا، نگاشت چهره به کودک را در fixture.ts دستی بنویسید: ترتیب
چهره‌ها هیچ ربطی به ترتیب نام‌ها ندارد و نگاشت خودکار دختر و پسر را
جابه‌جا می‌کند.
"""
import argparse
import pathlib
import sys

from PIL import Image

OUT = pathlib.Path(__file__).resolve().parent.parent / 'src/core/data/local/faces'
SIZE = 256
WHITE = 235          # آستانه روشنایی برای تشخیص شیار
MIN_GUTTER = 2       # شیار باریک‌تر از این، شیار نیست


def runs(mask):
    out, start = [], None
    for i, v in enumerate(mask):
        if v and start is None:
            start = i
        if not v and start is not None:
            out.append((start, i - 1))
            start = None
    if start is not None:
        out.append((start, len(mask) - 1))
    return [r for r in out if r[1] - r[0] + 1 >= MIN_GUTTER]


def bands(size, gutters):
    """بازه هر خانه، از روی شیارهای بینشان."""
    edges, at = [], 0
    for g0, g1 in gutters:
        if g0 > at:
            edges.append((at, g0 - 1))
        at = g1 + 1
    if at < size:
        edges.append((at, size - 1))
    return edges


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('sheet')
    ap.add_argument('--start', type=int, default=1, help='شماره اولین فایل')
    args = ap.parse_args()

    im = Image.open(args.sheet).convert('RGB')
    w, h = im.size
    px = im.load()

    def bright(xs, ys):
        total = 0
        for x in xs:
            for y in ys:
                total += min(px[x, y])
        return total / (len(xs) * len(ys))

    step = max(1, h // 64)
    cols = [bright([x], range(0, h, step)) > WHITE for x in range(w)]
    step = max(1, w // 64)
    rows = [bright(range(0, w, step), [y]) > WHITE for y in range(h)]

    xs, ys = bands(w, runs(cols)), bands(h, runs(rows))
    if not xs or not ys:
        print('شیاری پیدا نشد؛ ورق جدول ندارد؟', file=sys.stderr)
        return 1

    OUT.mkdir(parents=True, exist_ok=True)
    n = args.start
    for y0, y1 in ys:
        for x0, x1 in xs:
            bw, bh = x1 - x0 + 1, y1 - y0 + 1
            side = min(bw, bh)
            cx = x0 + bw // 2
            # کمی بالاتر از مرکز: در قاب دایره‌ای، چانه زودتر از موها می‌بُرد.
            top = y0 + max(0, (bh - side) // 2 - int(bh * 0.04))
            tile = im.crop((cx - side // 2, top, cx - side // 2 + side, top + side))
            tile.resize((SIZE, SIZE), Image.LANCZOS).save(
                OUT / f'child-{n}.webp', 'WEBP', quality=82, method=6
            )
            n += 1

    print(f'{n - args.start} عکس در {OUT}')
    print('حالا نگاشت FACES را در fixture.ts به‌روز کنید.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
