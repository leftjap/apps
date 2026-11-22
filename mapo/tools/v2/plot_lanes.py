# 지시서 3a(docs/redraw-orders/3a-lanes.md): split.json·건물 위에 차로 경계선·차로 가운데선·진행 방향 화살촉·구간 끝 노드를 그린다(tmp/v2/).
# 시스템 python3(PIL)로 돈다. shapely 를 쓰지 않는다. 바닥 칠하기는 plot_land.py 의 것을 그대로 쓴다. 실행: python3 tools/v2/plot_lanes.py
import json, math, os, sys
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from plot_land import Canvas, dm, fill_polygons  # noqa: E402

OUT = os.path.join(ROOT, 'tmp', 'v2')
# 바탕: 지시서 2(5판)의 색
FACE = {'car': (62, 66, 80), 'walk': (214, 208, 196), 'mix': (128, 131, 142), 'ped': (240, 214, 150)}
BLD, GROUND = (150, 130, 110), (192, 193, 196)
BORDER = {'edge': (235, 235, 235), 'lane': (170, 176, 190), 'center': (245, 200, 60)}
LANE, NODE = (90, 200, 255), (255, 80, 80)
ARROW = 2.0  # 화살촉 길이(m)
NODE_R = 1.0  # 노드 점 반지름(m)
ZOOM = {'hapjeong': (-490, 245), 'yanghwa': (-70, -130), 'hongdae': (670, -830), 'dongmak': (347, 403),
        'ramp': (-700, 560), 'worldcup': (-590, -150),
        'mangwon': (-783, -502), 'sangsu': (343, 415), 'sinchon': (1580, -405), 'sogang': (1428, -95),
        'mapogu': (-1380, -1338), 'seongsan': (-460, -1600), 'edge': (1880, 540),  # 지시서 4a 에서 더함
        'seogangbr': (800, 950), 'yanghwabr': (-850, 550), 'naebu': (-1250, -1330), 'morae': (-100, -1800)}  # 지시서 4b 에서 더함


def main():
    os.makedirs(OUT, exist_ok=True)
    split = json.load(open(os.path.join(ROOT, 'public', 'data', 'v2', 'split.json')))
    lanes = json.load(open(os.path.join(ROOT, 'public', 'data', 'v2', 'lanes.json')))
    borders = json.load(open(os.path.join(ROOT, 'tmp', 'v2', 'lane-borders.json')))
    area = split['area']
    faces = {n: [[dm(r) for r in p] for p in split[n]] for n in FACE}
    bld = []
    for b in json.load(open(os.path.join(ROOT, 'public', 'data', 'board.json')))['b']:
        pts = dm(b[2:])
        if len(pts) >= 3 and max(x for x, _ in pts) > area[0] and min(x for x, _ in pts) < area[2] and max(z for _, z in pts) > area[1] and min(z for _, z in pts) < area[3]:
            bld.append([pts])
    nodes = [(x / 10, z / 10) for x, z in lanes['nodes']]
    lane_lines = [dm(l['p']) for s in lanes['sec'] for l in s['lanes']]
    border_lines = [(b['k'], dm(b['p'])) for b in borders]

    def draw(win, s, name):
        cv = Canvas(win, s)
        img = Image.new('RGB', cv.out, GROUND)
        for n in FACE:
            img.paste(FACE[n], (0, 0), fill_polygons(cv, faces[n]))
        img.paste(BLD, (0, 0), fill_polygons(cv, bld))
        d = ImageDraw.Draw(img)
        px = lambda pts: [((x - win[0]) * s, (z - win[1]) * s) for x, z in pts]
        lw = 1 if s <= 2 else 2
        for k in ('edge', 'lane', 'center'):
            for kk, pts in border_lines:
                if kk == k:
                    d.line(px(pts), fill=BORDER[k], width=lw)
        for pts in lane_lines:
            d.line(px(pts), fill=LANE, width=lw)
            # 진행 방향 끝에 화살촉: 끝 점에서 뒤로 2m, 양옆 30°
            (x0, z0), (x1, z1) = pts[-2], pts[-1]
            ang = math.atan2(z1 - z0, x1 - x0)
            for da in (math.radians(150), math.radians(-150)):
                tip = (x1 + ARROW * math.cos(ang + da), z1 + ARROW * math.sin(ang + da))
                d.line(px([(x1, z1), tip]), fill=LANE, width=lw)
        for x, z in nodes:
            (cx, cz), = px([(x, z)])
            d.ellipse([cx - NODE_R * s, cz - NODE_R * s, cx + NODE_R * s, cz + NODE_R * s], fill=NODE)
        img.save(os.path.join(OUT, name))

    draw(area, 2, 'lanes.png')
    for name, (x, z) in ZOOM.items():
        draw((x - 150, z - 150, x + 150, z + 150), 4, f'lanes-zoom-{name}.png')
    print(f'그림 → {OUT}/lanes.png, lanes-zoom-{{{",".join(ZOOM)}}}.png')


if __name__ == '__main__':
    main()
