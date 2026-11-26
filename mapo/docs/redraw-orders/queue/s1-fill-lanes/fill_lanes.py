"""s1-fill-lanes 통과 검사: 폭 규칙으로 새로 넣은 노면선의 길이·개수와, 그 선이 비워야 할 자리를 침범하지 않았는지 센다."""
import gzip
import json
import sys
from collections import Counter
from pathlib import Path

from shapely import prepare
from shapely.geometry import LineString, Point, Polygon
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[4]
WORK = ROOT / 'tmp/loop/s1-fill-lanes'
BEFORE_LINES = 18_830  # 고치기 전 lines 수(id 중복 1개 포함)
SAMPLE_STEP = 2.0  # 선을 점으로 나누는 간격(m)
NEAR_EXISTING = 2.0  # 기존 B2 선과 이 거리 안이면 이중 선으로 센다(m)
MIN_LENGTH = 5_000.0
MIN_ROADS = 60
MAX_CROSSING_RATIO = 0.01
MAX_OUTSIDE_RATIO = 0.02  # 원본 503 차선 400개를 같은 방식으로 재니 1.66% 가 구운 찻길 면 밖이었다
MAX_DOUBLED_RATIO = 0.03


def rings_to_polygon(rings):
    outer, holes = rings[0], [ring for ring in rings[1:] if len(ring) >= 4]
    return Polygon(outer, holes)


def faces(groups):
    for rings in groups:
        if len(rings) < 1 or len(rings[0]) < 4:
            continue
        shape = rings_to_polygon(rings)
        if not shape.is_valid:
            shape = shape.buffer(0)
        if not shape.is_empty:
            yield shape


def sample_points(paths):
    """선의 각 경로를 SAMPLE_STEP 간격 점으로 나누고 (점, 그 점이 대표하는 길이)를 낸다."""
    for path in paths:
        if len(path) < 2:
            continue
        line = LineString(path)
        if line.length <= 0:
            continue
        count = max(1, int(round(line.length / SAMPLE_STEP)))
        share = line.length / count
        for index in range(count):
            yield line.interpolate((index + 0.5) * share), share


def main():
    with gzip.open(ROOT / 'public/data/v2/mapo-all-a.json.gz', 'rt') as stream:
        asset = json.load(stream)
    lines = asset['lines']
    fresh = [line for line in lines if line.get('origin') == 'width-rule']
    kept = [line for line in lines if line.get('origin') != 'width-rule']
    bad = []

    print(f'노면선 {len(lines):,}개 = 기존 {len(kept):,} + 새 선 {len(fresh):,}')
    if not fresh:
        print('FAIL 새 선(origin == "width-rule")이 하나도 없다')
        sys.exit(1)

    # 기존 선을 지우거나 고치지 않았다
    if len(kept) != BEFORE_LINES:
        bad.append(f'기존 선이 {len(kept):,}개다(고치기 전 {BEFORE_LINES:,})')
    before = Counter(line['id'] for line in lines if line.get('origin') != 'width-rule')
    if sum(before.values()) != BEFORE_LINES:
        bad.append('기존 선 id 수가 맞지 않는다')

    # 새 선에 도로명이 있고, 종류가 원본 노면선 종류 안에 있다
    kinds = {line['kind'] for line in kept}
    for line in fresh[:]:
        if not line.get('road'):
            bad.append('새 선에 road(도로명) 가 없는 것이 있다')
            break
    off_kind = sorted({line['kind'] for line in fresh} - kinds)
    if off_kind:
        bad.append(f'새 선의 종류가 원본에 없는 값이다: {", ".join(map(str, off_kind))}')

    roads = {line['road'] for line in fresh if line.get('road')}
    total = 0.0
    points, shares = [], []
    for line in fresh:
        for path in line['paths']:
            if len(path) >= 2:
                total += LineString(path).length
        for point, share in sample_points(line['paths']):
            points.append(point)
            shares.append(share)
    sampled = sum(shares)
    print(f'새 선 총 길이 {total:,.1f}m, 도로명 {len(roads)}개, 표본 점 {len(points):,}개({sampled:,.1f}m)')
    if total < MIN_LENGTH:
        bad.append(f'새 선 총 길이 {total:,.1f}m(하한 {MIN_LENGTH:,.0f})')
    if len(roads) < MIN_ROADS:
        bad.append(f'새 선이 닿은 도로명 {len(roads)}개(하한 {MIN_ROADS})')

    # 횡단보도 면 안에 든 길이
    crossing = [shape for row in asset['crossings'] for shape in faces(row['faces'])]
    tree = STRtree(crossing)
    inside_crossing = sum(
        share for point, share in zip(points, shares)
        if any(crossing[index].contains(point) for index in tree.query(point)))

    # 찻길 면 밖으로 나간 길이
    road_faces = list(faces(asset['floor']['road']))
    for shape in road_faces:
        prepare(shape)
    road_tree = STRtree(road_faces)
    outside = sum(
        share for point, share in zip(points, shares)
        if not any(road_faces[index].contains(point) for index in road_tree.query(point)))

    # 기존 노면선과 2m 안에서 겹친 길이
    existing = [LineString(path) for line in kept for path in line['paths'] if len(path) >= 2]
    line_tree = STRtree(existing)
    doubled = 0.0
    for point, share in zip(points, shares):
        window = point.buffer(NEAR_EXISTING)
        if any(existing[index].distance(point) <= NEAR_EXISTING for index in line_tree.query(window)):
            doubled += share

    for name, value, limit in (
            ('횡단보도 면 안', inside_crossing, MAX_CROSSING_RATIO),
            ('찻길 면 밖', outside, MAX_OUTSIDE_RATIO),
            ('기존 선과 2m 안 겹침', doubled, MAX_DOUBLED_RATIO)):
        ratio = value / sampled if sampled else 1.0
        print(f'{name}: {value:,.1f}m ({ratio * 100:.2f}%, 상한 {limit * 100:.0f}%)')
        if ratio > limit:
            bad.append(f'{name} {ratio * 100:.2f}%(상한 {limit * 100:.0f}%)')

    # 요약과 조사 도구가 있다
    for path in (WORK / 'summary.md', ROOT / 'tools/v2/infer_lane_lines.py'):
        if not path.is_file() or path.stat().st_size == 0:
            bad.append(f'없음: {path.relative_to(ROOT)}')
    summary = (WORK / 'summary.md').read_text() if (WORK / 'summary.md').is_file() else ''
    if summary and len(summary.splitlines()) < 8:
        bad.append(f'summary.md 가 {len(summary.splitlines())}줄이다(하한 8)')

    print('\n'.join(f'FAIL {line}' for line in bad) or 'FILL-OK 새 노면선 통과')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
