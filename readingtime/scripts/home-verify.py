#!/usr/bin/env python3
"""홈(02) 도킹 카드 구조 검증 — rtshot 렌더 vs 시안 오라클(.oracle/ora-home.png).

    cd ReadingTimeKit && swift build --product rtshot
    .build/debug/rtshot 02 /tmp/home.png
    cd .. && python3 scripts/home-verify.py /tmp/home.png

**CTA 버튼 상단을 기준점**으로 상대 좌표를 대조한다. 카드 상단을 기준으로 삼으면 안 된다 —
시안(CSS)은 카드 상단 hairline 을 `border-top: 1px` 로 그려 레이아웃을 1pt 먹지만 앱은 높이 0 의
overlay 로 그리므로 카드 상단 절대 위치가 5pt 어긋난다(시안 카드 430 / 앱 425).
CTA 상단은 양쪽 다 '카드 콘텐츠 시작'이라 기준으로 안전하다.

남는 계통 오차 약 −2.5pt 의 내역:
  · CTA 행 높이  앱 60 / 시안 62 (tapStart 의 1px border 가 CSS 에선 박스 밖)      → −2.0
  · `9일 연속`   RTLB.m13 = 17 / 시안 라인박스 17.5 (한글 혼용 폰트 폴백)          → −0.5
⑥ 마지막 기록·⑦ 파트너 행은 작업지시서 v3 §8-2 에 따라 rtLB 를 쓰지 않으므로(SwiftUI 기본
행높이) 이 두 행만 허용 오차가 더 크다.
"""
import sys
from PIL import Image

ORACLE = ".oracle/ora-home.png"
ORACLE_Y0 = 410.0          # 오라클 크롭 시작 y (작업지시서 v3 AC #21)


def near(c, t, tol):
    return all(abs(c[i] - t[i]) <= tol for i in range(3))


CTA = lambda c: c[1] > c[0] and c[1] < 110 and c[0] < 80        # CTA 짙은 초록
# greenTint 캡슐 — g > r 조건 필수. 없으면 tapStart 버튼 그림자(233,231,224)가 오검출된다.
TINT = lambda c: c[1] > c[0] and near(c, (233, 239, 230), 6)
TRACK = lambda c: near(c, (236, 229, 210), 7)                   # 게이지 트랙 #ECE5D2
TERRA = lambda c: c[0] > 150 and c[0] - c[1] > 30 and c[0] - c[2] > 30
def dividers(px, size, y_off, anchor):
    """행 구분선 y 목록 — **국소 대비**로 찾는다.

    절대색으로는 못 찾는다. 시안 목업은 카드 *위에도* 비네트를 덮어 카드 배경이
    (253,251,244) 가 아니라 가장자리에서 (235,232,223) 까지 어두워진다(앱은 비네트를 카드
    아래에 깔아 그런 일이 없다 — Screen02Home '하단 색상 깨짐' 주석). 또 시안 divider 색
    (215,207,188) 은 앱의 RT.hair2(234,227,208) 와도 다르다.

    표본 띠는 **우측 여백 x 366.5~369.5** — 행 콘텐츠는 h-inset 4 로 x 24~366 에만 있고
    구분선만 행 박스 폭(x 20~370)을 가로지른다. 좌측 여백은 캘린더 첫 칸 색면(x=24)과
    파트너 헤일로가 걸린다.
    """
    xs = range(int(366.5 * 2), int(369.5 * 2))
    def lum(y2):
        if y2 < 0 or y2 >= size[1]: return None
        return sum(sum(px[x, y2]) for x in xs) / len(xs)
    out = []
    for y2 in range(int((anchor + 250 - y_off) * 2), int((anchor + 400 - y_off) * 2)):
        if y2 >= size[1]: break
        c, up, dn = lum(y2), lum(y2 - 6), lum(y2 + 6)
        if None in (c, up, dn): continue
        if c < up - 30 and c < dn - 30:
            out.append(y2 / 2 + y_off)
    grouped = []
    for v in out:
        if grouped and v - grouped[-1][-1] <= 1.5: grouped[-1].append(v)
        else: grouped.append([v])
    return [g[0] for g in grouped]


