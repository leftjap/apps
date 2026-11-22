# 지시서 2(docs/redraw-orders/2-split.md): 1단계 도로 부지를 찻길 / 인도 / 함께 쓰는 면 / 보행 전용 띠로 나눈다.
# 광장(OSM 광장 면, board.json 의 ga 종류 23)은 보행 전용 띠와 합쳐 사람만 쓰는 면 ped 로 쓴다(5판).
# 읽는 것: public/data/v2/land.json, tmp/v2/roads.json, public/data/board.json(ga·b). 결과는 public/data/v2/split.json.
# 실행: tools/.venv/bin/python tools/v2/split.py
import json, os, time
import shapely
from shapely.geometry import LineString, MultiLineString, Polygon, box
from shapely.ops import unary_union
from shapely import make_valid

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

# docs/redraw.md 6절
W = {'g1': 3.75, 'g2': 3.25, 'g3': 2.75}  # 인도 폭(등급 0 은 인도 없음)
H = {'g0': 12.0, 'g1': 28.0, 'g2': 14.0, 'g3': 10.0}  # 찻길을 찾는 범위(중심선에서). g0 은 이 안의 도로 부지 전체가 찻길
GROUP = {0: 'g0', 1: 'g1', 2: 'g2', 3: 'g3'}
DENT_HALF = 0.5  # 인도 경계를 정할 때 무시하는 홈 폭의 반
CAR_HALF = 3.0  # 찻길로 보는 가장 좁은 폭의 반, 좁은 큰길에서 언제나 찻길인 중심선 양쪽 폭
KEEP_WALK = 1.5  # 좁은 큰길에서 남기는 인도
ALLEY_HALF = 2.0  # 골목 입구 폭의 반
PED_HALF = 2.0  # 보행 전용 띠 폭의 반
MIN_AREA = 1.0  # 이보다 작은 조각·구멍은 지운다(㎡)
PLAZA_GAP_HALF = 1.5  # 광장과 도로 부지 사이에서 메우는 틈 폭의 반
PLAZA_ALLEY_HALF = 3.0  # 광장 안에 남기는 골목 띠 폭의 반
PLAZA_KIND = 23  # board.json ga 의 OSM 광장·보행 면


def dm(a):
    return [(a[i] / 10, a[i + 1] / 10) for i in range(0, len(a) - 1, 2)]


def polygons(g):
    if g.is_empty:
        return []
    if g.geom_type == 'Polygon':
        return [g]
    return [p for part in getattr(g, 'geoms', []) for p in polygons(part)]


def road_chains(road):
    """쓰는 선분이 이어진 토막마다 [(x,z), ...]. 큰길(등급 0~3)은 높이와 상관없이 모든 선분, 골목·보행 전용(등급 4~6)은 땅 위(양 끝 y < 0.3) 선분만(지시서 4b)"""
    p = road['p']
    pts = [(p[i], p[i + 1], p[i + 2]) for i in range(0, len(p) - 2, 3)]
    big = road['cls'] <= 3
    chains, cur = [], []
    for a, b in zip(pts, pts[1:]):
        if big or (a[1] < 0.3 and b[1] < 0.3):
            if not cur:
                cur = [(a[0], a[2])]
            cur.append((b[0], b[2]))
        elif cur:
            chains.append(cur)
            cur = []
    if cur:
        chains.append(cur)
    return [c for c in chains if LineString(c).length > 0]


def load_lines(area):
    """쓰는 중심선(road_chains)을 묶음별 MultiLineString 으로: g0·g1·g2·g3, alley(등급 4·5), ped(등급 6).
    구역에서 50m(가장 넓은 띠 28m 보다 넓게) 넘게 떨어진 선은 결과에 영향이 없어 읽지 않는다"""
    near = box(area[0] - 50, area[1] - 50, area[2] + 50, area[3] + 50)
    out = {k: [] for k in ('g0', 'g1', 'g2', 'g3', 'alley', 'ped')}
    for r in json.load(open(os.path.join(ROOT, 'tmp', 'v2', 'roads.json'))):
        c = r['cls']
        key = GROUP.get(c) or ('alley' if c in (4, 5) else 'ped' if c == 6 else None)
        if key is None:
            continue
        for ch in road_chains(r):
            line = LineString(ch)
            if line.intersects(near):
                out[key].append(line)
    return {k: MultiLineString(v) for k, v in out.items()}


def load_plazas(rect):
    """종류 23 인 ga 면(바깥 고리와 구멍)을 합쳐 구역으로 자른 것과, 구역과 겹치는 면의 개수"""
    gs = []
    for g in json.load(open(os.path.join(ROOT, 'public', 'data', 'board.json')))['ga']:
        if g[0] != PLAZA_KIND:
            continue
        rings = [dm(r) for r in g[3:] if len(r) >= 6]
        if rings:
            p = make_valid(Polygon(rings[0], rings[1:]))
            if p.intersects(rect):
                gs.append(p)
    return unary_union(gs).intersection(rect), len(gs)


def load_buildings(rect):
    """모든 건물을 합친 것(land.py 와 같은 읽는 법)"""
    out = []
    for b in json.load(open(os.path.join(ROOT, 'public', 'data', 'board.json')))['b']:
        pts = [(b[i] / 10, b[i + 1] / 10) for i in range(2, len(b) - 1, 2)]
        if len(pts) >= 3:
            g = make_valid(Polygon(pts))
            if g.intersects(rect):
                out.append(g)
    return unary_union(out)


