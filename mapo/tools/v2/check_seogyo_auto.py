"""Measure Seoul inputs or the generated survey against the separate photo trace."""
import argparse
import json
import math
import re
from pathlib import Path

from shapely import affinity
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union

from aerial_paint import arrow_geometry, line_footprint

from seogyo_trace import APPROACH, BUS_GUIDES, CENTRE_LINES, CORNERS, GUIDES, HALVES, OCCLUDED

MAPO = Path(__file__).resolve().parents[2]
RAW = MAPO / 'tools/raw'
DATA = MAPO / 'public/data/v2/seogyo-ground.json'
ORIGIN = (126.919, 37.5515)
SCALE = 6378137 * math.cos(math.radians(ORIGIN[1]))
CENTRE = (ORIGIN[0] - 70 / (111320 * math.cos(math.radians(ORIGIN[1]))), ORIGIN[1] + 130 / 110950)
ROTATION = 46.6


def mercator(lat):
    return math.asinh(math.tan(math.radians(lat)))


def local(point):
    lon, lat = point
    east = SCALE * math.radians(lon - CENTRE[0])
    south = SCALE * (mercator(CENTRE[1]) - mercator(lat))
    angle = math.radians(ROTATION)
    return (east * math.cos(angle) + south * math.sin(angle),
            -east * math.sin(angle) + south * math.cos(angle))


def lonlat(x, y):
    angle = math.radians(ROTATION)
    east = x * math.cos(angle) - y * math.sin(angle)
    south = x * math.sin(angle) + y * math.cos(angle)
    return (round(CENTRE[0] + math.degrees(east / SCALE), 7),
            round(math.degrees(math.atan(math.sinh(mercator(CENTRE[1]) - south / SCALE))), 7))


def trace_point(x, y):
    return ((x - 390) * .2, (y - 390) * .2)


def trace_path(d):
    tokens = iter(re.findall(r'[MLQCZ]|-?\d+(?:\.\d+)?', d))
    paths = []
    for command in tokens:
        if command == 'Z':
            paths[-1].append(paths[-1][0])
            continue
        count = {'M': 1, 'L': 1, 'Q': 2, 'C': 3}[command]
        controls = [trace_point(float(next(tokens)), float(next(tokens))) for _ in range(count)]
        if command == 'M':
            paths.append(controls)
        elif command == 'L':
            paths[-1].extend(controls)
        else:
            points = [paths[-1][-1], *controls]
            for i in range(1, 33):
                t = i / 32
                paths[-1].append(tuple(sum(math.comb(count, j) * t**j * (1-t)**(count-j) * p[axis]
                                                 for j, p in enumerate(points)) for axis in (0, 1)))
    return [LineString(p) for p in paths]


def percentile(values, p):
    ordered = sorted(values)
    if not ordered:
        return math.inf
    k = (len(ordered) - 1) * p
    lo, hi = math.floor(k), math.ceil(k)
    return ordered[lo] if lo == hi else ordered[lo] * (hi-k) + ordered[hi] * (k-lo)


def samples(line, step=.25):
    count = max(1, math.ceil(line.length / step))
    return [line.interpolate(i/count, normalized=True) for i in range(count+1)]


def raw_data():
    window = affinity.rotate(box(-78, -78, 78, 78), -4.6, origin=(0, 0))
    lanes = json.loads((RAW / 'seoul-lanes.json').read_text())['lanes']
    lines = {}
    for i, row in enumerate(lanes):
        if len(row['p']) < 2:
            continue
        line = LineString([local(p[::-1]) for p in row['p']]).intersection(window)
        if line.length > .05:
            lines[f'L{i}'] = (int(row['k']), int(row['k2']), line)
    crossings = {}
    for row in json.loads((RAW / 'seoul-crosswalks.json').read_text())['areas']:
        face = Polygon([local(p[::-1]) for p in row['ring']]).buffer(0).intersection(window)
        if face.area > .1:
            crossings[row['id']] = (row['kind'], face)
    return lines, crossings


def raw_inventory():
    lines, crossings = raw_data()
    for key, (kind, sub, line) in sorted(lines.items(), key=lambda item: item[1][:2]):
        print(key, kind, sub, line.simplify(.15).wkt)
    for key, (kind, face) in crossings.items():
        print(key, kind, face.simplify(.15).wkt)


