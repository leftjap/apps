# s1-paint: 전역 화면에 빗금 안전지대와 방향 화살표를 올린다

지오(2026-11-25): 「건물은 지금처럼 대충 그려놔도 상관없음 … 근데 도로는 조금 더 디테일이 있으면 좋겠어.」 이 단계의 목표는 전역 지도를 **차로와 노면 표시까지** 완성해 지오에게 주소 하나로 보이는 것이다. 지금 전역 화면에는 빗금 안전지대와 방향 화살표가 아예 없다. 검수 목록 9·10번이다.

## 이미 알아낸 것 (다시 조사하지 않는다)

- **까닭**: 전역에는 `public/data/v2/mapo-all-road-paint.json.gz` 가 없다. 홍대 일대에는 있다(`hongdae-district-road-paint.json.gz`, 1.19MB). 이 자료를 만드는 도구는 `tools/v2/survey_road_paint.py` 이고 전역에는 한 번도 돌리지 않았다.
- **화면 쪽은 이미 그릴 준비가 돼 있다**: `tools/v2/pack_district_tile_meshes.mjs` 22행이 `read('road-paint', true)` 로 **있으면** 읽고 없으면 거친 칠만 넣는다. `src/aerial/yanghwa-terrain.ts` 97~106행이 노란 빗금·흰 빗금·화살표·흰 선 세부를 각각 다른 높이와 우선순위로 쌓는다. 그래서 **화면 코드와 칸 포장 코드는 고칠 일이 없을 것이다**(고쳐야 할 까닭을 찾으면 답에 적는다).
- **칸 모드에서는 `road-paint` 를 따로 읽지 않는다**: `src/aerial/yanghwa-map.ts` 56~62행에서 칸 모드(`tiles`)면 `legacy` 쪽을 건너뛴다. 전역은 설정에 `"tiles": "default"` 라 항상 칸 모드다. 따라서 **칸 자료를 다시 포장해야 화면에 나온다**.
- **원자료는 다 있다**: `tools/raw/ngii/mapo-all/b3.json`(15.4MB, 화살표), 수치지형도 `A0053326`(평면 도색 안전지대). 설정은 `hdSharedExtents: true` 라 `features('b3')` 가 그대로 `b3.json` 을 읽는다.
- **홍대 일대 값(눈금)**: 안전지대 106개, 화살표 면 942개(`5371` 460·`5372` 168·`5373` 98·`5381` 43·`5382` 123·`5383` 2·`5391` 11·`5392` 19·`5431` 15·`5432` 3), 흰 선 세부 8,741·정지선 326. 홍대 5.63㎢, 전역 33.18㎢. **전역 윤곽은 홍대 윤곽을 품고 두 구역의 평면 원점이 같다**(경도 126.919°, 위도 37.5515°). 그래서 전역 값은 홍대 값보다 작을 수 없다.
- **지금 전역 값**: A 자료 선 19,043·횡단보도 1,638·거친 칠 4층, 칸 177개, 먼 단계 1.41MB, 건물 32,295동. 칸 색인 `public/data/v2/mapo-all-tiles/index.json` 의 항목마다 `bytes`·`rawBytes` 가 있다.
- **A 자료는 최신이다**(11-26 10:21, `s1-fill-lanes` 뒤). 다시 만들지 않는다.

## 읽을 곳 (이것만 읽는다)

- `tools/v2/survey_road_paint.py` 전체(249줄). 무거운 자리는 `closed_zones`(26~53행), `bake_details` 안의 `union_all(... buffer ...)`(122행), B2 모으기(125~139행)다.
- `tools/v2/pack_district_tiles.py` 110~136행(`pack_district_tile_meshes.mjs` 를 부르는 부분과 인자).
- `src/aerial/yanghwa-terrain.ts` 84~115행(층을 쌓는 규칙과 `fineWidth`).
- 그 밖에 필요한 것은 `rg -n '<이름>' docs/code-map.md` 로 줄 범위를 찾아 그 범위만 읽는다. 큰 원자료(`tools/raw/`)와 구운 자료는 통째로 읽지 않는다.

