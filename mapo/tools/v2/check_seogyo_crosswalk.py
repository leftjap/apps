"""Check the eight halves against the independent, photo-interpreted trace."""
import argparse
import json
import math
from pathlib import Path

from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

from aerial_paint import line_footprint
from check_seogyo_auto import CROSS_IDS, DATA, crosswalk_photo_samples, local, obscured, ordered_pairs

# Allow for the aerial image and hand-read geometry. Require a match to the
# original rank in each half, with no extra, missing, or reused painted stripe.
MAX_SPACING_DRIFT = .035
MAX_PHASE_ERROR = .35
MAX_VISIBLE_END_ERROR = .45
ROUNDING_BAND = .014
MAX_HALF_BOUNDARY_ERROR = 1.0


def coord(shape, dimension):
    return shape.centroid.coords[0][dimension]


def pitch(indexed, axis):
    if len(indexed) < 2:
        return math.nan
    mean_i = sum(i for i,_ in indexed)/len(indexed)
    mean_x = sum(coord(s,axis) for _,s in indexed)/len(indexed)
    return sum((i-mean_i)*(coord(s,axis)-mean_x) for i,s in indexed)/sum((i-mean_i)**2 for i,_ in indexed)


def ends_of(stripe, axis):
    centre = stripe.centroid
    line = ([(centre.x-20,centre.y),(centre.x+20,centre.y)] if axis==0 else
            [(centre.x,centre.y-20),(centre.x,centre.y+20)])
    core = stripe.intersection(LineString(line))
    if core.geom_type != 'LineString' or core.is_empty:
        return ()
    return tuple(sorted((Point(core.coords[0]),Point(core.coords[-1])),key=lambda p:p.coords[0][axis]))


def guide_axis(line):
    return unary_union([LineString([local(p) for p in path]) for path in line['parts']])


def intrudes(area, axis, ink):
    return area.intersection(axis).length>1e-7 or area.intersection(ink).area>1e-7