# Fixed from the raw inventory before corrections. These identities cannot be
# reassigned to a nearby line when a generated feature is missing.
CENTRES = ('L3826', 'L2681', 'L2631', 'L5771')
LANES = {
    '북': [('lane-solid', 0, ('L7974', 'L7976')), ('lane-solid', 1, ('L7975', 'L7977')),
          ('lane-solid', 2, ('L7979', 'L7978')), ('lane-dash', 0, ('L3651',)),
          ('lane-dash', 1, ('L7867',)), ('bus', 0, ('L3825',)), ('bus', 1, ('L2680',))],
    '남': [('lane-solid', i, (key,)) for i, key in enumerate(('L1854', 'L7103', 'L1853', 'L6730'), 3)]
         + [('lane-dash', 2, ('L2230',)), ('lane-dash', 3, ('L4821',)),
            ('bus', 2, ('L7104',)), ('bus', 3, ('L1361',))],
    '서': [('lane-solid', 7, ('L2630',)), ('lane-dash', 4, ('L2486', 'L2017')),
          ('lane-dash', 5, ('L2487',))],
    '동': [('lane-dash', 6, ('L2628',))],
}
STOPS = ('L8055', 'L4737', 'L4585:F04', 'L4585:F05', 'L667')
GUIDE_IDS = ('L4057', 'L4087', 'L4089', 'L4093', 'F08', 'L4058',
             'L4091', 'L4056', 'L4055', 'L4090', 'L4588', 'L4587')
CROSS_IDS = dict(zip(('upper', 'lower', 'left', 'right'),
                     ('06-0000001183', '06-0000001198', '06-0000001184', '06-0000001202')))
SIDES = ('북', '남', '서', '동')


def obscured():
    masks = []
    for d in OCCLUDED['paint']:
        path = trace_path(d)[0]
        masks.append(Polygon(path) if path.is_ring else path.buffer(.45))
    return unary_union(masks)


def stripe_samples():
    for index, (side, direction, centres, start, end, slope, skew) in enumerate(HALVES):
        for centre in centres:
            a, b = (start+(centre-centres[0])*slope, end+(centre-centres[0])*slope)
            p, q = centre-skew/2, centre+skew/2
            ends = ((p, a), (q, b)) if direction == 'vertical' else ((a, p), (b, q))
            stripe = LineString([trace_point(*point) for point in ends])
            yield side, index % 2, stripe


def crosswalk_photo_samples(mask):
    """Report centre and two end visibilities for each hand-read stripe."""
    ranks = {}
    for side,half,stripe in stripe_samples():
        rank = ranks.get((side,half),0)
        ranks[side,half] = rank+1
        # Opus review: the first stripe of the east inner half is in tree shade.
        shade = (side,half,rank)==('right',0,0)
        visibility = tuple(not shade and not mask.covers(p)
                           for p in (stripe.centroid, *map(Point,stripe.coords)))
        yield side,half,stripe,visibility


def photo_points(line, mask=None):
    return [p for p in samples(line) if mask is None or not mask.covers(p)]


def ordered_pairs(refs, paints, lateral):
    """Maximum cardinality, minimum lateral drift, with each stripe used once."""
    cost = [[(0,0,()) for _ in range(len(paints)+1)] for _ in range(len(refs)+1)]
    for i,ref in enumerate(refs,1):
        for j,paint in enumerate(paints,1):
            options = [cost[i-1][j],cost[i][j-1]]
            distance = abs(ref.centroid.coords[0][lateral]-paint.centroid.coords[0][lateral])
            if distance <= .55:
                matches,error,previous = cost[i-1][j-1]
                options.append((matches+1,error+distance,(*previous,(ref,paint))))
            cost[i][j] = max(options,key=lambda row:(row[0],-row[1]))
    return cost[-1][-1][2]


