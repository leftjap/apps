# s1-approach: 끝 접속 판정이 실제 횡단보도를 떨어뜨리는 것을 고친다

## 지오의 원문
「근데 도로는 조금 더 디테일이 있으면 좋겠어.」「이 지도를 보면서 사람들이 차가 정확히 가나 이런 거 보는 거 아냐, 적당히 차들이 많다, 실제 구현한 거 같다 이런 느낌이 있으면 되는 거야.」

## 배경 (조사는 끝났다. 다시 조사하지 않는다)
앞 일감 `s1-crossings` 가 연석 거리 눈금을 고쳐 횡단보도를 1,638 → 2,294개로 늘렸다. 그래도 `crossingAudit` 에 `unconfirmed` 가 1,018개 남고, 그 가운데 **972개가 `unjoined-approach`**(두 끝 중 하나라도 `approach` 가 `joined` 가 아니다)다.

계획 세우기가 지금 자료 `public/data/v2/mapo-all-a.json.gz` 에서 직접 센 값이다.

- `unjoined-approach` 972개의 끝 상태 짝: 양끝 `no-walk-in-outward-range` 265, `gap-exceeds-half-width`+`joined` 236, `joined`+`no-walk` 163, 양끝 `gap-exceeds-half-width` 112, `gap-exceeds`+`no-walk` 83, `blocked-by-lane-or-building`+`joined` 53, 양끝 `blocked` 37, `blocked`+`gap-exceeds` 21.
- **B3 가 증거다.** 정밀도로지도 B3 가 실제 횡단보도라고 확인한 면 1,028개(`covered-by-b3`)에도 같은 판정이 찍혀 있다. **431개는 한쪽 끝이 `blocked-by-lane-or-building`**, **201개는 한쪽 끝이 `gap-exceeds-half-width`** 다. 1,028개 가운데 **양끝이 2.0m 안에서 보행면을 만나고 두 끝의 보행면 성분이 다른 것은 682개(66.3%)** 인데, 지금의 받아들이는 조건(양끝 모두 `joined`)을 통과하는 것은 **260개(25.3%)** 뿐이다. 즉 지금 조건은 실제라고 확인된 횡단보도의 41%를 떨어뜨린다. 눈금이 틀렸다는 뜻이다.
- 두 상태가 왜 과하게 거절하는가: `approach` 는 ① 축 방향으로 밖으로 쏜 선이 보행면을 만난 거리 `gap` 이 **`width/2`**(면의 짧은 쪽 절반)를 넘으면 `gap-exceeds-half-width` 로 찍고 ② `joined` 일 때 만드는 landing 띠가 차로 버퍼나 건물에 닿으면 `blocked-by-lane-or-building` 으로 찍는다. ①은 좁은 횡단보도(폭 3m → 1.5m)에 절대 상한 `CROSSING_KERB_GAP = 2.0` 보다 훨씬 엄한 눈금을 걸고, ②는 **landing 면을 못 만든다는 사정**(그려 넣을 자리가 없다)을 **그 면이 횡단보도가 아니라는 판정**으로 쓴다.
- 지금 `unconfirmed` 1,018개를 「양끝 거리 ≤2.0m(두 끝 모두 보행면을 만났다) · 성분 다름 · 면적 4~800㎡ · 축 2.5~70m · 찻길 면과 60% 이상 겹침」으로 걸러 보면 **271개**가 남는다(면적 중간 37㎡, 축 중간 8.5m 라 교차로 횡단보도 크기다). 이 271개가 반경 90m 안에 드는 큰 교차로는 02 서교 2, 03 홍대입구 2, 06 이대역 1, 08 마포역 2, 18 서강대앞 1, 19 연세대앞 1 곳이다.

## 할 일
**받아들이기(admission)와 landing 면 만들기(그려 넣기)를 나눈다.** 지금은 한 판정이 둘을 같이 결정한다.

