# 지시서 1(docs/redraw-orders/1-land.md): 시제품 구역의 땅을 건물 / 도로 부지 / 그 밖으로 나눈다.
# 도로 부지 = 실폭도로 − 빼는 건물(실폭도로 안에 완전히 들어 있는 길 위 시설은 빼지 않는다). 결과는 public/data/v2/land.json.
# 실행: node tools/v2/roads_json.ts && tools/.venv/bin/python tools/v2/land.py
import json, os, sys, time
import shapely
from shapely.geometry import Point, Polygon
from shapely.ops import unary_union
from shapely import make_valid

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from tm import ll_to_xz  # noqa: E402

AREA = (-2000, -2000, 2000, 2000)
RECT = Point(0, 0).buffer(2000.0, quad_segs=64)  # 판 전체(원점 둘레 반지름 2,000m 원), 지시서 4a
THIN = 0.25  # 폭 0.5m 아래인 부분을 지우는 안쪽·바깥쪽 버퍼(m), docs/redraw.md 6절
MIN_AREA = 1.0  # 이보다 작은 조각·구멍은 지운다(㎡)


def even_odd(rings):
    """첫 고리가 바깥, 나머지는 짝홀 규칙(구멍)"""
    ps = [make_valid(Polygon(r)) for r in rings if len(r) >= 3]
    if not ps:
        return None
    out = ps[0]
    for h in ps[1:]:
        out = out.symmetric_difference(h)
    return out


def polygons(g):
    if g.is_empty:
        return []
    if g.geom_type == 'Polygon':
        return [g]
    return [p for part in getattr(g, 'geoms', []) for p in polygons(part)]


def load_gis_roads():
    out = []
    for r in json.load(open(os.path.join(ROOT, 'tools', 'raw', 'gis-roads.json')))['roads']:
        g = even_odd([[ll_to_xz(lat, lon) for lat, lon in ring] for ring in r['r'] if len(ring) >= 4])
        if g is not None and g.intersects(RECT):
            out.append(g)
    return unary_union(out)


def load_buildings(gis):
    """(길 위 시설 목록, 빼는 건물의 합). 길 위 시설 = 실폭도로 합친 면 안에 완전히 들어 있는 건물"""
    street, cut = [], []
    for b in json.load(open(os.path.join(ROOT, 'public', 'data', 'board.json')))['b']:
        pts = [(b[i] / 10, b[i + 1] / 10) for i in range(2, len(b) - 1, 2)]
        if len(pts) >= 3:
            g = make_valid(Polygon(pts))
            if g.intersects(RECT):
                (street if g.within(gis) else cut).append(g)
    return street, unary_union(cut)


def drop_small(g):
    keep = []
    for p in polygons(g):
        if p.area < MIN_AREA:
            continue
        holes = [h for h in p.interiors if Polygon(h).area >= MIN_AREA]
        keep.append(Polygon(p.exterior, holes))
    return keep


def ring_dm(ring):
    c = list(ring.coords)[:-1]  # 닫는 점은 board.json 건물처럼 되풀이하지 않는다
    return [v for x, z in c for v in (round(x * 10), round(z * 10))]


def main():
    t0 = time.time()
    gis = load_gis_roads()
    shapely.prepare(gis)
    street, bld = load_buildings(gis)
    road = gis.difference(bld).intersection(RECT)
    # 폭 0.5m 아래인 부분을 지운다(안쪽으로 줄였다가 되돌린다)
    before = road.area
    road = road.buffer(-THIN, join_style='mitre').buffer(THIN, join_style='mitre')
    thin = before - road.area
    # land.json 좌표는 dm 정수라 0.1m 격자에 맞춰 둔다(격자에 맞추면서 다각형이 유효하게 남도록 GEOS 가 처리한다)
    road = shapely.set_precision(road, 0.1)
    keep = drop_small(road)
    out = {
        'v': 1,
        'area': list(AREA),
        'road': [[ring_dm(p.exterior)] + [ring_dm(h) for h in p.interiors] for p in keep],
        'fill': 0,  # 채우기는 없앴다(지시서 1 3판). plot_land.py 가 읽으므로 키는 남긴다
    }
    path = os.path.join(ROOT, 'public', 'data', 'v2', 'land.json')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump(out, open(path, 'w'), separators=(',', ':'))
    lost = gis.intersection(bld).intersection(RECT).area
    print(f'길 위 시설(빼지 않은 건물) {len(street)}동, 넓이 합 {sum(g.area for g in street):.1f}㎡')
    print(f'도로 부지 다각형 {len(keep)}개, 구멍 {sum(len(p.interiors) for p in keep)}개, 넓이 {sum(p.area for p in keep):.0f}㎡')
    print(f'건물 때문에 도로 부지에서 빠진 넓이 {lost:.0f}㎡, 폭 0.5m 아래라 지운 넓이 {thin:.1f}㎡')
    print(f'→ {path} ({os.path.getsize(path) / 1e6:.2f}MB, {time.time() - t0:.1f}초)')


if __name__ == '__main__':
    main()