def stripe_comparison(side, crossing, mask):
    stripes = [Polygon([local(p) for p in ring]) for ring in crossing['stripes']]
    halves = [Polygon([local(p) for p in ring]) for ring in crossing['halves']]
    lateral = 0 if side in ('upper','lower') else 1
    observations = [(half,stripe,visibility) for s,half,stripe,visibility in crosswalk_photo_samples(mask) if s==side]
    refs = [(half,stripe) for half,stripe,_ in observations]
    visibility = {id(stripe):flags for _,stripe,flags in observations}
    all_pairs = sum(len(ordered_pairs(
        sorted([g for j,g in refs if j==i],key=lambda g:g.centroid.coords[0][lateral]),
        sorted([g for g in stripes if half.covers(g.centroid)],key=lambda g:g.centroid.coords[0][lateral]),
        lateral)) for i,half in enumerate(halves))
    matched_visible = 0
    for i,half in enumerate(halves):
        g = [g for j,g in refs if j==i]
        photo = sorted([s for s in g if visibility[id(s)][0]],
                       key=lambda shape:shape.centroid.coords[0][lateral])
        auto = sorted([s for s in stripes if half.covers(s.centroid)],
                      key=lambda shape:shape.centroid.coords[0][lateral])
        pairs = ordered_pairs(photo,auto,lateral)
        matched_visible += len(pairs)

        def spacing(shapes):
            centres = [s.centroid.coords[0][lateral] for s in shapes]
            return percentile([b-a for a,b in zip(centres,centres[1:])],.5)

        centre_err = [ref.centroid.distance(paint.centroid) for ref,paint in pairs]
        ends_err = []
        for ref,paint in pairs:
            a,b = ref.coords
            dx,dy = (b[0]-a[0])/ref.length,(b[1]-a[1])/ref.length
            point = paint.centroid
            axis = LineString([(point.x-15*dx,point.y-15*dy),(point.x+15*dx,point.y+15*dy)])
            cropped = paint.intersection(axis)
            if cropped.geom_type!='LineString' or cropped.is_empty:
                continue
            ends = list(cropped.coords)
            for seen,(u,v) in zip(visibility[id(ref)][1:],((Point(a),ends[0]),(Point(b),ends[-1]))):
                if seen:
                    ends_err.append(u.distance(Point(v)))
        print(f"INFO | 횡단보도 {side}/{i+1} 실제 도색 | 손 도면 {len(g)}개, 자동 {len(auto)}개, "
              f"사진 보이는 줄 대응 {len(pairs)}/{len(photo)} · 간격 중앙값 {spacing(sorted(g,key=lambda q:q.centroid.coords[0][lateral])):.3f}"
              f" / {spacing(auto):.3f}m (손 / 자동) · 대응 중심 오차 중앙값 {percentile(centre_err,.5):.3f}m · "
              f"단부 중앙값/최대 {percentile(ends_err,.5):.3f}/{max(ends_err,default=math.inf):.3f}m ({len(ends_err)}끝)")
    print(f'INFO | 횡단보도 {side} 모든 표본의 실제 도색 일대일 대응 | {all_pairs}/{len(refs)} (횡방향 한계 0.55m)')
    return matched_visible


