#!/usr/bin/env python3
"""구조 랜드마크 검사 — 오라클(브라우저 목업) ↔ rtshot 렌더 를 **동일 탐침**으로 재서 Δ 비교.

불일치율(%)만으로는 부족하다: 글리프 안티에일리어싱 차이가 대부분을 차지해
1~3px 구조 어긋남이 묻힌다. 여기선 카드 경계·막대·표지·시트 상단 같은 구조물의
y 좌표를 직접 재서 Δ≤1px 인지 본다. (탐침의 검출 편향이 오라클·렌더 양쪽에 똑같이
걸리므로 Δ 가 곧 구조 차이 — CSS 절대값과 비교하면 편향이 섞여 오탐이 난다.)

사용: record-landmark.py <onepage|day|list|mapfull|place> <oracle.png> <render.png>
"""
import sys
from PIL import Image

HAIR = (0xE9, 0xE2, 0xCF)     # 카드 보더
HAIR2 = (0xEA, 0xE3, 0xD0)    # 행 구분선
HAIR3 = (0xE8, 0xE1, 0xCD)    # 서머리 구분선
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


def firstlast_x(im, y, x0, x1, pred):
    px = im.load()
    f = l = None
    for x in range(x0, x1):
        if pred(px, x, y):
            if f is None:
                f = x
            l = x
    return f, l


OCEAN_TOL = 10
def probes(which, im):
    o = {}
    nonpaper = lambda p, x, y: not near(p, x, y, PAPER, 10)
    nonsheet = lambda p, x, y: not near(p, x, y, SHEET, 10)
    if which == "onepage":
        o["서머리 border"] = firstlast(im, 300, 150, 185, lambda p, x, y: near(p, x, y, HAIR3, 6))[0]
        f, l = firstlast(im, 295, 195, 245, nonpaper); o["8/1 셀 top"], o["8/1 셀 bottom"] = f, l
        f, l = firstlast_x(im, 217, 265, 325, nonpaper); o["8/1 셀 left"], o["8/1 셀 right"] = f, l
        f, l = firstlast(im, 44, 235, 280, nonpaper); o["8/3 셀 top"], o["8/3 셀 bottom"] = f, l
        o["오늘(27) 셀 top"] = firstlast(im, 195, 350, 385, nonpaper)[0]
        f, l = firstlast(im, 30, 455, 520, nonpaper); o["1위 표지 top"], o["1위 표지 bottom"] = f, l
        o["스트립 border"] = firstlast(im, 200, 625, 650, lambda p, x, y: near(p, x, y, HAIR2, 5))[0]
        f, l = firstlast(im, 92, 640, 690, lambda p, x, y: dark(p, x, y, 600)); o["스트립 1표지 top"], o["스트립 1표지 bottom"] = f, l
        f, l = firstlast_x(im, 665, 70, 120, lambda p, x, y: dark(p, x, y, 600)); o["스트립 1표지 left"], o["스트립 1표지 right"] = f, l
        o["카드 top border"] = firstlast(im, 200, 720, 750, lambda p, x, y: near(p, x, y, HAIR, 6))[0]
        o["카드 left border"] = firstlast_x(im, 800, 10, 40, lambda p, x, y: near(p, x, y, HAIR, 6))[0]
    elif which == "day":
        o["시트 top"] = firstlast(im, 195, 520, 640, lambda p, x, y: near(p, x, y, SHEET, 4))[0]
        f, l = firstlast(im, 44, 650, 745, nonsheet); o["1행 표지 top"], o["1행 표지 bottom"] = f, l
        o["2행 표지 top"] = firstlast(im, 44, 746, 820, nonsheet)[0]
    elif which == "list":
        o["시트 top"] = firstlast(im, 195, 190, 270, lambda p, x, y: near(p, x, y, SHEET, 4))[0]
        f, l = firstlast(im, 71, 300, 385, nonsheet); o["1행 표지 top"], o["1행 표지 bottom"] = f, l
        o["4행 표지 top"] = firstlast(im, 71, 533, 600, nonsheet)[0]   # 533~: 3행 표지 그림자 꼬리(blur) 회피
        o["행 구분선 1"] = firstlast(im, 200, 380, 400, lambda p, x, y: near(p, x, y, HAIR2, 5))[0]
    elif which in ("mapfull", "place"):
        f, l = firstlast(im, 45, 300, 385, lambda p, x, y: dark(p, x, y, 300)); o["뉴욕핀 표지 top"], o["뉴욕핀 표지 bottom"] = f, l
        f, l = firstlast_x(im, 350, 20, 75, lambda p, x, y: dark(p, x, y, 300)); o["뉴욕핀 표지 left"], o["뉴욕핀 표지 right"] = f, l
        if which == "mapfull":
            # 표지색(KRAFT) 탐침은 핀 뒤 대륙 블롭(0xDCCFB4, Δ18)에 걸린다 → 배지(terra) 상단으로
            o["서울핀 배지 top"] = firstlast(im, 327, 300, 345, lambda p, x, y: near(p, x, y, (0xC2, 0x55, 0x3A), 24))[0]
            o["두바이핀 표지 top"] = firstlast(im, 217, 340, 400, lambda p, x, y: near(p, x, y, (0xE9, 0xEA, 0xE2), 8))[0]
            px = im.load()
            o["칩 배경 R"] = px[20, 73][0]
            o["닫기 배경 R"] = px[343, 60][0]
        else:   # place — 스크림(0x17120C@.42) 아래라 밝은색 탐침은 무의미. 어두운 표지·시트만
            o["시트 top"] = firstlast(im, 195, 540, 720, lambda p, x, y: near(p, x, y, SHEET, 4))[0]
            f, l = firstlast(im, 44, 660, 745, lambda p, x, y: dark(p, x, y, 300)); o["1행 표지 top"], o["1행 표지 bottom"] = f, l
            o["2행 표지 top"] = firstlast(im, 44, 745, 810, lambda p, x, y: dark(p, x, y, 300))[0]
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
    tol = 8 if (k.startswith("칩") or k.startswith("닫기")) else 1
    ok = d <= tol
    bad += 0 if ok else 1
    print(f"  {k:22s} 오라클 {va:>6}  렌더 {vb:>6}   Δ{d:>3}  {'✓' if ok else '✘'}")
print("  ==>", "구조 일치" if bad == 0 else f"구조 불일치 {bad}건")
sys.exit(0 if bad == 0 else 1)
