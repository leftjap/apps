"""Measure crossing widths and the engine's 0.85m-spaced waiting places."""
import argparse
import json
import math
from itertools import pairwise

from check_hapjeong_walk import faces, read

MAX_NARROW = 5
MIN_LINK_FACE_PERCENT = 41.69  # S4's measured minimum, at the precision shown in the rules.
SLOT_PITCH = .85


def waiting_places(at, a, b, limits, rear_depth=.75):
    """Count positions a full 0.85m apart in both directions."""
    dx, dz = b[0]-a[0], b[1]-a[1]
    v = ((at[1]-a[1])*dx - (at[0]-a[0])*dz) / math.hypot(dx, dz)
    lo, hi = limits
    if not lo-.02 <= v <= hi+.02:
        return 0
    columns = sum(lo-1e-9 <= v+k*SLOT_PITCH <= hi+1e-9 for k in range(-3, 4))
    rows = 1 + math.floor((rear_depth+1e-9)/SLOT_PITCH)
    return columns*rows


def measure(floor, graph):
    widths = {row['id']: min(math.dist(a, b) for a,b in pairwise(
        faces(row['faces']).minimum_rotated_rectangle.exterior.coords)) for row in floor['crossingAudit']}
    result = []
    for i, _, _, ax, az, bx, bz, pax, paz, pbx, pbz, width, _, alo, ahi, blo, bhi in zip(
            *(iter(graph['x']),)*17, strict=True):
        key = graph['crossings'][i]
        a, b = (ax/10, az/10), (bx/10, bz/10)
        dims = (width/10, widths[key])
        a_depth,b_depth = graph['waitDepths'][i] if 'waitDepths' in graph else (.75,.75)
        result.append(dict(id=key[-4:], link_m=dims[0], face_m=dims[1], ratio_percent=100*dims[0]/dims[1],
                           a_places=waiting_places((pax/10,paz/10), a,b, (alo/10,ahi/10), a_depth),
                           b_places=waiting_places((pbx/10,pbz/10), a,b, (blo/10,bhi/10), b_depth)))
    return result


def summary(rows):
    return dict(min_link_face_pct=round(min(r['ratio_percent'] for r in rows), 2),
                under_80_width=sum(r['ratio_percent'] < 80 for r in rows))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    rows = measure(read('a'), read('walk'))
    totals = summary(rows)
    print(json.dumps(dict(summary=totals, crossings=rows), ensure_ascii=False, indent=2))
    if args.verify:
        assert totals['under_80_width'] <= MAX_NARROW, totals
        assert totals['min_link_face_pct'] >= MIN_LINK_FACE_PERCENT, totals
        assert all(r['a_places'] and r['b_places'] for r in rows), 'missing crossing waiting place'
