"""Merge the six layers of cached WFS tiles in the format read by the survey bakers."""
import argparse
import json
from pathlib import Path

from area import MAPO, read_area

LAYERS = ('a1', 'a2', 'a4', 'b2', 'b3', 'c1')


def import_tiles(tiles, destination):
    destination.mkdir(parents=True, exist_ok=True)
    for layer in LAYERS:
        paths = sorted(tiles.glob(f'{layer}_*.json'))
        if not paths:
            raise ValueError(f'No cached {layer} requests in {tiles}')
        rows = {}
        for path in paths:
            data = json.loads(path.read_bytes())
            if len(data['features']) >= 1000:
                raise ValueError(f'The request reached its limit: {path}')
            for row in data['features']:
                # The WFS wrapper ID can differ between queries for the same survey record,
                # and one surveyed ID can carry several separate records of the same line.
                item = {field: value for field, value in row.items() if field != 'id'}
                rows.setdefault(json.dumps(item, sort_keys=True), item)
        data = {'type': 'FeatureCollection', 'features': list(rows.values())}
        (destination/f'{layer}.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':'))+'\n')
        print(f'{layer}: {len(paths)} requests, {len(rows)} distinct features')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--area', type=Path, required=True)
    parser.add_argument('--tiles', type=Path, required=True)
    args = parser.parse_args()
    import_tiles(args.tiles, MAPO/read_area(args.area)['sources']['hd'])