## 할 일

1. **전역 노면 세부 자료를 만든다.**
   `PYTHONPATH=tools/v2 tools/.venv/bin/python -B tools/v2/survey_road_paint.py --area tools/v2/areas/mapo-all.json --stats tmp/loop/s1-paint/stats.json`
   배경으로 돌리고 기록을 `tmp/loop/s1-paint/bake.log` 에 남긴다. 걸린 시간을 적는다.
   **막히면**: 60분을 넘거나 메모리가 모자라면 멈추고, 자료가 정하는 단위(B2 선 그물의 이어진 덩어리, 지도 조각)로 나눠 돌리는 쪽으로 고친다. 좌표·구역 이름·조각 번호로 예외를 두지 않는다. 그래도 안 되면 답에 막힌 자리를 적는다.
2. **가장 많이 달라질 자리 셋을 자료에서 고른다.** 안전지대 빗금과 화살표 면의 중심을 120m 격자로 세어, 면 수가 가장 많은 칸 셋을 고른다(서로 300m 이상 떨어진 것). 좌표를 코드에 적지 말고 자료에서 구한다. 결과를 `tmp/loop/s1-paint/spots.tsv` 에 머리줄 없이 `이름<탭>x<탭>z<탭>안전지대면<탭>화살표면` 으로 세 줄 쓴다(이름은 `paint-1`·`paint-2`·`paint-3`).
3. **고치기 전 화면을 먼저 찍는다.** 칸을 다시 포장하기 **전에**:
   - `cp public/data/v2/mapo-all-tiles/index.json tmp/loop/s1-paint/before/index.json`
   - `node tmp/connect/gpushot.mjs tmp/loop/s1-paint/before "paint-1=…&center=<x>,<z>&width=120" …` 로 세 자리를 찍는다(주소 틀은 아래 「문턱」의 `base`).
4. **칸을 다시 포장한다.** `tools/.venv/bin/python -B tools/v2/pack_district_tiles.py --area tools/v2/areas/mapo-all.json`. 먼 단계가 상한(2,000,000바이트)을 넘으면 `pack_district_tiles.py` 가 넘기는 `overviewBytes` 나 `yanghwa-terrain.ts` 의 `fineWidth` 로 **멀리서는 단순하게** 만든다(검수 목록 8번: 멀리 볼수록 칠이 한 픽셀 굵기로 남아 차로를 가리지 않는다). 가까운 칸의 세부를 줄여서 상한을 맞추지 않는다.
5. **고친 뒤 화면을 찍는다.** 세 자리(폭 120m) + 중간(폭 700m) + 전체 보기 + 모바일(폭 300m)을 `tmp/loop/s1-paint/shots/` 에 찍는다. 이름은 `paint-1`·`paint-2`·`paint-3`·`mid-700`·`full`·`mob-300`.
6. **직접 본다.** 찍은 세 자리를 열어 빗금이 **빗금으로**(테두리 선만 있으면 폭 2m 짜리 차로처럼 보인다. 검수 목록 9번) 그려졌는지, 노란 빗금 띠가 절반만 그려진 자리가 있는지, 화살표가 차로 가운데에 차로 방향으로 놓였는지(검수 목록 10번) 본다. 본 것을 아래 7번에 적는다.
7. **잰 값을 `tmp/loop/s1-paint/measure.md` 에 14줄 안쪽으로 적는다**: 안전지대 수와 만든 방법별 수, 화살표 면 종류별 수, 흰 선 세부·정지선 수, 떨어뜨린 까닭별 수(`stats.json` 의 `rejected`·`skippedSymbols`·`open531`), 자료 크기, 걸린 시간, 칸 수와 먼 단계 바이트, 고른 세 자리와 그 자리에서 본 것, 네 보기 수치, 못 한 것.

