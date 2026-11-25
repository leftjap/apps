"""Where the outline cuts junction faces, and whether the island union explains the baked count."""
import sys
sys.path.insert(0, 'tools/v2')
sys.argv = ['evidence2', '--area', 'tools/v2/areas/mapo-all.json']
import collections
from pathlib import Path

from shapely import union_all
from shapely.geometry import LineString, Polygon

from area import read_asset
from hapjeong_hd import AREA, SHEETS, WINDOW, survey_faces, survey_islands, project
from land import even_odd
from shp import dbf, shapes
from tm import tm_to_ll

OUT = Path('tmp/loop/s1-bake')


def unclipped(code):
    for sheet in sorted(SHEETS.iterdir()):
        stem = sheet / f'N1A_{code}'
        if not stem.with_suffix('.shp').is_file():
            continue
        _, rows = dbf(stem.with_suffix('.dbf'))
        for (kind, raw_rings), row in zip(shapes(stem.with_suffix('.shp')), rows, strict=True):
            if kind != 5 or not raw_rings:
                continue
            projected = [[project(tm_to_ll(east, north)[::-1]) for east, north in ring] for ring in raw_rings]
            if not Polygon(projected[0]).envelope.intersects(WINDOW):
                continue
            face = even_odd(projected)
            if face is not None and not face.is_empty:
                yield face


lines = []
outer = LineString(WINDOW.exterior.coords)
holes = [LineString(ring.coords) for ring in WINDOW.interiors]
lines.append(f'윤곽: 바깥 테두리 1개, 구멍 {len(holes)}개')
tally = collections.Counter()
rows = []
for face in unclipped('A0080000'):
    if not face.crosses(outer if not holes else WINDOW.boundary):
        continue
    where = '바깥 테두리' if face.crosses(outer) else '구멍'
    if holes and any(face.crosses(h) for h in holes):
        where = '구멍' if where == '구멍' else '바깥 테두리와 구멍 모두'
    tally[where] += 1
    kept = face.intersection(WINDOW).area
    rows.append((where, face.area, kept, list(face.representative_point().coords[0])))
lines.append(f'잘린 교차로 면 {sum(tally.values())}개')
for where, count in tally.most_common():
    group = [r for r in rows if r[0] == where]
    lines.append(f'  {where}: {count}개, 윤곽 안에 남은 비율 중간값 '
                 f'{sorted(r[2] / r[1] for r in group)[len(group) // 2]:.0%}')
lines.append('  남은 비율이 가장 작은 다섯:')
for where, whole, kept, at in sorted(rows, key=lambda r: r[2] / r[1])[:5]:
    lines.append(f'    {where} {kept / whole:5.1%} ({whole:,.0f}㎡ 가운데 {kept:,.0f}㎡) 자리 '
                 f'[{at[0]:.0f}, {at[1]:.0f}]')

faces = [face for face, _ in survey_islands()]
union = union_all(faces)
parts = getattr(union, 'geoms', [union])
baked = len(read_asset(AREA)['floor']['islands'])
lines.append(f'\n섬: 규칙을 통과한 면 {len(faces)}개 → 맞닿은 것을 합치면 {len(parts)}덩어리, '
             f'구운 자료의 islands {baked}개')

text = '\n'.join(lines)
(OUT / 'evidence2.txt').write_text(text + '\n')
print(text)