1. **표본 하나를 먼저 본다.** 세 자리(아래 캡처 중심) 가운데 하나를 골라, `crossingAudit` 에서 그 자리의 후보 네 개를 꺼내 끝 상태·`gap`·`width`·성분·면적을 적는다(`tmp/loop/s1-approach/sample.md`, 10줄 안쪽). 받아들였을 때 어디에 생기는지 좌표로 확인한다.
2. **`supplement_crossings` 의 받아들이는 조건을 고친다**(`tools/v2/hapjeong_crossings.py`).
   - 끝이 「보행면을 만났다」의 기준은 **절대 거리 `CROSSING_KERB_GAP = 2.0` 하나**로 한다. `width/2` 비례 눈금과 landing 막힘은 **받아들이기에서 빼라**. 상한을 2.0m 보다 키우지 않는다.
   - 보행면을 아예 만나지 못한 끝(`no-walk-in-outward-range`)은 그대로 거절한다. **이 상태 이름은 바꾸지 않는다**(검사가 이 이름으로 센다). 다른 끝 상태 이름은 네가 정하되 `crossingAudit` 에 남겨 왜 받아들였는지·왜 뺐는지 볼 수 있게 한다.
   - 거짓 양성을 막는 나머지 가드는 그대로 둔다(검사가 같은 것을 다시 센다): 두 끝의 `walkComponent` 가 다름, 면적 4~800㎡, 두 끝 거리 2.5~70m, 찻길 면(`floor['road']`)과 60% 이상 겹침, 기존 B3 면과 25% 넘게 겹치지 않음, 줄무늬 2개 이상.
   - 좌표·번호·구역 이름으로 예외를 두지 않는다.
3. **보행면은 손대지 않는다.** `paving` 에 넣는 조건(지금의 `covered or score or (opposite and gap <= PAVING_KERB_GAP)`)과 끝 landing 면을 실제로 만드는 조건(지금 `status=='joined'` 일 때만, 차로·건물에 닿으면 안 만든다)은 **지금 집합을 그대로 유지한다**. 새 조건은 「이 면을 횡단보도로 받아들인다」에만 쓴다. 검사가 `pedestrianLandings` 2,636개와 `floor['walk']` 고리 2,241개가 그대로인지 센다.
4. **고치기 전 화면을 먼저 찍는다.** 자료를 다시 만들기 **전에** 개발 서버를 띄워(`pnpm exec vite --port 5199 --strictPort`) 세 자리를 찍어 `tmp/loop/s1-approach/before/` 에 둔다. 이름과 주소를 그대로 쓴다(검사가 같은 주소로 다시 찍어 대조한다). 세 중심은 계획 세우기가 「새 면이 실제로 생기는 자리」로 센 곳이다(화면 100×60m 안에 각각 4·4·3개).
   `node tmp/connect/gpushot.mjs tmp/loop/s1-approach/before "cross-d1=http://localhost:5199/apps/mapo/mapo-all.html?tiles=1&center=149.5,-495.2&width=120" "cross-d2=…&center=2687.2,1103.8&width=120" "cross-d3=…&center=2239.1,1209.5&width=120"`
5. **전역 A 보기만 다시 만든다.** `hapjeong_hd_a.py --area tools/v2/areas/mapo-all.json`(결과 `public/data/v2/mapo-all-a.json.gz`). 바닥 `mapo-all.json.gz`, 건물 `mapo-all-buildings.json.gz`, 노면 세부 `mapo-all-road-paint.json.gz` 는 **다시 만들지 않는다**. 그다음 칸을 다시 포장한다: `tools/.venv/bin/python -B tools/v2/pack_district_tiles.py --area tools/v2/areas/mapo-all.json`.
6. **사진 대조 패널 세 장.** `tmp/loop/s1-review/plan.json` 에서 줄 하나를 복사해 세 줄짜리 `tmp/loop/s1-approach/plan.json` 을 만든다(`id` 는 `K01-001`·`K02-001`·`K03-001`, `xy` 는 위 세 중심, `extra` 는 자리 이름, 나머지 칸은 복사한 줄 그대로). 그다음
   `tools/.venv/bin/python -B tools/v2/road_audit.py --area mapo-all --plan tmp/loop/s1-approach/plan.json --out tmp/loop/s1-approach/audit --workers 4`
   를 돌리고 나온 `audit/panels/K01/K01-001-overlay.jpg`(K02·K03도)를 `tmp/loop/s1-approach/shots/audit-1.jpg`·`audit-2.jpg`·`audit-3.jpg` 로 복사한다.