## 문턱과 재는 명령

`bash docs/redraw-orders/queue/s1-paint/check.sh` 종료 0(`PASS-PAINT`). 안에서 보는 것:

- 자료: `mapo-all-road-paint.json.gz` 가 있고, 안전지대 ≥ 106, 화살표 면 합 ≥ 942, 흰 선 세부 ≥ 8,741, 정지선 ≥ 326(전역이 홍대를 품으므로 확실한 하한이다). 홍대 구역 상자 안에서 센 값이 홍대 자료의 85% 이상(같은 길로 만들었다는 증거).
- 칸: 세 자리를 덮는 칸의 `rawBytes` 가 고치기 전보다 각각 2% 이상 늘었고, 칸 수가 177개보다 줄지 않았다. 먼 단계 ≤ 2,000,000바이트.
- 화면: 세 자리의 고치기 전·후 캡처가 각각 **0.3% 이상** 다르고(실제로 그려졌다는 증거), 세 캡처가 서로 다르다. 네 보기(세 자리 가운데 하나, 폭 700m, 전체 보기, 모바일 폭 300m) 페이지 오류 0, 첫 표시 ≤ 8초, 프레임 p95 ≤ 33ms.
- 나빠지면 안 되는 것: 기존 화면 넷(`hongdae-district` 의 `?tiles=1` 폭 150m·700m, 기본 폭 700m, `yanghwa-map` 폭 700m)이 `tmp/loop/s1-tiles/before/` 와 픽셀까지 같다. `queue/s1-outline/check.sh` 통과, `queue/s1-tiles/verify.py --area mapo-all` 통과, `queue/s1-water/water.py` 통과, `pnpm test:map` 통과, `src/sim`·다른 구역 자료·설정·홍대 칸 자료 그대로.
- 처음 재는 칸이라 문턱을 걸지 않고 값만 적는 것: 폭 700m 캡처가 고치기 전과 몇 % 다른지(검수 목록 8번의 근거), `open531`(닫히지 않은 안전지대 선) 수.

개발 서버는 검사가 5199 로 띄운다(5198 은 다른 서버가 쓴다). 주소 틀은
`base='http://localhost:5199/apps/mapo/mapo-all.html?tiles=1'` 이고 여기에 `&center=<x>,<z>&width=<m>` 을 붙인다. 검사를 돌리기 전에 지금 상태로 한 번 돌려 두면 어디가 실패인지 바로 보인다.

## 하지 않는 것

- 차·사람·버스·신호 쪽 코드와 재생, `pnpm bake`, 전체 `pnpm test`.
- A 자료·건물 자료 다시 만들기(최신이다). 다른 구역의 자료·설정·`src/sim` 고치기, 홍대 칸 자료 다시 만들기.
- 좌표·조각 번호·구역 이름·화살표 ID 로 예외 두기. 떨어진 화살표를 손으로 더하기.
- 버스 차로 붉은 포장 새로 만들기(검수 목록 17번: 자료에 끝나는 자리가 없어 보류 중이다).
- 앞 일감의 검사 파일(`queue/s1-bake/`, `queue/s1-outline/`, `queue/s1-tiles/`, `queue/s1-water/`)과 `tmp/loop/s1-tiles/before/` 의 그림 고치기. 이 일감 폴더의 `check.sh`·`paint.py` 도 고치지 않는다.
- 미리보기 도구와 `claude-in-chrome`(지오에게 승인 창을 띄워 세션을 멈춘다). 소리를 내지 않는다.

## 답의 꼴

12줄 안쪽. 바꾼 파일, 안전지대·화살표·흰 선 수와 떨어뜨린 까닭, 고른 세 자리와 직접 본 것, 칸·먼 단계 수치, 네 보기 수치, 검사 요약, 요청 밖으로 달라진 것, 못 한 것과 막힌 자리. 긴 표는 `measure.md`·`stats.json` 에 두고 이름만 적는다.