def check(data, size):
    errors = 0

    def row(label, measured, passed):
        nonlocal errors
        if not passed:
            errors += 1
        print(f"{'PASS' if passed else 'FAIL'} | {label} | {measured}")

    def by_id(bucket, key):
        return bucket.get(key, ())

    def united(parts):
        return unary_union([LineString([local(p) for p in part]) for part in parts])

    features = {f['id']: f for f in data['lines']}
    assert len(features) == len(data['lines']), 'duplicate feature identifier'

    aliases = {key:line for line in data['lines'] for key in line.get('mergedFrom',[])}

    def geometry(*ids):
        return united([p for key in ids for p in (features.get(key) or aliases.get(key, {})).get('parts', [])])

    def distances(reference, compared, mask=None):
        pts = photo_points(reference, mask)
        return [p.distance(compared) if not compared.is_empty else math.inf for p in pts]

    def stats(values):
        return percentile(values, .5), percentile(values, .9), max(values, default=math.inf)

    def fmt(values):
        return ' / '.join(f'{x:.3f}' for x in values)

    mask = obscured()
    total = 0
    for side, key, (a, b, c, d) in zip(SIDES, CENTRES, CENTRE_LINES):
        ref = trace_path(f'M{a} {b} L{c} {d}')[0]
        med = percentile(distances(ref, geometry(key)), .5)
        strips = features.get(key, {}).get('stripes', [])
        pair_ok = bool(strips) and len(strips) == 2 and len(strips[0]) == len(strips[1]) > 0
        gaps = []
        if pair_ok:
            for a, b in zip(*strips):
                left, right = LineString([local(p) for p in a]), LineString([local(p) for p in b])
                for rail, other in ((left, right), (right, left)):
                    gaps.extend(p.distance(other) for p in samples(rail))
        lo,hi = min(gaps,default=math.inf),max(gaps,default=math.inf)
        variation = hi-lo if gaps else math.inf
        row(f'{side} 중앙선 {key} 중앙값 / 복선 간격 최소 / 최대 / 편차(m)', f'{med:.6f} / {fmt((lo,hi,variation))}',
            med <= .6 and variation <= .02 and .34 <= lo <= hi <= .38)

        ds = []
        missing = []
        expected = sum(len(ids) for _,_,ids in LANES[side])
        for kind, index, ids in LANES[side]:
            if any(geometry(i).is_empty for i in ids):
                missing.extend(i for i in ids if geometry(i).is_empty)
            ref = trace_path(APPROACH[kind][index])[0]
            ds.extend(distances(ref, geometry(*ids), mask))
        med, p90, _ = stats(ds)
        row(f'{side} 차선·버스선 중앙값 / 90%(m)', f'{fmt((med,p90))} · 원자료 행 {expected-len(missing)}/{expected} · {len(ds)}점'
            + (f' · 누락 {", ".join(missing)}' if missing else ''), not missing and med <= .4 and p90 <= 1)

    stop_angles = []
    for key, d in zip(STOPS, APPROACH['stop']):
        ref = trace_path(d)[0]
        g = geometry(key)
        med = percentile(distances(ref, g, mask), .5)
        row(f'정지선 {key} 중앙값(m)', f'{med:.3f} · 대응 {int(not g.is_empty)}/1', med <= .5)
        if isinstance(g, LineString):
            (a,b), (c,d) = g.coords[0], g.coords[-1]
            stop_angles.append(math.degrees(math.atan2(d-b,c-a)) % 180)
        else:
            stop_angles.append(math.inf)
    for side, i in (('북',0), ('남',2)):
        a,b = stop_angles[i:i+2]
        delta = min(abs(a-b), 180-abs(a-b)) if math.isfinite(a) and math.isfinite(b) else math.inf
        first, second = (geometry(key) for key in STOPS[i:i+2])
        unit = (math.cos(math.radians(a)), math.sin(math.radians(a))) if math.isfinite(a) else (1,0)
        widths = [sorted(x*unit[0]+y*unit[1] for x,y in g.coords)
                  for g in (first,second) if isinstance(g, LineString)]
        overlap = max(0, min(w[-1] for w in widths)-max(w[0] for w in widths)) if len(widths)==2 else math.inf
        row(f'{side} 정지선 각도 차(°) / 담당 폭 중복(m)', fmt((delta,overlap)), delta <= 1 and overlap <= .02)

    for index, (key,d) in enumerate(zip(GUIDE_IDS, GUIDES+BUS_GUIDES), 1):
        ds = distances(trace_path(d)[0], geometry(key), mask)
        med = percentile(ds,.5)
        row(f'유도선 {index}/12 {key} 중앙값(m)',
            f'{med:.3f} · 대응 {int(not geometry(key).is_empty)}/1 · {len(ds)}점'
            f" · 구기준 1.2m {'통과' if med<=1.2 else '미달'} · 현기준 2.0m {'통과' if med<=2.0 else '미달'}",
            med <= 2.0)

    faces = {f['id']: f for f in data['crossings']}
    counts = {side: [0,0,0,0,[]] for side in CROSS_IDS}
    for side, half, stripe, (seen_mid, *seen_ends) in crosswalk_photo_samples(mask):
        count = counts[side]
        count[0] += 1
        total += 1
        f = faces.get(CROSS_IDS[side])
        face = Polygon([local(p) for p in f['face']]) if f else Polygon()
        mid = stripe.interpolate(.5, normalized=True)
        count[1] += face.covers(mid)
        count[2] += seen_mid
        count[3] += seen_mid and face.covers(mid)
        halves = f.get('halves', []) if f else []
        half_geom = [Polygon([local(p) for p in ring]) for ring in halves]
        # The physical median seam is a boundary of each painted half.
        own_half = half_geom[half] if len(half_geom) == 2 else Polygon()
        for seen,pt in zip(seen_ends,map(Point,stripe.coords)):
            if seen:
                count[4].append(pt.distance(own_half.boundary) if not own_half.is_empty else math.inf)
    visible_count = sum(c[2] for c in counts.values())
    visible_inside = sum(c[3] for c in counts.values())
    full_inside = sum(c[1] for c in counts.values())
    row('횡단보도 줄 가운데', f'전체 {full_inside}/{total}, 사진 검증 가능 {visible_inside}/{visible_count}',
        full_inside == total == 139)
    painted_visible = 0
    for side, (_,_,_,_,ends) in counts.items():
        worst = max(ends, default=math.inf)
        row(f'횡단보도 {side} 끝→같은 반쪽 경계 최대(m)', f'{worst:.3f} · {len(ends)}끝', worst <= 1)
        if CROSS_IDS[side] in faces:
            painted_visible += stripe_comparison(side, faces[CROSS_IDS[side]], mask)
    row('보이는 횡단보도 줄과 실제 도색의 일대일 대응 (보조 검사)',
        f'{painted_visible}/{visible_count} · 자동 도색 {sum(len(f["stripes"]) for f in faces.values())}개',
        painted_visible == visible_count)

    curb_masks = unary_union([line.buffer(.35) for d in OCCLUDED['curb'] for line in trace_path(d)])
    curbs = {t['corner']: t for t in data['curbs']}
    curb_signed = []
    for corner, (start, trace, _) in zip(('NW','SW','SE','NE'), CORNERS):
        ref = trace_path(f'M{start} {trace}')[0]
        actual = united(by_id(curbs.get(corner, {}),'parts'))
        pts = photo_points(ref,curb_masks)
        vals = stats(distances(ref, actual, curb_masks))
        old = all(x <= limit for x, limit in zip(vals, (.8,1.5,2)))
        current = all(x <= limit for x, limit in zip(vals, (1.2,1.5,2)))
        row(f'연석 {corner} 중앙값 / 90% / 최대(m)',
            f"{fmt(vals)} · {len(pts)}점 · 구기준 0.8m {'통과' if old else '미달'}"
            f" · 현기준 1.2m {'통과' if current else '미달'}", current)
        if isinstance(actual, LineString):
            for p in pts:
                x,y = p.coords[0]
                if abs(x)>36 or abs(y)>40:
                    axis = 1 if abs(x)>36 else 0
                    q = actual.interpolate(actual.project(p))
                    curb_signed.append((p.coords[0][axis]-q.coords[0][axis])*math.copysign(1,p.coords[0][axis]))
    offset = data['curbOffsetMetres']
    print(f'INFO | 연석 직선부 | {len(curb_signed)}점, 보정 전 바깥 방향 부호 중앙값 '
          f'{offset+percentile(curb_signed,.5):.3f}m · 적용 {offset:.3f}m')

    road = unary_union([Polygon([local(p) for p in ring]) for ring in data['road']])
    # Fixed photo counterparts establish which inbound lane group a
    # staggered stop serves. A disconnected fragment behind it is still wrong.
    retained = []
    stop_groups = (
        ('L8055',1,-1,('L7976','L7977','L7978','L3825'),'upper'),
        ('L4737',1,-1,('L3825',),'upper'),
        ('L4585:F04',1,1,('L1361',),'lower'),
        ('L4585:F05',1,1,('L1854','L7103','L1853','L6730','L1361'),'lower'),
        ('L667',0,-1,('L2630','L2487'),'left'),
    )
    for stop_key,axis,sign,ids,side in stop_groups:
        stop = geometry(stop_key)
        cross = faces.get(CROSS_IDS[side])
        if stop.geom_type!='LineString' or not cross:
            retained.append(math.inf)
            continue
        a,b = list(stop.coords)[::len(stop.coords)-1]
        crossing = Polygon([local(p) for p in cross['face']])
        far = crossing.bounds[axis+(2 if sign>0 else 0)]
        length = sign*((a[axis]+b[axis])/2-far)
        if length<=0:
            retained.append(0)
            continue
        def inward(p):
            out = list(p)
            out[axis] -= sign*length
            return out
        shadow = Polygon([a,b,inward(b),inward(a)]).buffer(-.014)
        retained.append(sum(geometry(i).intersection(shadow).length for i in ids))
    row('정지선 담당 폭 안의 뒤쪽 차선 잔여 길이(m)', fmt(retained), max(retained)<1e-7)
    zebra = unary_union([Polygon([local(p) for p in f['face']]) for f in data['crossings']])
    ribbon = {f['id']: line_footprint(f,local) for f in data['lines']}
    stop_ids = [f['id'] for f in data['lines'] if f['kind']==4]
    approach_ids = [f['id'] for f in data['lines'] if f['kind'] in (1,6,8,17) and not f.get('guide')]
    stops = unary_union([ribbon[key] for key in stop_ids])
    approach = unary_union([geometry(key) for key in approach_ids])
    stripe_paint = unary_union([Polygon([local(p) for p in ring]) for f in data['crossings'] for ring in f['stripes']])
    a = math.radians(ROTATION)
    def vector(x,y):
        return x*math.cos(a)+y*math.sin(a),-x*math.sin(a)+y*math.cos(a)
    arrows = data['arrows']
    arrow_paint = [arrow_geometry(f,local,vector) for f in arrows if 'duplicateOf' not in f]
    ink = unary_union([*ribbon.values(),stripe_paint,*arrow_paint])
    inventory = data['arrowInventory']
    source_arrows = json.loads((RAW/'seoul-arrows.json').read_text())['arrows']
    audited = [*arrows,*inventory['omitted']]
    matched = sum(f['sourceAt']==[source['lon'],source['lat']] and f['kind']==int(source['kind'])
                  and f['sourceBearing']==source['drn'] for f in audited
                  for source in [source_arrows[int(f['id'][1:])]])
    row('화살표 원자료 대응 및 결과 추적', f'{matched}/{inventory["frameRows"]}행 · 생성 {len(arrows)}개',
        matched==len(audited)==len({f['id'] for f in audited})==inventory['frameRows'])
    approach_ink = unary_union([ribbon[key] for key in approach_ids])
    mask_ink = stops.union(stripe_paint)
    all_lines = unary_union([geometry(key) for key in ribbon])
    # Geographic quantization is about 7mm per vertex, up to approximately
    # 14mm between independently rounded boundaries. Report raw and beyond
    # the tolerance band independently, with no area-dependent threshold.
    tolerance = .014
    tests = [
        ('중심선 길이(m)', 'length', approach,zebra.union(stops),all_lines),
        ('실제 도색 면적(m²)', 'area', approach_ink,mask_ink,ink),
    ]
    for label,metric,pa,mask_shape,all_ink in tests:
        raw = (getattr(pa.intersection(mask_shape),metric),getattr(all_ink.difference(road),metric))
        beyond = (getattr(pa.intersection(mask_shape.buffer(-tolerance)),metric),
                  getattr(all_ink.difference(road.buffer(tolerance)),metric))
        row(f'겹침 / 찻길 밖 {label}',
            f'원수치 {raw[0]:.8f} / {raw[1]:.8f} · {tolerance:.3f}m 허용대 초과 {beyond[0]:.8f} / {beyond[1]:.8f}',
            max(beyond) < 1e-7)
    fixes = json.loads((MAPO/'tools/v2/seogyo-fixes.json').read_text())['fixes']
    numbers = {f['id'] for f in fixes}
    row('고친 목록', f'{len(fixes)}건', len(numbers) == len(fixes) <= 20
        and numbers == set(data['fixes']) and all(f.get('why') and f.get('photo') for f in fixes))
    expected_occluded = {'L5712','L5941','L6141'}
    actual_occluded = {f['id'] for f in data['lines'] if f['photo']=='occluded' and f['source']=='seoul' and not f['fixes']}
    row('동쪽 가림 서울시 원자료', f'{len(expected_occluded & actual_occluded)}/3 · ' + ', '.join(sorted(actual_occluded)),
        actual_occluded == expected_occluded)
    print('INFO | 화살표 |', f"원자료 {inventory['frameRows']}행, 생성 {len(arrows)}개, 미생성 {len(inventory['omitted'])}행")
    row('결과 크기(B)', str(size), size <= 100_000)
    return int(errors > 0)


