"""Extract complete government building footprints for the aerial pilot."""
import argparse
import json
import math
from pathlib import Path

from shapely import build_area
from shapely.affinity import affine_transform
from shapely.geometry import LineString, MultiLineString

from tm import M_LAT, M_LON, ORIGIN

ROOT = Path(__file__).resolve().parents[2]


def extract(records, area):
    buildings = []
    for record in records:
        lines = [[(lon, lat) for lat, lon in ring] for ring in record['r'] if len(ring) >= 4]
        if not lines:
            continue
        footprint = build_area(MultiLineString(lines))
        polygons = footprint.geoms if footprint.geom_type == 'MultiPolygon' else (footprint,)
        for polygon in polygons:
            if polygon.geom_type != 'Polygon' or not area.intersects(polygon):
                continue
            rings = [polygon.exterior, *polygon.interiors]
            buildings.append({
                'rings': [[list(point) for point in ring.coords] for ring in rings],
                'height': positive(record.get('h')),
                'floors': positive(record.get('f')),
            })
    return buildings


def positive(value):
    return value if isinstance(value, (int, float)) and math.isfinite(value) and value > 0 else None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT / 'tools/raw/gis-buildings.json')
    parser.add_argument('--output', type=Path, default=ROOT / 'public/data/aerial-pilot.json')
    args = parser.parse_args()
    # 양화로 두 카메라 중심 사이의 130m 주변 건물을 원래 외곽 그대로 표시한다.
    corridor = LineString([(-70, -130), (-490, 245)]).buffer(130)
    area = affine_transform(corridor, [1 / M_LON, 0, 0, -1 / M_LAT, ORIGIN[1], ORIGIN[0]])
    records = json.loads(args.source.read_text())['buildings']
    buildings = extract(records, area)
    if not buildings:
        parser.error('시범 구간과 겹치는 건물 자료가 없습니다.')
    args.output.write_text(json.dumps({'buildings': buildings}, separators=(',', ':')) + '\n')
    print(f'{len(buildings)}개 건물 외곽을 추출했습니다.')


if __name__ == '__main__':
    main()