7. **측정 기록** `tmp/loop/s1-approach/measure.md`(20줄 안쪽): 고친 조건, 전역 횡단보도 수의 전·후, 보충된 수, `crossingAudit` 상태 분포의 전·후, 「양끝 2.0m 안·성분 다름」을 만족하는 줄이 `covered-by-b3` 와 `unconfirmed` 에서 각각 몇 개인지의 전·후, 자리 20곳의 전·후 수, 아직 `unconfirmed` 로 남은 것의 대표 이유, `pedestrianLandings` 와 `floor['walk']` 수.

## 읽을 곳 (이것만 읽는다)
- `tools/v2/hapjeong_crossings.py`: `approach` 98~118행(상태를 찍는 자리), `supplement_crossings` 149~216행(받아들이는 자리는 174~205행), 눈금 13~14행(`CROSSING_KERB_GAP`·`PAVING_KERB_GAP`), `crossing_axis` 44~58행.
- `tools/v2/hapjeong_hd_a.py` 240~282행(`bake_a` 가 `supplement_crossings` 결과를 `crossings`·`crossingAudit`·`floor['walk']` 로 넣는 자리), 294~310행(`pedestrian_landings`).
- 함수의 줄 범위는 `rg -n '<이름>' docs/code-map.md` 로 찾는다. 다른 파일은 열지 않는다.

## 문턱 (재는 명령)
`bash docs/redraw-orders/queue/s1-approach/check.sh` 종료 0. 검사 파일을 고치지 않는다. 이 검사가 재는 것:

- 자료(`approach.py`): 전역 횡단보도 2,420~2,650개(지금 2,294), 보충된 줄 790~1,030개(지금 665), `unconfirmed` 1,018 → 820 이하, 「양끝 2.0m 안·성분 다름」인 줄이 `covered-by-b3` 에서 640개 이상(지금 682, 접속 측정이 나빠지지 않았다는 뜻)이고 그 조건에 가드까지 통과하면서 아직 `unconfirmed` 로 남은 줄이 20개 이하(지금 271개, 줄무늬가 2개 미만이라 떨어진 것은 뺀다), 새 줄 전부가 위 2번의 가드를 지킴, `crossingAudit` 가 남아 있음, 자리 20곳 가운데 줄어든 자리 0곳이고 02·03·06·08·18·19 가운데 3곳 이상에서 늘어남(반경 90m), 홍대 일대 자료의 횡단보도 497개 그대로, `pedestrianLandings` 2,636개와 `floor['walk']` 고리 2,241개·`floor['road']` 고리 39개 그대로.
- 앞 일감 검사 네 개(`s1-outline`·`s1-tiles`·`s1-water`·`s1-paint`)를 그대로 다시 돌려 통과.
- 캡처 여덟 장(폭 120m 세 장, 200m, 700m, 1,500m, 전체 보기, 모바일 390×844 폭 300m)에 페이지 오류가 없고, 폭 120m 세 장이 고치기 전과 **0.2% 이상** 다름(새 횡단보도가 실제로 그려졌다는 뜻).
- 네 보기 수치: 프레임 p95 ≤ 33ms, 첫 표시 ≤ 8,000ms, 먼 단계 ≤ 2,000,000바이트.
- 기존 화면 넷(홍대 칸 150m·700m, 홍대 평면 700m, 양화 700m) 픽셀이 그대로, 다른 구역 자료와 `src/sim` 안 바뀜, 홍대 칸 자료 안 바뀜, `pnpm test:map` 통과.

## 하지 않는 것
- `no-walk-in-outward-range` 후보(양끝 또는 한쪽 끝이 보행면을 아예 못 만난 것, 513개)를 받아들이려 들지 않는다. 다음 일감이다.
- 연석 거리 상한을 2.0m 보다 키우지 않는다. 차·사람 재생, `pnpm bake`, 전체 `pnpm test`, 바닥·건물·노면 세부 다시 만들기, 미리보기 도구, 소리.
- `tools/sol/`, 다른 일감 폴더, 이 일감의 `check.sh`·`approach.py` 를 고치지 않는다.

## 답의 꼴
12줄 안쪽: 바꾼 파일, 고친 조건과 그 까닭, 핵심 수치(횡단보도 전·후, B3 1,028 가운데 받아들여지는 비율의 전·후), 못 한 것, 요청 밖으로 달라진 것. 긴 표와 그림은 파일로 두고 이름만 적는다.
