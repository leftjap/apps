# 지시서 3b(docs/redraw-orders/3b-marks.md, 4판): marks.json 구조 검사(항목마다 PASS/FAIL, 하나라도 FAIL 이면 종료 코드 1)와 찍는 수치(판정 없음).
# 갈래 끝·xw 쓰임 같은 marks.json 에 넣지 않는 값은 marks.py 의 build() 로 다시 만들어 쓴다.
# 실행: tools/.venv/bin/python tools/v2/check_marks.py
import json, os, sys
from collections import Counter
import numpy as np
import shapely
from shapely.geometry import LineString, Polygon
from shapely.ops import unary_union
from shapely import make_valid

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from marks import build, dm  # noqa: E402


def main():
    marks = json.load(open(os.path.join(ROOT, 'public', 'data', 'v2', 'marks.json')))
    lanes = json.load(open(os.path.join(ROOT, 'public', 'data', 'v2', 'lanes.json')))
    split = json.load(open(os.path.join(ROOT, 'public', 'data', 'v2', 'split.json')))
    car = unary_union([make_valid(Polygon(dm(p[0]), [dm(h) for h in p[1:]])) for p in split['car']])
    car5 = car.buffer(0.5)
    shapely.prepare(car5)
    r = build()

    results = []
    lines = {k: [dm(a) for a in marks[k]] for k in ('center', 'lane', 'solid', 'stop')}
    bad = sum(1 for k in lines for pts in lines[k] if len(pts) < 2 or LineString(pts).length <= 0)
    polys = [Polygon(dm(c['p'])) for c in marks['cross']]
    badp = sum(1 for p in polys if not p.is_valid or p.area < 6)
    results.append((bad == 0 and badp == 0, f'점 둘 아래이거나 길이 0 인 선 {bad}개, 유효하지 않거나 6㎡ 아래인 횡단보도 {badp}개'))
    stops = [LineString(p) for p in lines['stop']]
    # 정지선 길이 1.5~45m(2판). 2.5m 아래인 것은 참고로 따로 찍는다
    out_len = [g.length for g in stops if not 1.5 <= g.length <= 45]
    under = [g for g in stops if 1.5 <= g.length < 2.5]
    results.append((not out_len, f'길이가 1.5~45m 밖인 정지선 {len(out_len)}개' + (f' ({", ".join(f"{v:.1f}m" for v in out_len[:10])})' if out_len else '')
                    + f'. 참고: 1.5~2.5m 인 것 {len(under)}개' + (' ' + ', '.join(f'({g.centroid.x:.0f}, {g.centroid.y:.0f}) {g.length:.2f}m' for g in under) if under else '')))
    tot = sum(g.length for g in stops)
    ins = sum(g.intersection(car5).length for g in stops)
    results.append((ins / tot > 0.98, f'정지선 {tot:.0f}m 가운데 찻길 면 0.5m 안 {100 * ins / tot:.2f}% (98% 넘게)'))
    # 중앙선·차선·흰 실선이 lanes.json 경계선과 같은 선인가, 그리고 개수
    border_set = {}
    for s in lanes['sec']:
        for q in s['runs']:
            for b in q['borders']:
                border_set.setdefault(tuple(b['p']), b['k'])
    not_border = sum(1 for k in ('center', 'lane', 'solid') for a in marks[k] if tuple(a) not in border_set)
    n_two = sum(1 for s in lanes['sec'] if not s['oneway'] for _ in s['runs'])
    n_opp = sum((q['lk'] == 'opp') + (q['rk'] == 'opp') for s in lanes['sec'] if s['oneway'] for q in s['runs'])
    n_lane = sum(1 for s in lanes['sec'] for q in s['runs'] for b in q['borders'] if b['k'] == 'lane')
    n_same = sum((q['lk'] == 'same') + (q['rk'] == 'same') for s in lanes['sec'] for q in s['runs'])
    ok = not_border == 0 and len(marks['center']) == n_two + n_opp and len(marks['lane']) == n_lane and len(marks['solid']) == n_same
    results.append((ok, f'경계선과 다른 선 {not_border}개, 중앙선 {len(marks["center"])}(= 양방향 묶음 {n_two} + 한 방향 opp {n_opp}), '
                        f'차선 {len(marks["lane"])}(= lane 경계선 {n_lane}), 흰 실선 {len(marks["solid"])}(= same 가장자리 {n_same})'))
    for ok, msg in results:
        print(('PASS ' if ok else 'FAIL ') + msg)

    print('찍는 수치(판정 없음)')
    # 1
    L = lambda k: sum(LineString(p).length for p in lines[k])
    cr = marks['cross']
    print(f'1. 중앙선 {len(lines["center"])}개 {L("center"):.0f}m, 차선 {len(lines["lane"])}개 {L("lane"):.0f}m, 흰 실선 {len(lines["solid"])}개 {L("solid"):.0f}m, '
          f'정지선 {len(stops)}개. 횡단보도 {len(cr)}개: 교차로 갈래 {sum(1 for c in cr if not c["mid"])}(신호 {sum(1 for c in cr if not c["mid"] and c["sig"])}), '
          f'구간 중간 {sum(1 for c in cr if c["mid"])}(신호 {sum(1 for c in cr if c["mid"] and c["sig"])})')
    # 2
    ends = r['ends']
    kc = Counter(e['kind'] for e in ends)
    print(f'2. 교차로 입구 {len(ends)}곳(n {kc["n"]}, j {kc["j"]}), 그 가운데 횡단보도를 놓은 곳 {sum(1 for e in ends if e["placed"])}곳'
          f'(n {sum(1 for e in ends if e["placed"] and e["kind"] == "n")}, j {sum(1 for e in ends if e["placed"] and e["kind"] == "j")})')
    miss = [e for e in ends if not e['placed']]
    print(f'   횡단보도를 놓지 않은 입구 {len(miss)}곳: ' + ', '.join(f'{k} {v}' for k, v in Counter(e["why"] for e in miss).items()))
    far = [e for e in ends if e['placed'] and not e.get('near35')]
    print(f'   놓은 입구 횡단보도 가운데 35m 안에 서울시 횡단보도가 없는 것 {len(far)}곳' + (': ' + ', '.join(f'({e["at"].x:.0f}, {e["at"].y:.0f}) 등급 {e["cls"]}' for e in far) if far else ''))
    kinds = Counter()
    for oneway, lk, rk in r['runs']:
        kinds[('한 방향' if oneway else '양방향', 'lk', lk)] += 1
        kinds[('한 방향' if oneway else '양방향', 'rk', rk)] += 1
    print('   묶음 가장자리 종류: ' + ', '.join(f'{a} {b}={c}: {v}' for (a, b, c), v in sorted(kinds.items())))
    # 3
    use = Counter(r['use'].values())
    print(f'3. 구역 안 xw {len(r["xw"])}개(신호 {sum(x["sig"] for x in r["xw"])}개): ' + ', '.join(f'{k} {v}' for k, v in use.most_common()))
    # 4
    outs = []
    for c, p in zip(cr, polys):
        o = p.difference(car5).area / p.area if p.area > 0 else 0
        if o > 0.2:
            outs.append((o, p.centroid))
    print(f'4. 넓이의 20% 넘게가 찻길 면(0.5m 넓힘) 밖인 횡단보도 {len(outs)}개' + (': ' + ', '.join(f'({c.x:.0f}, {c.y:.0f}) {100 * o:.0f}%' for o, c in outs[:10]) if outs else ''))
    # 5 정지선 → 가장 가까운 교차로 갈래 횡단보도
    jx = [p for c, p in zip(cr, polys) if not c['mid']]
    if jx:
        tree = shapely.STRtree(jx)
        d = np.array([jx[tree.nearest(g)].distance(g) for g in stops])
        near = d[d < 10]
        print(f'5. 정지선에서 가장 가까운 교차로 갈래 횡단보도까지: 10m 안 {len(near)}개 '
              + (f'(10% {np.quantile(near, 0.1):.2f}, 중앙 {np.median(near):.2f}, 90% {np.quantile(near, 0.9):.2f}m)' if len(near) else '')
              + f', 10m 넘음 {int((d >= 10).sum())}개')
    sys.exit(0 if all(ok for ok, _ in results) else 1)


if __name__ == '__main__':
    main()
