"""Bake the Seogyo photo interpretation. One drawing unit is 0.2 ground metres.

The tracing grid is rotated 4.6° within the camera-aligned, 156 m square.
Each curb forms both the asphalt perimeter and the inside edge of its sidewalk.
Only the two styles differ between the standalone drawing and the comparison ink.
"""
from math import hypot
from pathlib import Path
from xml.etree import ElementTree as ET

OUT = Path(__file__).resolve().parents[2] / 'public/data/v2'
# Clockwise along the four approach corners, in drawing coordinates (screen-up etc.).
# Each row contains the curb path and the return along the street frontage.
CORNERS = [
    ('299.6 165', 'L299.8 237 L300.1 278 Q300.3 293 295.4 305.2 C287 327 270 340.5 253 341.1 L115 340.2',
     'L115 321.9 L247.3 322 L270.6 285.8 L271 165'),
    ('115 400.1', 'L222 401 L251 401.6 C269.6 401.8 285.9 410.7 293 423.3 Q295.6 429 295 438.8 L294.6 489.2 L292.9 681',
     'L269.2 681 L270 551 L266 551 L266 457 L244 434.3 L115 429.4'),
    ('446 681', 'L445.3 504 L445.4 450 Q445.4 438.2 451.4 427.7 C460.2 410 477.3 401.5 491.2 401.7 L530 402.6 L710 407.7',
     'L710 431.4 L516 432.3 L501 435 L480 454.1 L479.8 501.3 L469.2 501.3 L469.2 607.1 L484 615.4 L484 681'),
    ('710 346.3', 'L537.3 345.2 L500.6 345.3 C477.5 344.4 449.2 322.2 441.9 303.4 Q436.7 292.4 436.1 282 L437.1 165',
     'L493.8 165 L493.6 284.3 L512.4 311.5 L545.2 311.4 L545.5 322.7 L710 322.5'),
]

# Endpoints are read separately on each approach. Longitudinal markings terminate at
# the observed stop or zebra. The pale blue bus separators have lower contrast.
# Seoul A058 (001/003) classifies all four centre lines as double solid yellow.
CENTRE_LINES = [(378.5, 165, 378.6, 240), (357.7, 490.7, 359.7, 681),
                (115, 370, 218, 371.6), (529.8, 374.8, 710, 375.9)]
APPROACH = {
    'lane-solid': ['M315.6 165 L315.3 214.1', 'M330.9 165 L330.2 214.6', 'M345.5 165 L345.2 215.1',
                   'M389.2 504.8 L389.9 681', 'M404.3 505.1 L404.4 681', 'M418.8 505.2 L419.5 681',
                   'M434.1 505.1 L434.8 681', 'M173.4 384.1 L201 384.7'],
    'lane-dash': ['M410.3 165 L409.2 240.5', 'M424.6 164.5 L423.6 241',
                  'M309.2 501 L310.6 681', 'M326.8 502.5 L325.4 681',
                  'M124 354 L218.2 355.8', 'M115 384 L165.5 384.1', 'M532 388.2 L710 392'],
    'bus': ['M359.1 165 L359.6 215.8', 'M392 165 L391.6 241',
            'M341.8 490.7 L340.4 681', 'M374.5 512.3 L376 681'],
    'stop': ['M299.8 213.5 L358.6 215.3', 'M360.6 191.7 L378.5 192.6',
             'M358.2 514.5 L374.3 514.2', 'M375 504.7 L446 505.7', 'M201.7 371.2 L200.9 399.6'],
    'edge': ['M306.2 291.5 Q306 314 295.4 331.5', 'M306.2 291.5 L339.7 291.4 M348 291.6 L432.5 293',
             'M271 344 L268.3 399.8', 'M489 352.5 L487.5 398.3', 'M297.7 440.2 L442.2 438.7'],
}
GUIDES = [
    'M344.3 292.6 Q343.3 362 342.3 439', 'M375.8 292.5 L359.8 439.2',
    'M394.6 293.1 L403.3 438.9', 'M410.2 293.3 L419.5 438.9', 'M424.8 293.5 L434.6 438.7',
    'M265.8 372.5 C315.6 372.5 357.3 331.8 393.1 292.2',
    'M356.8 291.8 C379.6 329.8 422.1 359.9 482.4 379.5',
    'M271.5 356.5 C303.8 359.3 359 395.1 382 443',
    'M272.8 371.1 C300.7 367.4 355.9 407.1 372.8 435.2',
    'M484.4 375.2 C443.5 373.8 394 402.5 377.7 439.5',
]
# Period and first dash centre along each path, read from the visible paint.
GUIDE_DASHES = [(9.85, 6.10), (5.10, .86), (10.20, 4.33), (8.65, 1.46), (8.50, 3.29),
                (5.65, .13), (12.30, 10.64), (6.45, 4.32), (6.20, 3.99), (6.55, 6.23)]
