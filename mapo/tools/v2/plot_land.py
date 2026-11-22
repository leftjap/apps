# 지시서 1(docs/redraw-orders/1-land.md): land.json 을 위에서 본 그림으로(tmp/v2/), 수치지형도 도로 부지와 나란히 칠한 그림과 넓이.
# 시스템 python3(PIL)로 돈다. shapely 를 쓰지 않는다. 실행: python3 tools/v2/plot_land.py
import glob, json, os, sys
from PIL import Image, ImageChops, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from tm import tm_to_xz  # noqa: E402
from shp import shapes  # noqa: E402

OUT = os.path.join(ROOT, 'tmp', 'v2')
SURVEY = ('N1A_A0010000', 'N1A_A0033320', 'N1A_A0043325', 'N1A_A0080000')  # 도로·인도·횡단보도·교차로 면
BLD, ROAD, REST = (150, 130, 110), (74, 78, 94), (226, 228, 222)
OURS, THEIRS = (220, 40, 40), (40, 90, 220)
SHEETS = (-794, -943, 971, 721)  # 수치지형도 12도엽이 덮는 판 좌표(지시서 4a). 측량과 견주는 그림은 이 범위만


def dm(a):
    return [(a[i] / 10, a[i + 1] / 10) for i in range(0, len(a) - 1, 2)]


def ring_area(r):
    return abs(sum(r[i][0] * r[i - 1][1] - r[i - 1][0] * r[i][1] for i in range(len(r)))) / 2


SS = 4  # PIL 은 경계 픽셀을 모두 칠하므로 4배로 칠한 뒤, 칸마다 절반 넘게 덮인 곳만 남긴다


class Canvas:
    """창 (x0, z0, x1, z1) 를 1m = s px 로. 위가 북쪽(z 가 작은 쪽). 칠하기는 SS 배 크기에서 한다"""

    def __init__(self, win, s):
        self.x0, self.z0, self.s = win[0], win[1], s * SS
        self.out = (round((win[2] - win[0]) * s), round((win[3] - win[1]) * s))
        self.size = (self.out[0] * SS, self.out[1] * SS)

    def px(self, ring):
        return [((x - self.x0) * self.s, (z - self.z0) * self.s) for x, z in ring]

    def mask(self):
        return Image.new('1', self.size, 0)

    def reduce(self, m):
        return m.convert('L').reduce(SS).point(lambda v: 255 if v > 127 else 0).convert('1')


def fill_polygons(cv, polys):
    """다각형 목록([바깥, 구멍...]) → 마스크. 넓은 것부터 칠해 구멍 안의 섬이 지워지지 않게 한다"""
    m = cv.mask()
    d = ImageDraw.Draw(m)
    for rings in sorted(polys, key=lambda p: -ring_area(p[0])):
        d.polygon(cv.px(rings[0]), fill=1)
        for h in rings[1:]:
            d.polygon(cv.px(h), fill=0)
    return cv.reduce(m)


def fill_even_odd(cv, features):
    """면마다 고리를 짝홀 규칙으로 칠하고(SHP 면은 바깥·구멍 고리가 섞여 있다), 면끼리는 합친다"""
    m = cv.mask()
    for rings in features:
        xs = [x for r in rings for x, _ in cv.px(r)]
        zs = [z for r in rings for _, z in cv.px(r)]
        bx0, bz0 = max(0, int(min(xs)) - 1), max(0, int(min(zs)) - 1)
        bx1, bz1 = min(cv.size[0], int(max(xs)) + 2), min(cv.size[1], int(max(zs)) + 2)
        if bx1 <= bx0 or bz1 <= bz0:
            continue
        f = Image.new('1', (bx1 - bx0, bz1 - bz0), 0)
        for r in rings:
            one = Image.new('1', f.size, 0)
            ImageDraw.Draw(one).polygon([(x - bx0, z - bz0) for x, z in cv.px(r)], fill=1)
            f = ImageChops.logical_xor(f, one)
        crop = m.crop((bx0, bz0, bx1, bz1))
        m.paste(ImageChops.logical_or(crop, f), (bx0, bz0))
    return cv.reduce(m)


