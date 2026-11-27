# s1-crossings: 지선 횡단보도 누락을 규칙으로 채운다

## 지오의 원문
「이 지도를 보면서 사람들이 차가 정확히 가나 이런 거 보는 거 아냐, 적당히 차들이 많다, 실제 구현한 거 같다 이런 느낌이 있으면 되는 거야.」「근데 도로는 조금 더 디테일이 있으면 좋겠어.」

## 배경 (조사는 끝났다. 다시 조사하지 않는다)
앞 일감 `s1-review` 가 큰 교차로 20곳을 항공사진과 대조해, 주 교차로의 짧은 지선 횡단이 모형에 없는 자리를 10곳 적었다(01 합정, 02 서교, 03 홍대입구, 04 동교동삼거리, 05 신촌오거리, 07 공덕오거리, 08 마포역, 13 마포구청역, 18 서강대앞, 19 연세대앞. 판정표 `tmp/loop/s1-review/findings.tsv`, 요약 `tmp/loop/s1-review/summary.md` 의 「다음 작업에 넘길 불일치」).

계획 세우기가 전역 자료 `public/data/v2/mapo-all-a.json.gz` 에서 직접 센 값이다.
- 횡단보도 1,638개. 그 가운데 정밀도로지도 B3 가 1,629개, 수치지형도 A0043325 에서 보충한 것이 **9개**다.
- 탈락 기록 `crossingAudit`: `covered-by-b3` 1,028, `supplemented` 9, **`unconfirmed` 1,674**.
- `unconfirmed` 1,674개 가운데 **702개는 두 끝이 모두 `joined`**(보행면에 닿았다)인데도 떨어졌다. 그 702개 중 679개는 **연석까지 거리가 0.15m 를 넘는다**는 한 가지 이유로 떨어졌고, 성분이 같아서 떨어진 것은 31개다. 거리 분포는 중간값 1.04m, 95% 1.80m, 최대 3.02m 다. 즉 줄무늬 끝이 연석에서 0.5~1.6m 앞에서 끝나는 **정상적인 횡단보도**가 `.15` 라는 눈금 하나 때문에 전부 빠졌다.
- 누락으로 적힌 10곳에는 모두 이런 후보가 반경 90m 안에 1~5개씩 있다(01: 5개, 02: 3개, 03: 3개, 04: 2개, 05: 1개, 07: 2개, 08: 3개, 13: 2개, 18: 1개, 19: 2개). 거리는 02 가 0.22·0.68·1.05, 07 이 1.43·1.80, 18 이 1.57 이다.
- 702개를 「거리 ≤ 2.0m, 두 끝의 보행면 성분이 다름, 찻길 면과 80% 이상 겹침, 면적 ≥ 4㎡, 축 길이 ≥ 2.5m」로 걸러 보면 648개가 남는다. 면적은 중간 27㎡·최대 117㎡, 축 길이는 중간 7.3m·최대 31m 라 교차로 횡단보도의 크기다.

## 읽을 곳 (이것만 읽는다)
- `tools/v2/hapjeong_crossings.py` 의 `supplement_crossings` 146~194행, `approach` 95~118행, `crossing_axis` 41~57행, `agreement` 62~69행. 고쳐야 하는 눈금은 183~184행의 `curb_confirmed`(`distance <= .15` 와 `walkComponent` 비교)와 185행의 `if not score and not curb_confirmed` 다.
- `tools/v2/hapjeong_hd_a.py` 193~258행(`bake_a`)에서 `supplement_crossings` 를 부르고 결과를 `crossings`·`crossingAudit` 으로 넣는 자리. 263~266행 `clip_crossing`, 267~300행 `pedestrian_landings`.
- 함수의 줄 범위는 `rg -n '<이름>' docs/code-map.md` 로 찾는다. 다른 파일은 열지 않는다.

## 할 일
1. **표본 하나를 먼저 본다.** 서교(x 224.88, z −410.6)의 후보 세 개를 `crossingAudit` 에서 꺼내, 왜 떨어졌는지와 받아들였을 때 어디에 생기는지를 수치로 확인한다(`tmp/loop/s1-crossings/sample.md`, 10줄 안쪽).
2. **규칙을 고친다.** `supplement_crossings` 에서 수치지형도만 있는 횡단보도 면을 받아들이는 조건을 측량 눈금에 맞게 고친다. 좌표·번호·구역 이름으로 예외를 두지 않는다. 받아들인 뒤에도 거짓 양성이 들어오지 않게 다음을 조건으로 남긴다(검사가 같은 것을 다시 센다).
   - 두 끝이 모두 보행면에 닿는다(`approach` 의 `joined`), 연석까지 거리는 네가 정한 상한 안이고 **2.5m 를 넘지 않는다**.
   - 두 끝의 `walkComponent` 가 서로 다르다(같은 인도에서 시작해 같은 인도로 끝나는 면을 뺀다).
   - 면이 찻길 면(`floor['road']`)과 60% 이상 겹친다. 면적 4~800㎡, 두 끝 사이 거리 2.5~70m.
   - 기존 B3 횡단보도 면과 25% 넘게 겹치지 않는다(이미 그려진 것을 두 번 그리지 않는다).
   - 줄무늬(`stripes`)가 2개 이상 생긴다(화면에 줄이 보여야 한다).
   상한을 네가 정할 때는 위 분포를 근거로 쓰고 고른 값과 까닭을 답에 적는다. `unconfirmed` 로 남는 것은 기록에 그대로 남겨 둔다(왜 뺐는지 볼 수 있어야 한다).
