# 지시서 3a(docs/redraw-orders/3a-lanes.md, 4판): lanes.json 구조 검사(항목마다 PASS/FAIL, 하나라도 FAIL 이면 종료 코드 1)와
# 찍는 수치(판정 없음). 단면 폭·차로 단면·차로 경계는 lanes.py 의 build() 로 다시 만들어 쓴다(lanes.json 에 넣지 않는 값이다).
# 측량 좌표는 대조에만 쓰고 아무 데도 쓰지 않는다. 실행: tools/.venv/bin/python tools/v2/check_lanes.py
import glob, json, math, os, sys
from collections import defaultdict
from itertools import combinations
import numpy as np
import shapely
from shapely.geometry import LineString, Point
from shapely.strtree import STRtree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from tm import tm_to_xz  # noqa: E402
from shp import shapes, dbf  # noqa: E402
from lanes import build, dm  # noqa: E402


def angle(a, b):
    return math.degrees(math.atan2(b[1] - a[1], b[0] - a[0])) % 180


def adiff(a, b):
    d = abs(a - b) % 180
    return min(d, 180 - d)


def xz(g):
    c = g.interpolate(0.5, normalized=True)
    return f'({c.x:.0f}, {c.y:.0f})'


def main():
    data = json.load(open(os.path.join(ROOT, 'public', 'data', 'v2', 'lanes.json')))
    res = build()
    car = res['car']
    car_grow = car.buffer(0.1)
    shapely.prepare(car_grow)
    S = data['sec']
    secs = res['sections']
    assert len(secs) == len(S), 'build() 결과와 lanes.json 의 구간 수가 다르다'

    # 구조 검사
    results = []
    lines = [(si, l['d'], LineString(dm(l['p'])) if len(l['p']) >= 4 else None) for si, s in enumerate(S) for l in s['lanes']]
    # 같은 구간의 차로 가운데 가장 긴 것의 절반보다 길어야 한다
    longest = {}
    for si, _, g in lines:
        if g is not None:
            longest[si] = max(longest.get(si, 0.0), g.length)
    short = sum(1 for si, _, g in lines if g is None or g.length < 10 or g.length <= longest[si] / 2)
    results.append((short == 0, f'차로 가운데선 {len(lines)}개 가운데 점 둘 아래이거나 10m 아래이거나 같은 구간 가장 긴 차로의 절반 아래인 것 {short}개'))
    good = [(si, d, g) for si, d, g in lines if g is not None]
    tot = sum(g.length for _, _, g in good)
    inside = sum(g.intersection(car_grow).length for _, _, g in good)
    results.append((inside / tot > 0.99, f'차로 가운데선 {tot:.0f}m 가운데 찻길 면(0.1m 넓힘) 안 {100 * inside / tot:.2f}% (99% 넘게)'))
    cross = 0
    for si, s in enumerate(S):
        gs = [g for sj, _, g in good if sj == si]
        cross += sum(1 for a, b in combinations(gs, 2) if a.intersects(b))
    results.append((cross == 0, f'같은 구간 안 차로 가운데선끼리 만나는 쌍 {cross}개'))
    unbal = sum(1 for s in S if not s['oneway'] and s['lanes'] and sum(l['d'] == 1 for l in s['lanes']) != sum(l['d'] == -1 for l in s['lanes']))
    results.append((unbal == 0, f'양방향 구간 가운데 두 방향 차로 수가 다른 구간 {unbal}개'))
    wrong = 0
    for si, d, g in good:
        ax = dm(S[si]['axis'])  # 구간 선의 시작(a 쪽)과 끝(b 쪽). 구역 테두리에서 잘린 끝도 같다
        a, b = Point(ax[0]), Point(ax[-1])
        p0 = Point(g.coords[0])
        near_a = p0.distance(a) < p0.distance(b)
        if (d == 1) != near_a:
            wrong += 1
    results.append((wrong == 0, f'진행 방향이 틀린 차로 {wrong}개(d=1 은 첫 점이 a 쪽, d=-1 은 b 쪽)'))
    for ok, msg in results:
        print(('PASS ' if ok else 'FAIL ') + msg)

    print('찍는 수치(판정 없음)')
    # 1. 구간과 차로를 두지 않은 까닭
    L = [s['line'].length for s in secs]
    with_lane = [i for i, s in enumerate(S) if s['n']]
    print(f'1. 구간 {len(S)}개 {sum(L):.0f}m, 차로를 둔 구간 {len(with_lane)}개 {sum(L[i] for i in with_lane):.0f}m, 차로 가운데선 합 {tot:.0f}m')
    why = defaultdict(list)
    for i, s in enumerate(secs):
        if s['why']:
            why[s['why']].append(i)
    reasons = ['못 잼', 'N = 0', '물린 뒤 짧음'] + [k for k in why if k not in ('못 잼', 'N = 0', '물린 뒤 짧음')]
    for k in reasons:
        print(f'   {k}{" (max(10, 1.5W) 아래)" if k == "물린 뒤 짧음" else ""}: {len(why[k])}개 {sum(L[i] for i in why[k]):.0f}m')
    for k in reasons:
        for i in why[k]:
            if L[i] >= 40:
                print(f'     40m 넘는 것: {k} {xz(secs[i]["line"])} 길이 {L[i]:.0f}m 등급 {S[i]["cls"]} W {S[i]["W"] / 100:.2f}m'
                      + (f' 물림 {secs[i]["ta"]:.1f}+{secs[i]["tb"]:.1f}m' if k == '물린 뒤 짧음' else ''))
    # 2. (등급, 한 방향, 차로 수)별 길이, 차로 폭 분포
    tab = defaultdict(float)
    for i, s in enumerate(S):
        tab[(s['cls'], s['oneway'], s['n'])] += L[i]
    print('2. (등급, 한 방향, 차로 수)별 구간 길이: ' + ', '.join(f'{k[0]}/{"한" if k[1] else "양"}/{k[2]}: {v:.0f}m' for k, v in sorted(tab.items())))
    bins = ('2.5 아래', '2.5~3.0', '3.0~3.25', '3.25~3.5', '3.5')
    ws = defaultdict(int)
    narrow = []
    for s in secs:
        run = []
        for k in s['ks'] + [None]:
            if k is not None:
                w = k['w']
                ws['2.5 아래' if w < 2.5 else '2.5~3.0' if w < 3.0 else '3.0~3.25' if w < 3.25 else '3.25~3.5' if w < 3.5 - 1e-9 else '3.5'] += 1
            if k is not None and k['w'] < 2.5:
                run.append(k)
                continue
            if run and run[-1]['d'] - run[0]['d'] > 10:
                c = s['line'].interpolate((run[0]['d'] + run[-1]['d']) / 2)
                narrow.append(f'({c.x:.0f}, {c.y:.0f}) {run[-1]["d"] - run[0]["d"]:.0f}m 가장 좁은 {min(o["w"] for o in run):.2f}m')
            run = []
    print('   차로 단면의 차로 폭 w_k 분포(단면 수): ' + ', '.join(f'{b} {ws[b]}' for b in bins))
    print(f'   w_k 2.5 아래가 10m 넘게 이어지는 곳 {len(narrow)}곳' + (': ' + '; '.join(narrow) if narrow else ''))
    # 3. 서로 다른 구간의 차로 가운데선이 만나는 곳
    tree = STRtree([g for _, _, g in good])
    pts = []
    for i, (si, _, g) in enumerate(good):
        for j in tree.query(g):
            if j > i and good[j][0] != si:
                x = g.intersection(good[j][2])
                pts.extend(shapely.get_coordinates(x).tolist())
    print(f'3. 서로 다른 구간의 차로 가운데선이 만나는 곳 {len(pts)}곳' + (': ' + ', '.join(f'({x:.0f}, {z:.0f})' for x, z in pts[:10]) if pts else ''))
    # 4. 차로 경계선 edge 가 찻길 면에서 0.5m 넘게 밖인 길이(참고로 조금이라도 밖인 길이), 차로 가운데선이 꺾이는 곳
    borders = json.load(open(os.path.join(ROOT, 'tmp', 'v2', 'lane-borders.json')))
    edges = [LineString(dm(b['p'])) for b in borders if b['k'] == 'edge']
    e_tot = sum(g.length for g in edges)
    car_half = car.buffer(0.5)
    shapely.prepare(car_half)
    outs = [g.difference(car_half) for g in edges]
    e_out = sum(o.length for o in outs)
    e_any = sum(g.difference(car).length for g in edges)
    long_out = [p for o in outs for p in shapely.get_parts(o) if p.length > 10]
    print(f'4. 차로 경계선 edge {e_tot:.0f}m 가운데 찻길 면에서 0.5m 넘게 밖 {e_out:.0f}m ({100 * e_out / e_tot:.2f}%), 10m 넘게 이어지는 곳 {len(long_out)}곳'
          + (': ' + ', '.join(f'{xz(p)} {p.length:.0f}m' for p in long_out) if long_out else '')
          + f'. 참고: 조금이라도 밖 {e_any:.0f}m ({100 * e_any / e_tot:.2f}%)')
    kinks = []
    for _, _, g in good:
        c = np.array(g.coords)
        for i in range(1, len(c) - 1):
            u, v = c[i] - c[i - 1], c[i + 1] - c[i]
            nu, nv = np.linalg.norm(u), np.linalg.norm(v)
            if nu > 0 and nv > 0 and math.degrees(math.acos(max(-1.0, min(1.0, float(np.dot(u, v) / (nu * nv)))))) > 20:
                kinks.append(c[i])
    print(f'   차로 가운데선이 20° 넘게 꺾이는 곳 {len(kinks)}곳' + (': ' + ', '.join(f'({x:.0f}, {z:.0f})' for x, z in kinks[:10]) if kinks else ''))
    # 5. 구간 안에서 폭이 고르지 않은 정도
    uneven = []
    for i, s in enumerate(secs):
        if len(s['Ws']) >= 2 and s['W'] > 0:
            q10, q90 = np.quantile(s['Ws'], (0.1, 0.9))
            if q90 - q10 > 0.3 * s['W']:
                uneven.append(f'{xz(s["line"])} {L[i]:.0f}m {q10:.1f}/{s["W"]:.1f}/{q90:.1f}')
    print(f'5. 폭의 10%~90% 차이가 W 의 30% 넘는 구간 {len(uneven)}개' + (': ' + '; '.join(uneven) if uneven else ''))
    # 6. 측량 도로중심선 차로수 대조
    segs = []
    for i, s in enumerate(secs):
        c = list(s['line'].coords)
        for a, b in zip(c, c[1:]):
            segs.append((i, angle(a, b), LineString([a, b])))
    stree = STRtree([g for _, _, g in segs])
    match = defaultdict(lambda: defaultdict(float))
    ones = defaultdict(float)
    for sheet in sorted(glob.glob(os.path.join(ROOT, 'tools', 'raw', 'ngii', 'suchi', 'sheets', '*'))):
        base = os.path.join(sheet, 'N1L_A0020000')
        _, attrs = dbf(base + '.dbf')
        for (kind, parts), a in zip(shapes(base + '.shp'), attrs):
            if kind != 3 or not parts:
                continue
            pts_ = [tm_to_xz(x, y) for x, y in parts[0]]
            line = LineString(pts_)
            if len(pts_) < 2 or line.length == 0:
                continue
            half = line.length / 2
            acc, ang = 0.0, None
            for p, q in zip(pts_, pts_[1:]):
                d = math.dist(p, q)
                if acc + d >= half and d > 0:
                    ang = angle(p, q)
                    break
                acc += d
            mid = line.interpolate(half)
            best = None
            for k in stree.query(mid, predicate='dwithin', distance=15):
                si, sa, g = segs[k]
                if adiff(sa, ang) <= 30:
                    d = g.distance(mid)
                    if best is None or d < best[0]:
                        best = (d, si)
            if best is None:
                continue
            s = S[best[1]]
            kk = (s['cls'], s['oneway'], s['n'])
            if a['차로수'] == '1':
                ones[kk] += line.length
            else:
                match[kk][a['차로수']] += line.length
    print('6. 우리 (등급, 한 방향, 차로 수) → 짝지은 측량 차로수별 길이(측량 차로수 1 은 따로). 한 방향은 우리 차로 수 ×2 와 견준다')
    for kk in sorted(set(match) | set(ones)):
        cmp_ = kk[2] * 2 if kk[1] else kk[2]
        row = ', '.join(f'{n}차로 {v:.0f}m' for n, v in sorted(match[kk].items(), key=lambda t: -t[1]))
        print(f'   {kk[0]}/{"한" if kk[1] else "양"}/{kk[2]}(견줄 값 {cmp_}): {row or "-"}' + (f' | 차로수 1: {ones[kk]:.0f}m' if ones[kk] else ''))
    sys.exit(0 if all(ok for ok, _ in results) else 1)


if __name__ == '__main__':
    main()
