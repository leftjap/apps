# 0단계 자료 확인(docs/redraw.md 9절): 층마다 쓸 자료가 판을 얼마나 채우는지 잰다. 아무것도 쓰지 않고 숫자만 찍는다.
# 실행: tools/.venv/bin/python tools/v2/audit0.py
import json, math, os
from shapely.geometry import Polygon, Point
from shapely.ops import unary_union
from shapely import make_valid

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
RAW = os.path.join(ROOT, 'tools', 'raw')
ORIGIN = (37.5515, 126.919)
M_LAT, M_LON = 110950, 111320 * math.cos(math.radians(ORIGIN[0]))
R = 2000
board_disc = Point(0, 0).buffer(R, 128)


def xz(lat, lon):
    return ((lon - ORIGIN[1]) * M_LON, -(lat - ORIGIN[0]) * M_LAT)


def poly(rings):
    """첫 고리가 바깥, 나머지는 짝홀 규칙(구멍)"""
    ps = [make_valid(Polygon([xz(a, b) for a, b in r])) for r in rings if len(r) >= 4]
    if not ps:
        return None
    out = ps[0]
    for h in ps[1:]:
        out = out.symmetric_difference(h)
    return out


km2 = lambda a: f'{a / 1e6:.3f}㎢'

gis = [p for p in (poly(b['r']) for b in json.load(open(os.path.join(RAW, 'gis-buildings.json')))['buildings']) if p is not None and p.intersects(board_disc)]
roads = [p for p in (poly(r['r']) for r in json.load(open(os.path.join(RAW, 'gis-roads.json')))['roads']) if p is not None and p.intersects(board_disc)]
bj = json.load(open(os.path.join(ROOT, 'public', 'data', 'board.json')))
cur = []
for b in bj['b']:
    pts = [(b[i] / 10, b[i + 1] / 10) for i in range(2, len(b) - 1, 2)]
    if len(pts) >= 3:
        cur.append(make_valid(Polygon(pts)))

U_gis = unary_union(gis).intersection(board_disc)
U_cur = unary_union(cur).intersection(board_disc)
U_road = unary_union(roads).intersection(board_disc)
print(f'판 {km2(board_disc.area)}')
print(f'건물: GIS건물통합정보 {len(gis)}동 {km2(U_gis.area)} / 지금 판(OSM·Overture·GIS 섞음) {len(cur)}동 {km2(U_cur.area)}')
print(f'  지금 판에만 있는 건물 넓이 {km2(U_cur.difference(U_gis).area)} ({100 * U_cur.difference(U_gis).area / U_cur.area:.1f}%), GIS 에만 있는 넓이 {km2(U_gis.difference(U_cur).area)} ({100 * U_gis.difference(U_cur).area / U_gis.area:.1f}%)')
# 지금 판 건물 가운데 GIS 건물과 절반도 안 겹치는 동(= GIS 로 바꾸면 사라지는 건물)
lost = [c for c in cur if c.area > 20 and c.intersection(U_gis).area < 0.5 * c.area and c.intersects(board_disc)]
print(f'  GIS 로 바꾸면 사라지는 건물(20㎡ 넘고 절반 넘게 안 겹침) {len(lost)}동, 넓이 {km2(sum(c.area for c in lost))}, 큰 것 다섯: ' + ' '.join(f'({c.centroid.x:.0f},{c.centroid.y:.0f} {c.area:.0f}㎡)' for c in sorted(lost, key=lambda c: -c.area)[:5]))
print(f'도로 부지(실폭도로) {len(roads)}개 {km2(U_road.area)}')
for name, U in (('GIS건물통합정보', U_gis), ('지금 판 건물', U_cur)):
    ov = U_road.intersection(U)
    print(f'  {name}과 겹침 {km2(ov.area)} (도로 부지의 {100 * ov.area / U_road.area:.1f}%)')
rest = board_disc.difference(U_road).difference(U_gis)
print(f'그 밖(대지·공원·광장·물·철도) {km2(rest.area)} = 판의 {100 * rest.area / board_disc.area:.0f}%')

# 두 건물 자료의 차이가 자리 어긋남인지 있고 없음인지
from shapely.strtree import STRtree
gained = [g for g in gis if g.area > 20 and g.intersection(U_cur).area < 0.5 * g.area]
print(f'GIS 에만 있는 건물(20㎡ 넘고 지금 판과 절반 넘게 안 겹침) {len(gained)}동, 넓이 {km2(sum(g.area for g in gained))}')
tree = STRtree(gis)
d = []
for c in cur:
    if c.area < 30 or not c.intersects(board_disc):
        continue
    best = None
    for i in tree.query(c):
        g = gis[i]
        a = c.intersection(g).area
        if a > 0.5 * min(c.area, g.area) and (best is None or a > best[0]):
            best = (a, g)
    if best:
        d.append(c.centroid.distance(best[1].centroid))
d.sort()
print(f'짝이 맞는 건물 {len(d)}동의 가운데 점 거리: 중앙값 {d[len(d) // 2]:.2f}m, 90% {d[int(len(d) * 0.9)]:.2f}m')
big = sorted(lost, key=lambda c: -c.area)[:12]
print('사라지는 큰 건물:', ' '.join(f'({c.centroid.x:.0f},{c.centroid.y:.0f} {c.area:.0f}㎡)' for c in big))
