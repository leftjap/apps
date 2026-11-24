"""Read roof paint from the inner pixels of a surveyed building face."""
from collections import Counter
from colorsys import hls_to_rgb, rgb_to_hls
from hashlib import blake2s
import math
from pathlib import Path
import json
import subprocess

import numpy as np
from shapely import contains_xy, is_ccw, LinearRing, LineString, Polygon, STRtree, box

INSET_METRES = 1.2
MIN_PIXELS = 96
MAX_SPREAD = 42
GLASS_HEIGHT = 30
TILE_PIXELS = 256
LUMA = np.array([.2126, .7152, .0722])
PALETTES = {
    'low': (('#8b8985', '#b9ada0'), ('#797c7d', '#b6b5b0'), ('#927f74', '#c2ada0')),
    'urban': (('#858887', '#adada9'), ('#8e8b81', '#c1b8a5'), ('#747b80', '#a9afb0')),
    'glass': (('#6d787f', '#73909c'), ('#77858a', '#85949b'), ('#767e86', '#788791')),
}


def read_tiles(args):
    manifest = json.loads(subprocess.check_output(
        ['node', '--experimental-strip-types', str(Path(__file__).with_name('survey_roof_tiles.mts')), *args]))
    tiles = []
    for row in manifest['tiles']:
        raw = subprocess.run(
            ['ffmpeg', '-v', 'error', '-i', row['path'], '-frames:v', '1', '-f', 'rawvideo',
             '-pix_fmt', 'rgb24', '-threads', '1', '-'], capture_output=True, check=True).stdout
        rgb = np.frombuffer(raw, dtype=np.uint8).reshape(TILE_PIXELS, TILE_PIXELS, 3)
        pixel = (row['east'] - row['west']) / TILE_PIXELS
        tiles.append((row['west'], row['north'], pixel, rgb))
    return manifest['requested'], tiles


def roof_pixels(inner, tiles):
    if inner.is_empty:
        return np.empty((0, 3), dtype=np.uint8)
    left, top, right, bottom = inner.bounds
    parts = []
    for west, north, pixel, rgb in tiles:
        x0, z0 = max(0, math.floor((left-west)/pixel)), max(0, math.floor((top-north)/pixel))
        x1, z1 = min(TILE_PIXELS, math.ceil((right-west)/pixel)), min(TILE_PIXELS, math.ceil((bottom-north)/pixel))
        if x0 < x1 and z0 < z1:
            xs = west + (np.arange(x0, x1) + .5)*pixel
            zs = north + (np.arange(z0, z1) + .5)*pixel
            mask = contains_xy(inner, xs[None, :], zs[:, None])
            parts.append(rgb[z0:z1, x0:x1][mask])
    return np.concatenate(parts) if parts else np.empty((0, 3), dtype=np.uint8)


def hex_color(rgb):
    return '#' + ''.join(f'{round(value):02x}' for value in rgb)


def wall_color(rgb):
    hue, light, saturation = rgb_to_hls(*(rgb / 255))
    if saturation > .16 and (hue < .10 or hue > .96) and light < .55:
        # Brick and terracotta roofs can suggest a warm, muted façade.
        return hex_color(np.array(hls_to_rgb(.055, .54 + .17*light, .20)) * 255)
    warm = hue < .16 and saturation > .07
    wall_light = np.clip(.49 + .32*light, .59, .76)
    return hex_color(np.array(hls_to_rgb(.095 if warm else .12, wall_light, .16 if warm else .05)) * 255)


def street_tree(cars):
    multilane = {index for row in cars.get('bundles', ()) if len(row['lanes']) >= 2 for index in row['lanes']}
    return STRtree([LineString(row['points']) for i, row in enumerate(cars.get('links', ()))
                    if i in multilane and row['kind'] != '1'])


def street_edges(outer, lanes):
    direction = 1 if is_ccw(LinearRing(outer)) else -1
    street = []
    for i, ((x, z), (x1, z1)) in enumerate(zip(outer, outer[1:])):
        dx, dz = x1-x, z1-z
        length = math.hypot(dx, dz)
        if length < 3:
            continue
        mid = (x+x1)/2, (z+z1)/2
        reach = direction * 18/length
        if lanes.query(LineString([mid, (mid[0]+dz*reach, mid[1]-dx*reach)]), predicate='intersects').size:
            street.append(i)
    return street


def apply_colors(buildings, cars, tiles):
    lanes = street_tree(cars)
    tile_index = STRtree([box(x,z,x+pixel*TILE_PIXELS,z+pixel*TILE_PIXELS)
                          for x,z,pixel,_ in tiles])
    sources, sample_sizes, spreads = Counter(), [], []
    for row in buildings:
        height = row['height']
        style = 'glass' if height >= GLASS_HEIGHT else 'urban' if height >= 12 else 'low'
        row['appearance'] = []
        for i, (outer, *holes) in enumerate(row['faces']):
            inner = Polygon(outer, holes).buffer(-INSET_METRES)
            pixels = roof_pixels(inner, (tiles[i] for i in sorted(tile_index.query(inner))))
            source = 'tall' if style == 'glass' else 'photo'
            rgb = None
            if source == 'photo':
                if len(pixels):
                    luma = pixels @ LUMA
                    low, high = np.quantile(luma, [.15, .9])
                    pixels = pixels[(luma > 45) & (luma >= low) & (luma <= high)]
                sample_sizes.append(len(pixels))
                if len(pixels) < MIN_PIXELS:
                    source = 'few pixels'
                else:
                    rgb = np.median(pixels, axis=0)
                    spread = float(np.quantile(np.linalg.norm(pixels-rgb, axis=1), .75))
                    spreads.append(spread)
                    if spread > MAX_SPREAD:
                        source = 'mixed RGB'
            if source == 'photo':
                roof, wall = hex_color(rgb), wall_color(rgb)
            else:
                colors = PALETTES[style]
                choice = blake2s(f"{row['id']}:{i}".encode(), digest_size=1).digest()[0]
                roof, wall = colors[choice % len(colors)]
            paint = dict(roof=roof, wall=wall, style=style, source=source)
            street = street_edges(outer, lanes)
            if street:
                paint['street'] = street
            row['appearance'].append(paint)
            sources[source] += 1
    quantiles = lambda values: [round(float(v), 1) for v in np.quantile(values, [.1, .5, .9, .95])] if values else []
    return dict(roofSources=dict(sources), samplePixelsP10P50P90P95=quantiles(sample_sizes),
                spreadP10P50P90P95=quantiles(spreads))