def clean(g):
    """make_valid 한 뒤 dm 격자에 맞추고, 넓이 1㎡ 아래 조각과 구멍을 지운다"""
    g = shapely.set_precision(make_valid(g), 0.1)
    keep = []
    for p in polygons(g):
        if p.area < MIN_AREA:
            continue
        keep.append(Polygon(p.exterior, [h for h in p.interiors if Polygon(h).area >= MIN_AREA]))
    return keep


def ring_dm(ring):
    c = list(ring.coords)[:-1]
    return [v for x, z in c for v in (round(x * 10), round(z * 10))]


def main():
    t0 = time.time()
    land = json.load(open(os.path.join(ROOT, 'public', 'data', 'v2', 'land.json')))
    area = land['area']
    # 1. 도로 부지 R
    R = unary_union([make_valid(Polygon(dm(p[0]), [dm(h) for h in p[1:]])) for p in land['road']])
    L = load_lines(area)

    # 2. 찻길: 묶음마다 C_g, 그 옆 인도가 놓일 띠 Band_g. Rc(폭 1m 아래 홈을 메운 면)는 인도 경계를 정하는 데만 쓴다
    Rc = R.buffer(DENT_HALF).buffer(-DENT_HALF)
    Cs, Bands = [L['g0'].buffer(H['g0']).intersection(R)], []  # g0 은 인도가 없다
    R_in = R.buffer(-KEEP_WALK)
    for g in ('g1', 'g2', 'g3'):
        E = Rc.buffer(-W[g])
        T = E.buffer(-CAR_HALF).buffer(CAR_HALF)
        Z = L[g].buffer(H[g])
        A = T.intersection(Z).intersection(R)
        B = L[g].buffer(CAR_HALF).intersection(R_in)
        C = A.union(B)
        Cs.append(C)
        Bands.append(C.buffer(W[g] + 0.3).intersection(R))
    car = unary_union(Cs)
    # 3. 큰길 인도 띠
    band = unary_union(Bands).difference(car)
    # 4. 골목 입구
    alley_flat = L['alley'].buffer(ALLEY_HALF, cap_style='flat')
    M = alley_flat.intersection(band)
    # 5. 나머지
    Q = R.difference(car).difference(band)
    # 6. 보행 전용 띠
    ped = L['ped'].buffer(PED_HALF, cap_style='flat').intersection(Q)  # 골목 띠는 빼지 않는다
    # 7. 나머지 조각마다 골목 중심선과 만나면 함께 쓰는 면, 아니면 인도
    shapely.prepare(L['alley'])
    mix_parts, walk_parts = [], []
    for p in polygons(Q.difference(ped)):
        (mix_parts if L['alley'].intersects(p) else walk_parts).append(p)
    # 8.
    mix = unary_union(mix_parts + [M])
    walk = unary_union([band.difference(M)] + walk_parts)

    # 8-1. 광장
    rect = box(*area)
    U, n_plaza = load_plazas(rect)
    Bld = load_buildings(rect)
    print(f'광장 면(종류 23) {n_plaza}개 {U.area:.0f}㎡, 도로 부지와 겹침 {U.intersection(R).area:.0f}㎡, 건물과 겹침 {U.intersection(Bld).area:.0f}㎡')
    P_in = U.intersection(unary_union([mix, walk, ped])).difference(L['alley'].buffer(PLAZA_ALLEY_HALF, cap_style='flat'))
    out_only = U.difference(R).difference(Bld)
    shapely.prepare(out_only)
    G = U.union(R).buffer(PLAZA_GAP_HALF).buffer(-PLAZA_GAP_HALF).difference(R).difference(Bld)
    P_out = unary_union([p for p in polygons(G) if out_only.intersects(p)])
    plaza = P_in.union(P_out)
    before = {'mix': mix.area, 'walk': walk.area}
    mix, walk = mix.difference(plaza), walk.difference(plaza)
    ped = ped.union(plaza)  # 보행 전용 띠와 광장은 같은 「사람만 쓰는 면」이다
    print(f'광장: 도로 부지 안 {P_in.area:.0f}㎡, 밖 {P_out.area:.0f}㎡. 줄어든 넓이: 함께 쓰는 면 {before["mix"] - mix.area:.0f}㎡, '
          f'인도 {before["walk"] - walk.area:.0f}㎡. 사람만 쓰는 면: 도로 부지 안 {ped.intersection(R).area:.0f}㎡, 밖 {ped.difference(R).area:.0f}㎡')

    # 9·10.
    out = {'v': 3, 'area': area}
    for name, g in (('car', car), ('walk', walk), ('mix', mix), ('ped', ped)):
        keep = clean(g)
        out[name] = [[ring_dm(p.exterior)] + [ring_dm(h) for h in p.interiors] for p in keep]
        print(f'{name}: 다각형 {len(keep)}개, 넓이 {sum(p.area for p in keep):.0f}㎡')
    path = os.path.join(ROOT, 'public', 'data', 'v2', 'split.json')
    json.dump(out, open(path, 'w'), separators=(',', ':'))
    print(f'도로 부지 {R.area:.0f}㎡ → {path} ({os.path.getsize(path) / 1e6:.2f}MB, {time.time() - t0:.1f}초)')


if __name__ == '__main__':
    main()