BUS_GUIDES = ['M358.2 292 L343 439.4', 'M391.7 293 L378.2 439']
# Centres of each stripe (including infill beneath photographed vehicles).
# Each half has its own painted phase, width, slope, and end-to-end skew.
HALVES = [
    ('upper', 'vertical', [305,310,315,321,326,332,338,343,349,354,360,365,371,376,382,387,394,400,405,411,417,422,428], 241.2,260.6, .017, -.35),
    ('upper', 'vertical', [307,313,318,324,329,335,340,346,351,357,362,368,374,379,385,390,397,403,408,414,419,425,430], 262.1,281.0, .017, -.25),
    ('lower', 'vertical', [297,302,307,313,319,324,329,335,341,348,354,359,365,370,375,381,387,392,398,403,409,414,420,425,431,437,442], 450.2,469.4, -.013, .3),
    ('lower', 'vertical', [299,304,310,316,322,327,333,338,345,351,356,362,367,373,378,384,389,395,400,406,411,417,422,428,433,439,444], 471.0,490.3, -.01, .25),
    ('left', 'horizontal', [346,352,357,363,368,373,379,385,390,395], 221.3,240.4, -.075, .55),
    ('left', 'horizontal', [343,349,354,360,365,371,377,382,387,393], 242.1,260.8, -.066, .55),
    ('right', 'horizontal', [350,356,361,367,373,379,384,389,395,400], 498.7,513.0, -.045, -.35),
    ('right', 'horizontal', [354,359,364,370,375,382,387,393,398], 515,529.7, -.05, -.35),
]
# These are uncertainty indicators, not additional road markings.
OCCLUDED = {
    'curb': ['M300.2 281 C300.3 298 291 324 269 337',
             'M437.2 228 L436.1 282 Q436.7 292.4 441.9 303.4 C449.2 322.2 477.5 344.4 500.6 345.3',
             'M445.3 482 L445.4 450 Q445.4 438.2 451.4 427.7 M146 340.4 L217 340.9'],
    'paint': ['M362.3 449.4 L377.7 449.2 L377.9 469.4 L362.3 469.7 Z',
              'M298.9 469.3 L310.8 469.3 L310.6 489.2 L298.9 489.2 Z',
              'M346.6 242 L359.7 242 L359.8 260.5 L346.6 260.5 Z',
              'M317 241.4 L325.2 241.5 L325.4 258.8 L317 258.7 Z',
              'M399.8 455 L408.8 455 L409.2 468.7 L399.8 468.7 Z',
              'M436 451 L444 451 L444 468 L436 468 Z',
              'M377.9 437 L373 425', 'M380 438 L382 411',
              'M415 364 L416.7 389'],
}


def node(parent, tag, **attrs):
    return ET.SubElement(parent, tag, {k.replace('_', '-'): str(v) for k, v in attrs.items()})


def paths(parent, shapes, **attrs):
    for d in shapes:
        node(parent, 'path', d=d, **attrs)


