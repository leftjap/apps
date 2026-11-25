# s1-outline: 전역 윤곽이 경계의 교차로 면 57개를 자르지 않게 하고 자료를 다시 만든다

## 배경
s1-bake(커밋 86b607a9 의 `tools/v2/areas/mapo-all.json` 과 도구)로 만든 전역 자료는 통과 검사를 넘었지만, Sol 검수에서 마포구 바깥 경계가 수치지형도 교차로 면 57개를 자른다고 FAIL 이었다(`tmp/loop/s1-bake-run1/evidence2.txt`, 남은 비율 중간값 67%, 0.1% 만 걸친 면도 있음). 횡단보도·정지선·교차로 연결선 절단은 0. 지난 만든 자료는 `tmp/loop/s1-bake-run1/data/` 에 있다(쓰지 않고 새로 만든다). 지난 실행의 기록은 `tmp/loop/s1-bake-run1/impl-2.json` 의 `result`.

## 할 일
1. 윤곽(`tools/v2/areas/mapo-all.json` 의 `outline`, 필요하면 `window`)을 고친다: 윤곽에 걸친 교차로 면은 통째로 넣는다(합집합). 넣은 면에 이어진 횡단보도 면·정지선이 새로 잘리면 그것도 넣고, 더 잘리는 것이 없을 때까지 되풀이한다. 면을 빼는 쪽(윤곽을 줄이기)은 쓰지 않는다. 좌표·번호로 예외를 두지 않는다. 고친 윤곽을 만드는 스크립트를 `tools/v2/grow_outline.py --area <구역>` 로 남긴다(맨 위 한 줄 주석).
2. 전역 자료 셋(`public/data/v2/mapo-all{,-a,-buildings}.json.gz`)을 다시 만든다. 그림 넷(`tmp/loop/s1-bake/{sinchon,seongsan,mapo-daero,gangbyeon}.png`)은 `tmp/loop/s1-bake-run1/draw.py` 로 다시 그린다(그 폴더에서 `tmp/loop/s1-bake/` 로 경로만 맞춘다).
3. 윤곽을 가장 많이 넓힌 자리 한 곳을 400m 그림으로 `tmp/loop/s1-outline/border-worst.png` 에(고치기 전 윤곽선과 고친 윤곽선을 함께).

## 문턱 (재는 명령)
`bash docs/redraw-orders/queue/s1-outline/check.sh` 종료 0: s1-bake 검사 전부 통과, `cuts.py` 가 「잘린 교차로 면 0개」, 그림 있음. 넓어진 면적을 답에 적는다(1㎢ 를 넘으면 그 까닭).

## 하지 않는 것
- 일감 폴더(`docs/redraw-orders/queue/`)를 고치지 않는다.
- 화면, 칸 나누기, 차·사람, 다른 구역 자료·설정은 건드리지 않는다.
- 물 없는 지도 조각 두 곳은 메우지 않는다.

## 답의 꼴 (15줄 안쪽)
바꾼 파일, 넓어진 면적과 넣은 면 수, 검사 요약 수치(건물, 횡단보도, 잘린 면), 못 한 것.