def check(data, baseline=None):
    found = {c['id']:c for c in data['crossings']}
    observations = list(crosswalk_photo_samples(obscured()))
    road = unary_union([Polygon([local(p) for p in r]) for r in data['road']])
    guides = {line['id']:(guide_axis(line),line_footprint(line,local))
              for line in data['lines'] if line.get('guide')}
    guide_axes = unary_union([axis for axis,_ in guides.values()])
    guide_ink = unary_union([ink for _,ink in guides.values()])
    failed = False
    totals = [0]*6

    def row(ok, name, result):
        nonlocal failed
        failed |= not ok
        print(f"{'PASS' if ok else 'FAIL'} | {name} | {result}")

    for side, key in CROSS_IDS.items():
        crossing = found.get(key)
        if crossing is None:
            row(False,key,'missing crossing')
            continue
        face = Polygon([local(p) for p in crossing['face']])
        halves = [Polygon([local(p) for p in ring]) for ring in crossing['halves']]
        stripes = [Polygon([local(p) for p in ring]) for ring in crossing['stripes']]
        estimated = set(crossing.get('estimatedStripes',[]))
        along = int(side in ('upper','lower'))
        across = 1-along
        row(len(halves)==2,key,'half count '+str(len(halves)))
        checked_indexes = set()
        half_endpoint_distances = []
        for section,half in enumerate(halves):
            half_refs = [(stripe,flags) for name,i,stripe,flags in observations if name==side and i==section]
            refs = [stripe for stripe,_ in half_refs]
            visibility = {id(stripe):flags for stripe,flags in half_refs}
            half_endpoint_distances.extend(Point(p).distance(half.boundary) for ref,(_, *ends) in half_refs
                                           for p,seen in zip(ref.coords,ends) if seen)
            paints = sorted(((i,s) for i,s in enumerate(stripes) if half.covers(s.centroid)),
                            key=lambda indexed:coord(indexed[1],across))
            matched = list(zip(refs,[s for _,s in paints])) if len(refs)==len(paints) else ordered_pairs(
                refs,[s for _,s in paints],across)
            visible_indices = {i for i,(_, flags) in enumerate(half_refs) if flags[0]}
            visible_stripes = [(i,ref) for i,ref in enumerate(refs) if i in visible_indices]
            spacing_ref = pitch(visible_stripes,across)
            spacing = pitch(list(enumerate(s for _,s in paints)),across)
            phase = []
            end_error = [[],[]]
            expected_estimated = set()
            for ref,actual in matched:
                a,b = tuple(Point(p) for p in ref.coords)
                actual_ends = ends_of(actual,along)
                seen_mid, *seen_ends = visibility[id(ref)]
                if not (seen_mid and all(seen_ends)):
                    expected_estimated.add(next(i for i,s in paints if s is actual))
                if seen_mid:
                    phase.append(coord(actual,across)-coord(ref,across))
                for j,(p,seen) in enumerate(zip((a,b),seen_ends)):
                    if seen:
                        end_error[j].append(p.distance(actual_ends[j]) if actual_ends else math.inf)
            seen_ends = sum(sum(flags[1:]) for _,flags in half_refs)
            covered = sum(face.covers(r.centroid) for r in refs)
            p_max = max((abs(e) for e in phase),default=math.inf)
            e_max = [max(v,default=math.inf) for v in end_error]
            indexes = {i for i,_ in paints}
            totals = [a+b for a,b in zip(totals,(len(refs),len(paints),len(visible_indices),
                                                len(phase),seen_ends,len(expected_estimated)))]
            row(len(refs)==len(paints)==len(matched)==covered and not (indexes & checked_indexes)
                and len(phase)==len(visible_indices) and sum(map(len,end_error))==seen_ends
                and abs(spacing_ref-spacing)<=MAX_SPACING_DRIFT and p_max<=MAX_PHASE_ERROR
                and max(e_max)<=MAX_VISIBLE_END_ERROR and expected_estimated==indexes&estimated,
                f'{side}/{section+1}',f'줄 {len(paints)}/{len(refs)}, 보이는 중심 {len(phase)}/{len(visible_indices)}, '
                f'간격 {spacing:.3f}/{spacing_ref:.3f}m, 중심 위상 최대 {p_max:.3f}m, '
                f'보이는 양 끝 최대 {e_max[0]:.3f}/{e_max[1]:.3f}m ({sum(map(len,end_error))}/{seen_ends}끝), '
                f'추정 표기 {len(indexes&estimated)}/{len(expected_estimated)}')
            checked_indexes.update(indexes)
        worst_boundary = max(half_endpoint_distances,default=math.inf)
        row(len(halves)==2 and worst_boundary<=MAX_HALF_BOUNDARY_ERROR,
            f'{side} 같은 반쪽 면 경계↔사진 줄 끝 (5절)',
            f'최대 {worst_boundary:.3f}m / {MAX_HALF_BOUNDARY_ERROR:.1f}m · 보이는 {len(half_endpoint_distances)}끝')
        shapes = unary_union(stripes)
        overlap = max(0,sum(s.area for s in stripes)-shapes.area)
        outside = shapes.difference(face.intersection(road).buffer(ROUNDING_BAND)).area
        row(len(checked_indexes)==len(stripes) and estimated<=checked_indexes and overlap<1e-6 and outside<1e-6,
            f'{side} 도색 면',f'줄 중복 {overlap:.6f}㎡, 면·차도 밖 {outside:.6f}㎡')
        for i,half in enumerate(halves,1):
            length = half.intersection(guide_axes).length
            area = half.intersection(guide_ink).area
            ids = [key for key,(axis,ink) in guides.items() if intrudes(half,axis,ink)]
            row(not ids,f'{side}/{i} 반쪽 전체 면 유도선 침범',
                f'중심선 {length:.6f}m · 도색 {area:.6f}㎡' + (f' · {", ".join(ids)}' if ids else ''))
    ref,drawn,visible,matched,ends,estimated = totals
    print(f'합계 | 도색 {drawn}/{ref}줄, 보이는 중심 {matched}/{visible}, 중심 미확인 {ref-visible}/{ref}, '
          f'보이는 단부 {ends}/{2*ref}, 일부라도 미확인인 추정 줄 {estimated}/{ref}')
    print(f'기준 | 간격 차이 ≤{MAX_SPACING_DRIFT}m, 위상 최대 ≤{MAX_PHASE_ERROR}m, '
          f'보이는 단부 각각 ≤{MAX_VISIBLE_END_ERROR}m, 반올림 경계 여유 {ROUNDING_BAND}m')
    outside_length = guide_axes.difference(road).length
    outside_area = guide_ink.difference(road).area
    row(max(outside_length,outside_area)<1e-7,'유도선 차도 밖 이탈',
        f'중심선 {outside_length:.6f}m · 도색 {outside_area:.6f}㎡')
    if baseline is not None:
        keys = (data.keys() | baseline.keys()) - {'lines'}
        changed = [key for key in sorted(keys) if data.get(key)!=baseline.get(key)]
        row(not changed,'형상 보완 범위 밖 JSON',f'변경 항목 {changed}')
        old_lines = {line['id']:line for line in baseline['lines']}
        new_lines = {line['id']:line for line in data['lines']}
        halves_union = unary_union([Polygon([local(p) for p in ring])
                                    for c in baseline['crossings'] for ring in c['halves']])
        expected = {key for key,line in old_lines.items() if line.get('guide')
                    and intrudes(halves_union,guide_axis(line),line_footprint(line,local))}
        changed_ids = {key for key in old_lines.keys()|new_lines.keys() if old_lines.get(key)!=new_lines.get(key)}
        row(changed_ids==expected,'반쪽 면을 침범한 유도선만 절단',
            f'실제 {sorted(changed_ids)} · 기대 {sorted(expected)}')
        envelope = halves_union.buffer(.13)
        for key in sorted(changed_ids & expected):
            old = line_footprint(old_lines[key],local)
            new = line_footprint(new_lines[key],local) if key in new_lines else Polygon()
            moved = new.difference(old.buffer(ROUNDING_BAND)).area
            removed = old.difference(new.buffer(ROUNDING_BAND)).difference(envelope).area
            row(max(moved,removed)<1e-7,f'{key} 절단 밖 기존 도색 유지',
                f'이동 {moved:.6f}㎡ · 절단 밖 제거 {removed:.6f}㎡')
    return int(failed)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ground',type=Path,default=DATA)
    parser.add_argument('--baseline',type=Path)
    args = parser.parse_args()
    previous = json.loads(args.baseline.read_text()) if args.baseline else None
    raise SystemExit(check(json.loads(args.ground.read_text()),previous))