def build(overlay):
    root = ET.Element('svg', dict(xmlns='http://www.w3.org/2000/svg', width='2340', height='2340', viewBox='0 0 780 780'))
    node(root, 'title').text = '서교동사거리 연석과 노면 표시 겹쳐 보기' if overlay else '서교동사거리 도로 도면'
    frame = node(root, 'g', id='survey-frame', transform='rotate(4.6 390 390)')
    if not overlay:
        ground = node(frame, 'g', id='ground')
        node(ground, 'rect', x=-100, y=-100, width=980, height=980, fill='#677376')
        node(ground, 'rect', x=115, y=165, width=595, height=516, fill='#adb4ab')
        road_shape = 'M' + ' L'.join([f'{start} {curb}' for start, curb, _ in CORNERS]) + ' Z'
        node(ground, 'path', d=road_shape, fill='#50575b')
        for start, curb, back in CORNERS:
            node(ground, 'path', d=f'M{start} {curb} {back} Z', fill='#d7cdbb')
        # The bus waiting/approach surface visibly changes colour inside the east arm.
        node(ground, 'path', d='M530 346 L710 346.3 L710 375.5 L530 374.6 Z', fill='#805e55')
    kerbs = node(frame, 'g', id='curbs', fill='none', stroke='#63ffda' if overlay else '#f2e9d6',
                 stroke_width='1.65' if overlay else '1.50', stroke_linejoin='round')
    paths(kerbs, [f'M{start} {curb}' for start, curb, _ in CORNERS])
    ink = node(frame, 'g', id='paint', fill='none', stroke_linecap='butt')
    dividers = node(ink, 'g', id='divider', stroke='#edba55', stroke_width='.75')
    for x1, y1, x2, y2 in CENTRE_LINES:
        length = hypot(x2-x1, y2-y1)
        for offset in (-.9, .9):
            dx, dy = offset * (y1-y2) / length, offset * (x2-x1) / length
            node(dividers, 'path', d=f'M{x1} {y1} L{x2} {y2}', transform=f'translate({dx:.3f} {dy:.3f})')
    styles = {
        'lane-solid': ('#edede6', .85, None),
        'lane-dash': ('#edede6', .95, '15 24'), 'bus': ('#6395ad', 1.05, None),
        'stop': ('#f4f2e9', 2.0, None), 'edge': ('#d0d3cb', .85, None),
        'guide': ('#dddfd6', .89, '2.15 3.25'), 'bus-guide': ('#7bafbd', .8, '2.1 3.6'),
    }
    for kind, strokes in {**APPROACH, 'guide': GUIDES, 'bus-guide': BUS_GUIDES}.items():
        color, width, dash = styles[kind]
        if overlay and kind not in ('bus', 'bus-guide'):
            color = '#67e8ff'
        group = node(ink, 'g', id=kind, stroke=color, stroke_width=width)
        if dash:
            group.set('stroke-dasharray', dash)
        if kind in ('guide', 'bus-guide'):
            measurements = GUIDE_DASHES if kind == 'guide' else [(6.85, 2.95), (6.30, 2.66)]
            for d, (period, centre) in zip(strokes, measurements, strict=True):
                length = round(period * .42, 2)
                node(group, 'path', d=d, stroke_dasharray=f'{length} {period-length:.2f}',
                     stroke_dashoffset=round(length / 2 - centre, 2))
        else:
            paths(group, strokes)
    crossings = {}
    for side, direction, centres, start, end, slope, skew in HALVES:
        if side not in crossings:
            crossings[side] = node(ink, 'g', id='crossing-' + side,
                                   stroke='#7deaff' if overlay else '#f4f0df', stroke_width='2.45',
                                   opacity='.68' if overlay else '1')
        for centre in centres:
            shift = (centre-centres[0])*slope
            a, b = round(start+shift, 2), round(end+shift, 2)
            p, q = round(centre-skew/2, 2), round(centre+skew/2, 2)
            if direction == 'vertical':
                node(crossings[side], 'line', x1=p, y1=a, x2=q, y2=b)
            else:
                node(crossings[side], 'line', x1=a, y1=p, x2=b, y2=q)
    if overlay:
        inferred = node(frame, 'g', id='occluded', stroke='#ffb653', fill='none', stroke_width='1.7', stroke_dasharray='3 2')
        paths(inferred, OCCLUDED['curb'])
        paths(inferred, OCCLUDED['paint'], stroke_width='.9')
    ET.indent(root)
    return ET.tostring(root, encoding='unicode') + '\n'


if __name__ == '__main__':
    for name in ('road', 'lines'):
        (OUT / f'seogyo-{name}.svg').write_text(build(name == 'lines'))
