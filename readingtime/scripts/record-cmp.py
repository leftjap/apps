#!/usr/bin/env python3
"""목업 오라클(2x, 폰 x0..780) vs rtshot 렌더(2x, 780) 픽셀 대조.
사용: record-cmp.py <oracle.png> <mine.png> <out_prefix>
출력: <prefix>-sbs.png (오라클|렌더|diff×4), <prefix>-ov.png (빨강=오라클/청록=렌더)
"""
import sys
from PIL import Image, ImageChops

ora_p, mine_p, pref = sys.argv[1], sys.argv[2], sys.argv[3]

ora = Image.open(ora_p).convert("RGB").crop((0, 0, 780, 1688)).resize((390, 844), Image.LANCZOS)
mine = Image.open(mine_p).convert("RGB").resize((390, 844), Image.LANCZOS)

diff = ImageChops.difference(ora, mine)
px = diff.load()
bad = big = 0
rowbad = []
for y in range(844):
    c = 0
    for x in range(390):
        d = max(px[x, y])
        if d > 24:
            c += 1
            bad += 1
        if d > 80:
            big += 1
    rowbad.append((y, c))
tot = 390 * 844
print(f"불일치(>24) {bad / tot * 100:5.2f}%   심함(>80) {big / tot * 100:5.2f}%   "
      f"최악행 {sorted(rowbad, key=lambda r: -r[1])[:5]}")

amp = Image.eval(diff, lambda v: min(255, v * 4))
sbs = Image.new("RGB", (390 * 3 + 20, 844), "white")
sbs.paste(ora, (0, 0)); sbs.paste(mine, (400, 0)); sbs.paste(amp, (800, 0))
sbs.save(pref + "-sbs.png")

g_o, g_m = ora.convert("L"), mine.convert("L")
Image.merge("RGB", (g_o, g_m, g_m)).resize((780, 1688), Image.NEAREST).save(pref + "-ov.png")