def north_baseline():
    lines,_ = raw_data()
    targets = (*LANES['북'], ('centre',0,(CENTRES[0],)))
    for name, index, ids in targets:
        if name == 'centre':
            a,b,c,d = CENTRE_LINES[index]
            ref = trace_path(f'M{a} {b} L{c} {d}')[0]
        else:
            ref = trace_path(APPROACH[name][index])[0]
        (x,y),(x1,y1) = ref.coords
        for key in ids:
            source = lines[key][2]
            delta = [p.x-x-(x1-x)*(p.y-y)/(y1-y) for p in samples(source)
                     if min(y,y1)<=p.y<=max(y,y1)]
            print(f'{name}/{index} | {key} | {len(delta)}점 | 횡방향 부호 중앙값 {percentile(delta,.5):+.3f}m')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inventory', action='store_true')
    parser.add_argument('--north-baseline', action='store_true')
    parser.add_argument('--ground', type=Path, default=DATA)
    args = parser.parse_args()
    if args.inventory:
        raw_inventory()
        return 0
    if args.north_baseline:
        north_baseline()
        return 0
    if not args.ground.is_file():
        print('FAIL: generated ground missing; required feature comparisons cannot run')
        return 1
    return check(json.loads(args.ground.read_text()), args.ground.stat().st_size)


if __name__ == '__main__':
    raise SystemExit(main())
