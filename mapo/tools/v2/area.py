"""Load the shared area manifest for the survey tools."""
import argparse
import json
from pathlib import Path

MAPO = Path(__file__).resolve().parents[2]
DEFAULT_AREA = Path(__file__).with_name('areas') / 'hapjeong.json'


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
    from shapely.geometry import LineString, box
    from shapely import union_all

    coverage = area.get('coverage')
    if coverage:
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
