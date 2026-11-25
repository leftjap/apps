"""s1-water 통과 검사: 윤곽 구멍과 바닥이 덮지 못한 자리를 세고, 빠진 지도 조각 두 자리가 물인지 본다."""
import gzip
import json
from pathlib import Path

from shapely import make_valid, union_all
from shapely.geometry import Point, Polygon, box

ROOT = Path(__file__).resolve().parents[4]
EXTERIOR_BEFORE = 33_212_661  # 고치기 전 윤곽 바깥 고리
WATER_BEFORE = 8_885_418
# 빠진 수치지형도 조각 두 장의 자리(tmp/mapo-all/i1/sheets.tsv 의 west·north·east·south)
GAPS = {
    '상암 앞 한강(376081852)': (-5648.30, -2616.42, -5207.03, -2059.67),
    '성산대교 앞 한강(376081875)': (-4324.48, -1502.95, -3883.21, -946.27),
}
POCKETS = {'대흥동 주머니': (2466, 1837)}


def surface(rings):
    faces = [make_valid(Polygon(ring) if isinstance(ring[0][0], (int, float))
                        else Polygon(ring[0], ring[1:])) for ring in rings]
    return make_valid(union_all(faces)) if faces else Polygon()


def read(stem):
    with gzip.open(ROOT / 'public/data/v2' / f'{stem}.json.gz', 'rt') as stream:
        return json.load(stream)


def main():
    area = json.loads((ROOT / 'tools/v2/areas/mapo-all.json').read_text())
    rings = area['outline']['coordinates']
    exterior = make_valid(Polygon(rings[0]))
    bad = len(rings) > 1
    print(f'윤곽 구멍 {len(rings) - 1}개, 바깥 고리 {exterior.area:,.0f}㎡')
    if bad:
        print('FAIL 윤곽에 구멍이 남았다')
    if abs(exterior.area - EXTERIOR_BEFORE) > EXTERIOR_BEFORE * .005:
        print(f'FAIL 바깥 고리가 전({EXTERIOR_BEFORE:,}㎡)과 0.5% 넘게 다르다')
        bad = True

    floor = read('mapo-all-a')
    land, water, parks = (surface(floor[key]) for key in ('land', 'water', 'parks'))
    print(f'땅 {land.area:,.0f}㎡, 물 {water.area:,.0f}㎡, 공원 {parks.area:,.0f}㎡')
    if water.area < WATER_BEFORE + 400_000:
        print(f'FAIL 물이 전({WATER_BEFORE:,}㎡)보다 400,000㎡ 이상 늘지 않았다')
        bad = True

    covered = union_all([land, water, parks])
    rest = make_valid(exterior.difference(covered))
    pieces = sorted(getattr(rest, 'geoms', [] if rest.is_empty else [rest]), key=lambda p: -p.area)
    print(f'덮이지 않은 면적 {rest.area:,.0f}㎡, 조각 {len(pieces)}개')
    for piece in pieces[:5]:
        point = piece.representative_point()
        print(f'  {piece.area:,.0f}㎡ @({point.x:,.0f}, {point.y:,.0f})')
    if pieces and pieces[0].area > 1_000:
        print('FAIL 덮이지 않은 조각 하나가 1,000㎡ 를 넘는다(화면에 구멍으로 보인다)')
        bad = True
    if rest.area > 5_000:
        print('FAIL 덮이지 않은 면적 합이 5,000㎡ 를 넘는다')
        bad = True

    for name, bounds in GAPS.items():
        spot = box(*bounds)
        share = water.intersection(spot).area / spot.area
        hole = spot.difference(covered).area
        print(f'{name}: 물 {share:.0%}, 덮이지 않음 {hole:,.0f}㎡')
        if share < .70 or hole > 1_000:
            print('FAIL 이 자리가 물로 메워지지 않았다(물 70% 이상, 구멍 1,000㎡ 아래)')
            bad = True

    ground = union_all([land, parks])
    for name, (x, z) in POCKETS.items():
        inside = ground.covers(Point(x, z))
        print(f'{name} ({x}, {z}) 땅·공원으로 덮임: {inside}')
        if not inside:
            print('FAIL 도심 주머니가 땅으로 메워지지 않았다')
            bad = True

    counts = (len(read('mapo-all-buildings')['buildings']),
              len(floor['crossings']), len(floor['lines']))
    print(f'건물 {counts[0]:,}동, 횡단보도 {counts[1]:,}개, 선 {counts[2]:,}개')
    if counts[0] < 32_295 or counts[1] < 1_637 or counts[2] < 18_826:
        print('FAIL 자료가 전보다 줄었다(건물 32,295·횡단보도 1,637·선 18,826)')
        bad = True

    print('WATER-FAIL' if bad else 'WATER-OK')
    raise SystemExit(1 if bad else 0)


if __name__ == '__main__':
    main()
