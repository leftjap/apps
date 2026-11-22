# 지시서 3b(docs/redraw-orders/3b-marks.md): split.json·건물 위에 횡단보도·중앙선·흰 실선·차선(점선)·정지선을 그린다(tmp/v2/).
# 시스템 python3(PIL)로 돈다. shapely 를 쓰지 않는다. 바닥 칠하기는 plot_land.py 의 것을 그대로 쓴다. 실행: python3 tools/v2/plot_marks.py
import json, math, os, sys
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from plot_land import Canvas, dm, fill_polygons  # noqa: E402

OUT = os.path.join(ROOT, 'tmp', 'v2')
FACE = {'car': (62, 66, 80), 'walk': (214, 208, 196), 'mix': (128, 131, 142), 'ped': (240, 214, 150)}  # 지시서 2(5판)의 색
BLD, GROUND = (150, 130, 110), (192, 193, 196)
CROSS, SIG = (232, 232, 232), (60, 200, 90)
CENTER, SOLID, LANE, STOP = (245, 200, 60), (240, 240, 240), (240, 240, 240), (255, 255, 255)
DASH, GAP = 3.0, 5.0  # 차선: 3m 칠하고 5m 띄움
SIG_R = 1.5
ZOOM = {'hapjeong': (-490, 245), 'yanghwa': (-70, -130), 'hongdae': (670, -830), 'dongmak': (347, 403),
        'ramp': (-700, 560), 'worldcup': (-590, -150),
        'mangwon': (-783, -502), 'sangsu': (343, 415), 'sinchon': (1580, -405), 'sogang': (1428, -95),
        'mapogu': (-1380, -1338), 'seongsan': (-460, -1600), 'edge': (1880, 540),  # 지시서 4a 에서 더함
        'seogangbr': (800, 950), 'yanghwabr': (-850, 550), 'naebu': (-1250, -1330), 'morae': (-100, -1800)}  # 지시서 4b 에서 더함


def dashes(pts):
    """선을 따라 0 부터 3m 칠하고 5m 띄운 조각들"""
    cum = [0.0]
    for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
        cum.append(cum[-1] + math.hypot(x1 - x0, z1 - z0))

    def at(t):
        for i in range(1, len(cum)):
            if t <= cum[i] or i == len(cum) - 1:
                f = 0.0 if cum[i] == cum[i - 1] else (t - cum[i - 1]) / (cum[i] - cum[i - 1])
                (x0, z0), (x1, z1) = pts[i - 1], pts[i]
                return (x0 + (x1 - x0) * f, z0 + (z1 - z0) * f)

    out, t = [], 0.0
    while t < cum[-1]:
        e = min(t + DASH, cum[-1])
        out.append([at(t)] + [pts[i] for i in range(len(pts)) if t < cum[i] < e] + [at(e)])
        t += DASH + GAP
    return [c for c in out if len(c) >= 2]


def main():
    os.makedirs(OUT, exist_ok=True)
    split = json.load(open(os.path.join(ROOT, 'public', 'data', 'v2', 'split.json')))
    marks = json.load(open(os.path.join(ROOT, 'public', 'data', 'v2', 'marks.json')))
    area = split['area']
    faces = {n: [[dm(r) for r in p] for p in split[n]] for n in FACE}
    bld = []
    for b in json.load(open(os.path.join(ROOT, 'public', 'data', 'board.json')))['b']:
        pts = dm(b[2:])
        if len(pts) >= 3 and max(x for x, _ in pts) > area[0] and min(x for x, _ in pts) < area[2] and max(z for _, z in pts) > area[1] and min(z for _, z in pts) < area[3]:
            bld.append([pts])
    cross = [(dm(c['p']), c['sig']) for c in marks['cross']]
    lane_dash = [d for p in marks['lane'] for d in dashes(dm(p))]

    def draw(win, s, name):
        cv = Canvas(win, s)
        img = Image.new('RGB', cv.out, GROUND)
        for n in FACE:
            img.paste(FACE[n], (0, 0), fill_polygons(cv, faces[n]))
        img.paste(BLD, (0, 0), fill_polygons(cv, bld))
        img.paste(CROSS, (0, 0), fill_polygons(cv, [[p] for p, _ in cross]))
        d = ImageDraw.Draw(img)
        px = lambda pts: [((x - win[0]) * s, (z - win[1]) * s) for x, z in pts]
        lw = 1 if s <= 2 else 2
        for p, sig in cross:
            if sig:
                cx, cz = sum(x for x, _ in p) / len(p), sum(z for _, z in p) / len(p)
                (qx, qz), = px([(cx, cz)])
                d.ellipse([qx - SIG_R * s, qz - SIG_R * s, qx + SIG_R * s, qz + SIG_R * s], fill=SIG)
        for p in lane_dash:
            d.line(px(p), fill=LANE, width=lw)
        for p in marks['solid']:
            d.line(px(dm(p)), fill=SOLID, width=lw)
        for p in marks['center']:
            d.line(px(dm(p)), fill=CENTER, width=lw)
        for p in marks['stop']:
            d.line(px(dm(p)), fill=STOP, width=2 * lw)
        img.save(os.path.join(OUT, name))

    draw(area, 2, 'marks.png')
    for name, (x, z) in ZOOM.items():
        draw((x - 150, z - 150, x + 150, z + 150), 4, f'marks-zoom-{name}.png')
    print(f'그림 → {OUT}/marks.png, marks-zoom-{{{",".join(ZOOM)}}}.png')


if __name__ == '__main__':
    main()