def bands(px, size, pred, x0, x1, y_off, min_hits, y0=None, y1=None, gap=1.5):
    """조건 픽셀이 min_hits 개 이상인 y 구간들 → [(시작 pt, 끝 pt)] (절대 y)."""
    w, h = size
    lo = 0 if y0 is None else max(0, int((y0 - y_off) * 2))
    hi = h if y1 is None else min(h, int((y1 - y_off) * 2))
    hits = []
    for y in range(lo, hi):
        n = sum(1 for x in range(int(x0 * 2), int(x1 * 2), 2) if pred(px[x, y]))
        if n >= min_hits:
            hits.append(y / 2 + y_off)
    if not hits:
        return []
    groups = [[hits[0]]]
    for v in hits[1:]:
        if v - groups[-1][-1] <= gap:
            groups[-1].append(v)
        else:
            groups.append([v])
    return [(round(s[0], 2), round(s[-1], 2)) for s in groups]


def landmarks(path, y_off):
    im = Image.open(path).convert("RGB")
    px, size = im.load(), im.size

    cta = bands(px, size, CTA, 60, 140, y_off, min_hits=30)
    if not cta:
        return None, {}
    anchor = cta[0][0]                       # CTA 상단 = 기준점
    out = {"① CTA 하단": cta[0][1] - anchor}

    b = bands(px, size, TINT, 285, 362, y_off, min_hits=28,
              y0=anchor + 62, y1=anchor + 115)
    if b:
        out["② 전체통계 캡슐 상단"] = b[0][0] - anchor
        out["② 전체통계 캡슐 하단"] = b[0][1] - anchor

    b = bands(px, size, TRACK, 210, 360, y_off, min_hits=40,
              y0=anchor + 110, y1=anchor + 175)
    if b:
        out["③ 게이지 상단"] = b[0][0] - anchor

    b = bands(px, size, TERRA, 125, 215, y_off, min_hits=8,
              y0=anchor + 180, y1=anchor + 290)
    if len(b) >= 2:
        out["⑤ 캘린더 행1 상단"] = b[-2][0] - anchor
        out["⑤ 캘린더 행2 상단"] = b[-1][0] - anchor
        out["⑤ 캘린더 행2 하단"] = b[-1][1] - anchor

    d = dividers(px, size, y_off, anchor)
    if len(d) >= 1:
        out["⑥ 구분선"] = d[0] - anchor
    if len(d) >= 2:
        out["⑦ 구분선"] = d[1] - anchor
    return anchor, out


# 항목별 허용 오차 (pt). 근거는 파일 상단 도크스트링.
TOL = {
    "① CTA 하단": 1.0,
    "② 전체통계 캡슐 상단": 2.0,
    "② 전체통계 캡슐 하단": 2.0,
    "③ 게이지 상단": 3.0,
    "⑤ 캘린더 행1 상단": 3.5,
    "⑤ 캘린더 행2 상단": 3.5,
    "⑤ 캘린더 행2 하단": 3.5,
    "⑥ 구분선": 4.0,
    "⑦ 구분선": 4.0,
}


def main():
    if len(sys.argv) < 2:
        sys.exit("사용: home-verify.py <rtshot 02 렌더 png>")
    o_anchor, o = landmarks(ORACLE, ORACLE_Y0)
    r_anchor, r = landmarks(sys.argv[1], 0.0)
    if o_anchor is None or r_anchor is None:
        sys.exit(f"CTA 기준점 검출 실패 (시안 {o_anchor} / 렌더 {r_anchor})")

    print(f"기준점 CTA 상단 절대 y — 시안 {o_anchor:.1f} / 렌더 {r_anchor:.1f}\n")
    print(f"{'랜드마크 (CTA 상단 기준)':<26}{'시안':>8}{'렌더':>8}{'Δ':>7}{'허용':>7}  판정")
    fail = 0
    for k, tol in TOL.items():
        if k not in o or k not in r:
            print(f"{k:<26}{'-':>8}{'-':>8}{'-':>7}{'-':>7}  검출 실패")
            fail = 1
            continue
        d = r[k] - o[k]
        ok = abs(d) <= tol
        fail |= (not ok)
        print(f"{k:<26}{o[k]:>8.2f}{r[k]:>8.2f}{d:>+7.2f}{tol:>7.1f}  {'✓' if ok else '✗ 초과'}")
    print("\n" + ("통과" if not fail else "실패 — 위 ✗ 항목 확인"))
    return int(fail)


if __name__ == "__main__":
    sys.exit(main())