def paint(size, layers):
    """[(마스크, 색), ...] 를 뒤에 온 것이 위로 오게 칠한다. 바탕은 그 밖 색"""
    img = Image.new('RGB', size, REST)
    for m, color in layers:
        img.paste(color, (0, 0), m)
    return img


def count(m):
    return m.convert('L').histogram()[255]


def main():
    os.makedirs(OUT, exist_ok=True)
    land = json.load(open(os.path.join(ROOT, 'public', 'data', 'v2', 'land.json')))
    area = land['area']
    road = [[dm(r) for r in p] for p in land['road']]
    bld = []
    for b in json.load(open(os.path.join(ROOT, 'public', 'data', 'board.json')))['b']:
        pts = dm(b[2:])
        if len(pts) >= 3 and max(x for x, _ in pts) > area[0] and min(x for x, _ in pts) < area[2] and max(z for _, z in pts) > area[1] and min(z for _, z in pts) < area[3]:
            bld.append([pts])

    # 1. 구역 전체 1m = 1px
    cv = Canvas(area, 1)
    road_m, bld_m = fill_polygons(cv, road), fill_polygons(cv, bld)
    paint(cv.out, [(road_m, ROAD), (bld_m, BLD)]).save(os.path.join(OUT, 'land.png'))

    # 2. 3×3 아홉 장, 1m = 2px (행은 북쪽부터, 열은 서쪽부터)
    W, H = area[2] - area[0], area[3] - area[1]
    xe = [area[0] + round(W * i / 3) for i in range(4)]
    ze = [area[1] + round(H * i / 3) for i in range(4)]
    for r in range(3):
        for c in range(3):
            t = Canvas((xe[c], ze[r], xe[c + 1], ze[r + 1]), 2)
            paint(t.out, [(fill_polygons(t, road), ROAD), (fill_polygons(t, bld), BLD)]).save(os.path.join(OUT, f'land-tile-{r}{c}.png'))

    # 3. 수치지형도 도로 부지와 대조(대조에만 쓰고 결과 자료에 넣지 않는다). 도엽 범위만 1m = 1px
    cv = Canvas(SHEETS, 1)
    road_m, bld_m = fill_polygons(cv, road), fill_polygons(cv, bld)
    feats = []
    for sheet in sorted(glob.glob(os.path.join(ROOT, 'tools', 'raw', 'ngii', 'suchi', 'sheets', '*'))):
        for layer in SURVEY:
            for kind, rings in shapes(os.path.join(sheet, layer + '.shp')):
                if kind == 5:
                    feats.append([[tm_to_xz(x, y) for x, y in ring] for ring in rings if len(ring) >= 3])
    sv_m = fill_even_odd(cv, feats)
    both = ImageChops.logical_and(road_m, sv_m)
    ours = ImageChops.subtract(road_m.convert('L'), sv_m.convert('L')).convert('1')
    theirs = ImageChops.subtract(sv_m.convert('L'), road_m.convert('L')).convert('1')
    # 측량만 도로 부지인 곳은 우리 건물 위에도 파랑으로 칠한다(건물이 도로 부지로 들어온 띠가 보이게)
    paint(cv.out, [(bld_m, BLD), (both, ROAD), (ours, OURS), (theirs, THEIRS)]).save(os.path.join(OUT, 'land-vs-suchi.png'))

    # 4. 넓이(1m 칸으로 센 값, ㎡, 도엽 범위 안)
    print(f'우리 도로 부지 {count(road_m)}㎡, 측량 도로 부지 {count(sv_m)}㎡, 겹침 {count(both)}㎡, 우리만 {count(ours)}㎡, 측량만 {count(theirs)}㎡')
    print(f'채운 띠 {land["fill"]}㎡(land.json 의 fill), 건물 때문에 빠진 넓이는 land.py 가 찍는다')
    print(f'그림 → {OUT}/land.png, land-tile-00~22.png, land-vs-suchi.png')


if __name__ == '__main__':
    main()
