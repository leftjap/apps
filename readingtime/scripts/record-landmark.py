#!/usr/bin/env python3
"""구조 랜드마크 검사 — 오라클(브라우저 목업) ↔ rtshot 렌더 를 **동일 탐침**으로 재서 Δ 비교.

불일치율(%)만으로는 부족하다: 글리프 안티에일리어싱 차이가 대부분을 차지해
1~3px 구조 어긋남이 묻힌다. 여기선 카드 경계·막대·표지·시트 상단 같은 구조물의
y 좌표를 직접 재서 Δ≤1px 인지 본다. (탐침의 검출 편향이 오라클·렌더 양쪽에 똑같이
걸리므로 Δ 가 곧 구조 차이 — CSS 절대값과 비교하면 편향이 섞여 오탐이 난다.)

사용: record-landmark.py <week|month|sheet|book|map> <oracle.png> <render.png>
"""
import sys
from PIL import Image

HAIR = (0xE9, 0xE2, 0xCF)     # 카드 보더
SHEET = (0xFA, 0xF7, 0xEE)
PAPER = (0xF6, 0xF3, 0xEA)
KRAFT = (0xEE, 0xE1, 0xBC)    # 몰입 표지


def load(p):
    im = Image.open(p).convert("RGB")
    if im.size[0] == 1000:                    # 오라클(2x, 창 폭 500)
        im = im.crop((0, 0, 780, 1688))
    return im.resize((390, 844), Image.LANCZOS)


def near(px, x, y, c, tol=14):
    r, g, b = px[x, y]
    return max(abs(r - c[0]), abs(g - c[1]), abs(b - c[2])) <= tol


def dark(px, x, y, thr):
    return sum(px[x, y]) < thr


def firstlast(im, x, y0, y1, pred):
    px = im.load()
    f = l = None
    for y in range(y0, y1):
        if pred(px, x, y):
            if f is None:
                f = y
            l = y
    return f, l


def bands(im, x, y0, y1, thr=560, minh=8):
    px = im.load()
    out, cur = [], None
    for y in range(y0, y1):
        d = dark(px, x, y, thr)
        if d and cur is None:
            cur = y
        if not d and cur is not None:
            if y - cur > minh:
                out.append(cur)
            cur = None
    return out


def probes(which, im):
    o = {}
    if which == "week":
        o["차트카드 top"] = firstlast(im, 360, 190, 250, lambda p, x, y: near(p, x, y, HAIR))[0]
        o["차트카드 bottom"] = firstlast(im, 360, 420, 450, lambda p, x, y: near(p, x, y, HAIR))[1]
        f, l = firstlast(im, 185, 306, 420, lambda p, x, y: dark(p, x, y, 340))   # 목 막대(값글자·꼬리 회피)
        o["목막대 top"], o["목막대 bottom"] = f, l
        f, l = firstlast(im, 110, 320, 420, lambda p, x, y: not near(p, x, y, (0xFD, 0xFB, 0xF4), 8))
        o["화막대 top"], o["화막대 bottom"] = f, l
        o["duo 행 top"] = firstlast(im, 360, 440, 475, lambda p, x, y: near(p, x, y, HAIR))[0]
        o["랭킹1 표지 top"] = firstlast(im, 30, 565, 600, lambda p, x, y: near(p, x, y, KRAFT, 30))[0]
    elif which == "month":
        for i, r in enumerate(bands(im, 245, 200, 470)[:3]):
            o[f"캘린더 {i+1}행 표지 top"] = r
        o["이달요약 카드 top"] = firstlast(im, 360, 495, 530, lambda p, x, y: near(p, x, y, HAIR))[0]
        o["주차별 카드 top"] = firstlast(im, 360, 620, 655, lambda p, x, y: near(p, x, y, HAIR))[0]
        f, l = firstlast(im, 248, 660, 740, lambda p, x, y: dark(p, x, y, 340))
        o["4주 막대 top"], o["4주 막대 bottom"] = f, l
    elif which == "sheet":
        o["장소시트 top"] = firstlast(im, 195, 430, 500, lambda p, x, y: near(p, x, y, SHEET, 5))[0]
        f, l = firstlast(im, 57, 660, 800, lambda p, x, y: dark(p, x, y, 260))
        o["파친코 표지 top"], o["파친코 표지 bottom"] = f, l
    elif which == "book":
        o["책상세 시트 top"] = firstlast(im, 195, 340, 400, lambda p, x, y: near(p, x, y, PAPER, 5))[0]
        f, l = firstlast(im, 40, 380, 520, lambda p, x, y: dark(p, x, y, 260))
        o["책표지 top"], o["책표지 bottom"] = f, l
    elif which == "map":
        o["서울핀 표지 top"] = firstlast(im, 294, 360, 400, lambda p, x, y: near(p, x, y, KRAFT, 22))[0]
        f, l = firstlast(im, 47, 340, 430, lambda p, x, y: dark(p, x, y, 300))
        o["뉴욕핀 표지 top"], o["뉴욕핀 표지 bottom"] = f, l
        px = im.load()
        o["칩 배경 R"] = px[20, 120][0]        # 글자·아이콘 없는 좌측 패딩
        o["칩 상단보더 R"] = px[20, 113][0]     # CSS border 는 박스 안쪽 (strokeBorder)
    return o


which, ora_p, mine_p = sys.argv[1], sys.argv[2], sys.argv[3]
a, b = probes(which, load(ora_p)), probes(which, load(mine_p))
bad = 0
for k in a:
    va, vb = a[k], b[k]
    if va is None or vb is None:
        print(f"  {k:22s} 오라클 {str(va):>6}  렌더 {str(vb):>6}   미검출 ✘")
        bad += 1
        continue
    d = abs(va - vb)
    tol = 8 if k.startswith("칩") else 1
    ok = d <= tol
    bad += 0 if ok else 1
    print(f"  {k:22s} 오라클 {va:>6}  렌더 {vb:>6}   Δ{d:>3}  {'✓' if ok else '✘'}")
print("  ==>", "구조 일치" if bad == 0 else f"구조 불일치 {bad}건")
sys.exit(0 if bad == 0 else 1)
