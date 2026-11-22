# 지시서 2(docs/redraw-orders/2-split.md): split.json 을 위에서 본 그림으로(tmp/v2/), 수치지형도 도로·인도 면과 나란히 칠한 그림.
# 시스템 python3(PIL)로 돈다. shapely 를 쓰지 않는다. 칠하기는 plot_land.py 의 것을 그대로 쓴다. 실행: python3 tools/v2/plot_split.py
import glob, json, os, sys
from PIL import Image, ImageChops

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from tm import tm_to_xz  # noqa: E402
from shp import shapes  # noqa: E402
from plot_land import Canvas, dm, fill_polygons, fill_even_odd  # noqa: E402

OUT = os.path.join(ROOT, 'tmp', 'v2')
COLOR = {'car': (62, 66, 80), 'walk': (214, 208, 196), 'mix': (128, 131, 142), 'ped': (240, 214, 150)}  # ped: 사람만 쓰는 면(보행 전용 띠와 광장)
BLD, GROUND, REST = (150, 130, 110), (192, 193, 196), (226, 228, 222)
BOTH_CAR, OURS, THEIRS, BOTH_WALK = (62, 66, 80), (220, 40, 40), (40, 90, 220), (60, 150, 90)
SC_LAYERS = ('N1A_A0010000', 'N1A_A0080000', 'N1A_A0043325')  # 도로·교차로·횡단보도 면(여기서 인도 면을 빼면 측량 찻길)
SW_LAYERS = ('N1A_A0033320',)  # 인도 면
SHEETS = (-794, -943, 971, 721)  # 수치지형도 12도엽이 덮는 판 좌표(지시서 4a). 측량과 견주는 그림은 이 범위만
ZOOM = {'hapjeong': (-490, 245), 'yanghwa': (-70, -130), 'hongdae': (670, -830), 'eoulmadang': (265, -180),
        'eoul-south': (160, 200), 'gyeongui': (640, -560),
        'mangwon': (-783, -502), 'sangsu': (343, 415), 'sinchon': (1580, -405), 'sogang': (1428, -95),
        'mapogu': (-1380, -1338), 'seongsan': (-460, -1600), 'edge': (1880, 540)}  # 지시서 4a 에서 더함


def paint(size, bg, layers):
    """[(마스크, 색), ...] 를 뒤에 온 것이 위로 오게 칠한다"""
    img = Image.new('RGB', size, bg)
    for m, color in layers:
        img.paste(color, (0, 0), m)
    return img


def survey(layers):
    feats = []
    for sheet in sorted(glob.glob(os.path.join(ROOT, 'tools', 'raw', 'ngii', 'suchi', 'sheets', '*'))):
        for layer in layers:
            for kind, rings in shapes(os.path.join(sheet, layer + '.shp')):
                if kind == 5:
                    feats.append([[tm_to_xz(x, y) for x, y in ring] for ring in rings if len(ring) >= 3])
    return feats


def minus(a, b):
    return ImageChops.subtract(a.convert('L'), b.convert('L')).convert('1')


def main():
    os.makedirs(OUT, exist_ok=True)
    split = json.load(open(os.path.join(ROOT, 'public', 'data', 'v2', 'split.json')))
    area = split['area']
    faces = {n: [[dm(r) for r in p] for p in split[n]] for n in COLOR}
    bld = []
    for b in json.load(open(os.path.join(ROOT, 'public', 'data', 'board.json')))['b']:
        pts = dm(b[2:])
        if len(pts) >= 3 and max(x for x, _ in pts) > area[0] and min(x for x, _ in pts) < area[2] and max(z for _, z in pts) > area[1] and min(z for _, z in pts) < area[3]:
            bld.append([pts])

    def draw(cv, name):
        layers = [(fill_polygons(cv, faces[n]), COLOR[n]) for n in COLOR] + [(fill_polygons(cv, bld), BLD)]
        paint(cv.out, GROUND, layers).save(os.path.join(OUT, name))

    # 1. 구역 전체 1m = 1px
    cv = Canvas(area, 1)
    draw(cv, 'split.png')
    # 2. 3×3 아홉 장, 1m = 2px (행은 북쪽부터, 열은 서쪽부터)
    W, H = area[2] - area[0], area[3] - area[1]
    xe = [area[0] + round(W * i / 3) for i in range(4)]
    ze = [area[1] + round(H * i / 3) for i in range(4)]
    for r in range(3):
        for c in range(3):
            draw(Canvas((xe[c], ze[r], xe[c + 1], ze[r + 1]), 2), f'split-tile-{r}{c}.png')
    # 3. 300m 확대 네 장, 1m = 4px (구역 밖은 잘라낸다)
    for name, (x, z) in ZOOM.items():
        win = (max(area[0], x - 150), max(area[1], z - 150), min(area[2], x + 150), min(area[3], z + 150))
        draw(Canvas(win, 4), f'split-zoom-{name}.png')

    # 4·5. 수치지형도와 대조(대조에만 쓰고 결과 자료에 넣지 않는다). 도엽 범위만 1m = 1px
    cv = Canvas(SHEETS, 1)
    car_m, walk_m, bld_m = fill_polygons(cv, faces['car']), fill_polygons(cv, faces['walk']), fill_polygons(cv, bld)
    sw_m = fill_even_odd(cv, survey(SW_LAYERS))
    sc_m = minus(fill_even_odd(cv, survey(SC_LAYERS)), sw_m)  # 측량 찻길 = (도로 ∪ 교차로 ∪ 횡단보도) − 인도
    paint(cv.out, REST, [(bld_m, BLD), (ImageChops.logical_and(car_m, sc_m), BOTH_CAR), (minus(car_m, sc_m), OURS),
                         (ImageChops.logical_and(walk_m, sc_m), THEIRS)]).save(os.path.join(OUT, 'split-vs-suchi-car.png'))
    paint(cv.out, REST, [(bld_m, BLD), (ImageChops.logical_and(walk_m, sw_m), BOTH_WALK), (minus(walk_m, sw_m), OURS),
                         (minus(sw_m, walk_m), THEIRS)]).save(os.path.join(OUT, 'split-vs-suchi-walk.png'))
    print(f'그림 → {OUT}/split.png, split-tile-00~22.png, split-zoom-{{{",".join(ZOOM)}}}.png, split-vs-suchi-car.png, split-vs-suchi-walk.png')


if __name__ == '__main__':
    main()
