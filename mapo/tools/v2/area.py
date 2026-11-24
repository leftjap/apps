"""Load the shared area manifest for the survey tools."""
import argparse
import gzip
import json
from pathlib import Path

MAPO = Path(__file__).resolve().parents[2]
DEFAULT_AREA = Path(__file__).with_name('areas') / 'hapjeong.json'
COMPARISON_SEAM_MARGIN = 2  # metres


def load_area():
    parser = argparse.ArgumentParser(add_help=False, allow_abbrev=False)
    parser.add_argument('--area', type=Path, default=DEFAULT_AREA)
    args, _ = parser.parse_known_args()
    return read_area(args.area)


def read_area(path=DEFAULT_AREA):
    if not path.is_file() and path.parent == Path('.') and not path.suffix:
        path = DEFAULT_AREA.with_name(path.name + '.json')
    return json.loads(path.read_text())


def area_window(area):
    """Resolve the clipping shape in the same survey coordinates as window."""
    from shapely.geometry import LineString, box, shape as from_geojson
    from shapely import union_all

    coverage = area.get('coverage')
    if 'outline' in area:
        shape = from_geojson(area['outline'])
        if shape.geom_type != 'Polygon' or not shape.is_valid or shape.is_empty:
            raise ValueError('Survey outline must be one valid polygon')
    elif coverage:
        shape = union_all([
            *(box(*bounds) for bounds in coverage['windows']),
            *(LineString(strip['axis']).buffer(strip['halfWidth'], quad_segs=12,
                                              cap_style=strip.get('cap', 'round'))
              for strip in coverage['strips']),
        ]).intersection(box(*coverage['limits']))
        if shape.geom_type != 'Polygon' or not shape.is_valid or shape.is_empty:
            raise ValueError('Survey coverage must be one valid polygon')
    else:
        shape = box(*area['window'])
    for excluded in area.get('excludeWindows', ()):
        shape = shape.difference(box(*excluded))
    return shape


def asset(area, suffix='', *, root=MAPO):
    output = area['output']
    return root / output['directory'] / f"{output['stem']}{suffix}.json"


def read_asset(area, suffix='', *, root=MAPO):
    path = asset(area, suffix, root=root)
    if area['output'].get('gzip'):
        with gzip.open(path.with_suffix('.json.gz'), 'rt', encoding='utf-8') as source:
            return json.load(source)
    return json.loads(path.read_text())


def write_asset(area, suffix, data):
    path = asset(area, suffix)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n'
    if area['output'].get('gzip'):
        path = path.with_suffix('.json.gz')
        path.write_bytes(gzip.compress(payload.encode(), mtime=0))
    else:
        path.write_text(payload)
    return path
