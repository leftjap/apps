"""Fetch the OpenStreetMap park and green faces that cover an area's window (Overpass)."""
import argparse
import json
import urllib.parse
import urllib.request
from pathlib import Path

from area import MAPO, area_window, read_area
from tm import M_LAT, M_LON, ORIGIN

# The same tags the first extract carried: only leisure=park is painted, the rest
# stays available for later layers.
KINDS = ('["leisure"~"^(park|pitch|playground|garden)$"]',
         '["landuse"~"^(grass|forest|recreation_ground|meadow)$"]',
         '["natural"~"^(wood|scrub|grassland)$"]')
ENDPOINTS = ('https://overpass.openstreetmap.fr/api/interpreter',
             'https://overpass-api.de/api/interpreter',
             'https://overpass.private.coffee/api/interpreter')


def bounding_box(area, margin=200):
    """The window's lat/lon box, widened so faces that straddle the edge come whole."""
    west, north, east, south = area_window(area).bounds
    return (ORIGIN[0] - (south + margin) / M_LAT, ORIGIN[1] + (west - margin) / M_LON,
            ORIGIN[0] - (north - margin) / M_LAT, ORIGIN[1] + (east + margin) / M_LON)


def fetch(box):
    bounds = '(' + ','.join(f'{value:.6f}' for value in box) + ')'
    body = ('[out:json][timeout:300];('
            + ''.join(f'way{kind}{bounds};relation{kind}{bounds};' for kind in KINDS)
            + ');out geom;')
    for url in ENDPOINTS:
        request = urllib.request.Request(
            url, data=urllib.parse.urlencode({'data': body}).encode(),
            headers={'user-agent': 'mapo-live-3d-bake/0.1'})
        try:
            with urllib.request.urlopen(request, timeout=330) as response:
                return json.loads(response.read())
        except Exception as error:  # noqa: BLE001 - try the next mirror
            print(f'  {urllib.parse.urlparse(url).netloc} → {error}', flush=True)
    raise SystemExit('Every Overpass mirror refused the request')


def main():
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument('--area', type=Path, required=True)
    args = parser.parse_args()
    area = read_area(args.area)
    destination = MAPO / area['sources']['parks']
    box = bounding_box(area)
    print(f'{destination}: {", ".join(f"{value:.5f}" for value in box)}')
    data = fetch(box)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps({'elements': data['elements']}, ensure_ascii=False) + '\n')
    print(f'{len(data["elements"])} faces')


if __name__ == '__main__':
    main()