3. **고치기 전 화면을 먼저 찍는다.** 자료를 다시 만들기 **전에** 개발 서버를 띄워(`pnpm exec vite --port 5199 --strictPort`) 세 자리를 찍어 `tmp/loop/s1-crossings/before/` 에 둔다. 이름과 주소를 그대로 쓴다(검사가 같은 주소로 다시 찍어 대조한다).
   `node tmp/connect/gpushot.mjs tmp/loop/s1-crossings/before "cross-1=http://localhost:5199/apps/mapo/mapo-all.html?tiles=1&center=224.88,-410.6&width=120" "cross-2=…&center=2826.55,841.64&width=120" "cross-3=…&center=1582.32,-952&width=120"`
4. **전역 A 보기만 다시 만든다.** `hapjeong_hd_a.py --area tools/v2/areas/mapo-all.json`(결과 `public/data/v2/mapo-all-a.json.gz`). 바닥 비교 `mapo-all.json.gz`, 건물 `mapo-all-buildings.json.gz`, 노면 세부 `mapo-all-road-paint.json.gz` 는 **다시 만들지 않는다**(횡단보도와 무관하다). 그다음 칸을 다시 포장한다: `tools/.venv/bin/python -B tools/v2/pack_district_tiles.py --area tools/v2/areas/mapo-all.json`.
5. **사진 대조 패널 세 장.** `tmp/loop/s1-review/plan.json` 에서 `J02-001`·`J07-001`·`J19-001` 세 줄만 골라 `tmp/loop/s1-crossings/plan.json` 으로 두고
   `tools/.venv/bin/python -B tools/v2/road_audit.py --area mapo-all --plan tmp/loop/s1-crossings/plan.json --out tmp/loop/s1-crossings/audit --workers 4`
   를 돌린다. 나온 `audit/panels/J02/J02-001-overlay.jpg`(그리고 J07·J19)를 `tmp/loop/s1-crossings/shots/audit-02.jpg`·`audit-07.jpg`·`audit-19.jpg` 로 복사한다. 고치기 전 패널은 `tmp/loop/s1-review/audit/panels/J02/…` 에 그대로 있으니 지우지 않는다(검수자가 나란히 본다). `--before tmp/loop/s1-review/audit` 가 받아들여지면 써도 된다.
6. **측정 기록** `tmp/loop/s1-crossings/measure.md`(20줄 안쪽): 고친 조건과 고른 상한, 전역 횡단보도 수의 전·후, 보충된 수, `crossingAudit` 상태 분포의 전·후, 누락 10곳의 자리별 전·후 수, 아직 `unconfirmed` 로 남은 것의 대표 이유.

## 문턱 (재는 명령)
`bash docs/redraw-orders/queue/s1-crossings/check.sh` 종료 0. 이 검사가 재는 것:
- `crossings.py`: 전역 횡단보도가 1,638개보다 많고 **1,900개 이상**, 보충된 줄이 100개 이상, 자리 20곳 가운데 **줄어든 자리 0곳**, 누락으로 적힌 10곳 가운데 **8곳 이상에서 늘어남**(반경 90m), 새 줄 전부가 위 2번의 가드를 지킴, `crossingAudit` 가 남아 있고 `unconfirmed` 가 1,674보다 적음, 홍대 일대 자료의 횡단보도가 497개 그대로.
- 화면: `cross-3`(폭 120m)이 고치기 전과 0.2% 이상 달라짐, `cross-1`(서교 175,-445.4)·`cross-2`(공덕 2773.4,886.5)는 화면 안 45m 에 보충된 횡단보도가 1개 이상(마스터 11-27: 처음 중심에는 받아들일 후보가 없어 새 면이 생긴 자리로 옮겼다), 폭 200m·700m·1,500m·전체 보기·모바일 폭 300m 캡처가 있고 오류 없음, 네 보기의 프레임 p95 ≤ 33ms·첫 표시 ≤ 8,000ms, 먼 단계 자료 ≤ 2,000,000바이트.
- 나빠지면 안 되는 것: 기존 화면 넷(`hongdae-district` 의 `?tiles=1` 폭 150m·700m, 기본 폭 700m, `yanghwa-map` 폭 700m)이 `tmp/loop/s1-tiles/before/` 와 픽셀까지 같다. `queue/s1-outline/check.sh`·`s1-tiles/verify.py --area mapo-all`·`s1-water/water.py`·`s1-paint/paint.py` 통과, `pnpm test:map` 통과, `src/sim`·다른 구역 자료·구역 설정·홍대 칸 자료 그대로.

검수자는 패널 세 장(`audit-02`·`audit-07`·`audit-19`)과 세 자리의 전·후 캡처를 직접 열어, 새로 생긴 횡단보도가 사진의 줄무늬 자리와 맞는지, 찻길이 아닌 곳이나 이미 그려진 횡단보도 위에 겹쳐 생기지 않았는지 본다.

## 하지 않는 것
- 일감 폴더(`docs/redraw-orders/queue/`)와 `crossings.py`·`check.sh` 를 고치지 않는다. 문턱을 못 넘으면 자료를 고친다.
- 차·사람·버스·신호, `walk.json` 다시 굽기, 다른 구역 자료, `src/sim`, 화면 코드(`src/aerial/`)는 손대지 않는다. 화면 코드를 고쳐야 할 까닭을 찾으면 고치지 말고 답에 적는다.
- 인도 폭·차선·정지선·교통섬 문제는 다음 일감이다. 이 일감은 **횡단보도만** 고친다.
- `pnpm bake`, 전체 `pnpm test`, 사진 타일 새로 받기는 돌리지 않는다.

## 답의 꼴 (15줄 안쪽)
바꾼 파일과 줄, 고른 상한과 그 까닭, 전역 횡단보도 전·후 수, 보충된 수, 누락 10곳 가운데 늘어난 자리, 아직 남은 `unconfirmed` 수와 대표 이유, 검사 요약, 못 한 것, 요청 밖으로 달라진 것.
