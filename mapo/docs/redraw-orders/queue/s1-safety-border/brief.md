# s1-safety-border: 안전지대 테두리(B2 531)를 선으로 그린다

## 지오의 원문
「근데 도로는 조금 더 디테일이 있으면 좋겠어.」「이 지도를 보면서 사람들이 차가 정확히 가나 이런 거 보는 거 아냐, 적당히 차들이 많다, 실제 구현한 거 같다 이런 느낌이 있으면 되는 거야.」

## 배경 (조사는 끝났다. 다시 조사하지 않는다)
앞 일감 `s1-review` 가 큰 교차로 20곳을 항공사진과 대조했더니, 「교차부 가운데 황색 빗금 테두리 사각형이 사진에 있고 모형에는 없다」가 **06 이대역·07 공덕오거리·10 광흥창역·11 상수역·12 망원역·16 성산2교** 여섯 곳에서 나왔다(`tmp/loop/s1-review/findings.tsv` 의 「차선」 줄). 차선 항목은 20곳 가운데 19곳이 「틀림」이었고 그 가운데 아홉 곳의 사유가 이 테두리다.

까닭은 계획 세우기가 자료에서 확인했다. **정밀도로지도 B2 의 종류 531(안전지대)이 선으로 그려지지 않는다.**

- `tools/v2/hapjeong_hd.py` 의 `KINDS`(30~35행)에 `'531'` 이 없다. 그래서 `marking_style` 이 `{'color': 0, 'width': 0.15, 'dash': 0, 'known': False}` 를 돌려준다(색 0 = 모르는 종류).
- `tools/v2/hapjeong_hd_a.py` 의 `LINE_KINDS`(18행)에도 없다. 그래서 A 보기 자료의 `lines` 에서 아예 빠지고 `connected_paint` 가 칠하지 않는다. 지금 A 보기의 선 종류는 503 4,085·515 5,130·501 3,195·505 2,191·506 2,097·530 1,314·525 780·504 251 뿐이고 **531 은 0줄**이다.
- **자료에는 있다.** 바닥 자료 `public/data/v2/mapo-all.json.gz` 의 `lines` 에 531 이 **340줄, 총 5,945m** 있다(황색 실선 type 111 220줄·2,716m, 백색 실선 211 119줄·3,186m, 백색 점선 212 1줄·43m). 원본 `tools/raw/ngii/mapo-all/b2.json` 에는 944개다.
- `tools/v2/survey_road_paint.py` 는 531 을 **빗금 면을 만드는 데만** 쓴다(받아들인 면 46개, 거절 8개, 테두리가 열려 있어 버린 선 73개). 그래서 사진의 「테두리 + 빗금」 가운데 빗금만 일부 남고 테두리가 전혀 없다.
- 반경 60m 안의 531 줄 수: 04 동교동삼거리 8, 06 이대역 8, 08 마포역 8, 14 월드컵경기장 6, 05 신촌오거리 4, 07 공덕오거리 4, 13 마포구청역 4.

## 할 일
1. **`KINDS` 에 `'531'` 을 더한다**(이름은 「안전지대」). 폭과 점선은 앱의 노면 규격표에서 고른다(`style(<앱 종류 번호>, form)`). 색은 `TYPES` 가 정하므로 손대지 않는다(황색 1, 백색 2). 결과 ink 가 **폭 0.10~0.25m, 실선(type 111·211)은 `dash` 0, 점선(212)은 `dash` ≠ 0, `known` True** 여야 한다(검사가 세 type 을 따로 센다).
2. **`LINE_KINDS` 에 `'531'` 을 더한다.** 다른 종류는 더하지도 빼지도 않는다.
3. **다시 굽는다. 이 순서대로다**(모두 `--area tools/v2/areas/mapo-all.json`, 괄호는 앞서 걸린 시간):
   - `hapjeong_hd.py`(43초) → 바닥 자료의 531 ink 가 고쳐진다. 이 단계를 빼면 ink 가 옛 값(색 0)으로 남는다.
   - `hapjeong_hd_a.py`(3분 30초) → `lines` 에 531 이 들어오고 `paint` 가 다시 칠해진다.
   - `survey_road_paint.py --stats tmp/loop/s1-safety-border/stats.json`(4분) → 흰 노면 표시 분리가 다시 계산된다. **검사가 이 `stats.json` 을 읽는다.**
   - `pack_district_tiles.py`(21초).
   - 건물·지붕(`hapjeong_buildings`·`survey_roof_tiles`)은 다시 굽지 않는다. 다른 구역도 다시 굽지 않는다(그 구역은 다음에 다시 구울 때 같은 규칙을 받는다).
4. **고치기 전 화면을 먼저 찍는다.** 자료를 다시 만들기 **전에** 개발 서버를 띄워(`pnpm exec vite --port 5199 --strictPort`) 아래 여덟 장을 `tmp/loop/s1-safety-border/before/` 에 둔다. 이름과 주소를 **그대로** 쓴다(검사가 같은 주소로 다시 찍어 대조한다). 가까운 다섯 자리는 계획 세우기가 **창 안에 531 이 실제로 몇 미터 있는지 세서** 고른 곳이다(bd1 173m, bd2 162m, bd3 128m, ewha-120 96m, near-200 373m).
   `node tmp/connect/gpushot.mjs tmp/loop/s1-safety-border/before "bd1=http://localhost:5199/apps/mapo/mapo-all.html?tiles=1&center=2941.3,833.2&width=60" "bd2=…&center=2497.5,1205.8&width=60" "bd3=…&center=-1756.4,-1104.7&width=60" "ewha-120=…&center=2373.44,-588.25&width=120" "near-200=…&center=2941.3,833.2&width=200" "mid-700=…&center=2941.3,833.2&width=700" "mid-1500=…&center=2941.3,833.2&width=1500" "full=…&center=-1192.55,-853.53&width=12000"`
5. **사진 대조 패널 두 장.** `tmp/loop/s1-approach/plan.json` 에서 줄 하나를 복사해 두 줄짜리 `tmp/loop/s1-safety-border/plan.json` 을 만든다(`id` 는 `L01-001`·`L02-001`, `xy` 는 bd1·bd2 의 중심, `extra` 는 자리 이름, 나머지 칸은 복사한 줄 그대로). 그다음
   `tools/.venv/bin/python -B tools/v2/road_audit.py --area mapo-all --plan tmp/loop/s1-safety-border/plan.json --out tmp/loop/s1-safety-border/audit --workers 4`
   를 돌리고 나온 `audit/panels/L01/L01-001-overlay.jpg`·`L02/L02-001-overlay.jpg` 를 `tmp/loop/s1-safety-border/shots/audit-1.jpg`·`audit-2.jpg` 로 복사한다.
6. **측정 기록** `tmp/loop/s1-safety-border/measure.md`(15줄 안쪽): 더한 종류와 그 ink(세 type 각각), A 보기 선 종류별 수의 전·후, 531 줄 수와 길이, 노면 도색 색별 면적의 전·후, 빗금·화살표 수가 그대로인지, 캡처 여덟 장의 픽셀 차이, 겹쳐 보일 때 테두리가 빗금 면과 어긋나는 자리가 있으면 그 수, 못 한 것.

## 읽을 곳 (이것만 읽는다)
- `tools/v2/hapjeong_hd.py`: 30~40행(`KINDS`·`TYPES`), 148~156행(`marking_style`), 228~245행(`bake` 가 B2 를 `lines` 로 넣는 자리).
- `tools/v2/hapjeong_hd_a.py`: 18행(`LINE_KINDS`), 165~176행(`connected_paint`), 250~256행(`bake_a` 가 `lines`·`paint` 를 넣는 자리).
- `tools/v2/survey_road_paint.py`: 96~104행(`split_white_paint`), 125~142행(531·501 로 빗금 면을 만드는 자리).
- 앱의 노면 규격표는 `tools/v2/aerial_paint.py` 의 `style`·`paint_definitions` 로 읽는다(`style(1, 1)` 은 폭 0.15m 실선이다).
- 함수의 줄 범위는 `rg -n '<이름>' docs/code-map.md` 로 찾는다. 다른 파일은 열지 않는다.

## 문턱 (재는 명령)
`bash docs/redraw-orders/queue/s1-safety-border/check.sh` 종료 0. 검사 파일(`check.sh`·`border.py`)을 고치지 않는다. 이 검사가 재는 것:

- 자료(`border.py`): 바닥 자료의 선 19,980줄·횡단보도 1,629·자전거 182 그대로, 531 이 type 별로 220·119·1줄이고 길이가 자료와 ±2% 안이며 ink 가 위 1번의 규격을 지킴. A 보기에 531 이 340줄·5,800~6,100m 들어오고 다른 종류의 줄 수는 전과 **똑같음**, 요청에 없는 종류가 들어오지 않음. 노면 도색 면적이 색 0 은 3,719㎡ 그대로, **색 1 은 32,060~32,500㎡**(전 31,924, 황색 테두리 +407㎡ 가 들어올 자리), **색 2 는 54,340~54,900㎡**(전 54,183, +484㎡), 색 3 은 1,779㎡ 그대로. 빗금 면 46·40·661개와 황색 빗금 250개, 화살표 종류별 수, 열린 테두리 73·중앙 조각 694 가 전과 똑같음.
- 앞 일감 검사 다섯(`s1-outline`·`s1-tiles`·`s1-water`·`s1-paint`·`s1-approach`)을 그대로 다시 돌려 통과.
- 캡처 아홉 장(폭 60m 세 장, 120m, 200m, 700m, 1,500m, 전체 보기, 모바일 폭 300m)에 페이지 오류가 없고, **가까운 다섯 자리가 고치기 전과 bd1·bd2 0.4%, bd3 0.3%, near-200 0.08%, ewha-120 0.06% 이상 다름**(테두리가 실제로 그려졌다는 뜻), **넓은 보기 셋은 폭 700m 0.5%·1,500m 0.3%·전체 0.2% 이하로만 다름**(넓은 화면이 크게 바뀌지 않았다는 뜻).
- 여섯 보기 수치: 프레임 p95 ≤ 33ms, 첫 표시 ≤ 8,000ms, 먼 단계 ≤ 2,000,000바이트.
- 기존 화면 넷(홍대 칸 150m·700m, 홍대 평면 700m, 양화 700m) 픽셀이 그대로, `src/` 안 바뀜, 다른 구역 자료와 `tools/v2/areas/mapo-all.json` 안 바뀜, 홍대 칸 자료 안 바뀜, `pnpm test:map` 통과.
- `pnpm test:map` 의 시험이 노면선 종류 목록을 못 박고 있으면 그 시험도 새 종류를 포함하게 고친다.

## 하지 않는 것
- **종류 502(유턴구역선 466줄)·599 는 이 일감에서 넣지 않는다.** 사진으로 무엇인지 확인한 뒤 다음 일감에서 다룬다.
- 열려 있어 면이 되지 못한 531 테두리 73개를 면으로 만들거나 빗금을 채우지 않는다. 빗금 면·화살표 수를 바꾸지 않는다(검사가 같은 수를 센다).
- 좌표·구역 이름·교차로 번호로 예외를 두지 않는다. 테두리를 눈에 맞춰 굵게 하거나 색을 바꾸지 않는다(자료의 색과 규격 폭을 쓴다).
- 차·사람 재생, `pnpm bake`, 전체 `pnpm test`, 건물·지붕 다시 굽기, 다른 구역 다시 굽기, 미리보기 도구, 소리.
- `tools/sol/`, 다른 일감 폴더, 이 일감의 `check.sh`·`border.py` 를 고치지 않는다.

## 답의 꼴
10줄 안쪽: 바꾼 파일, 531 에 준 ink(세 type), 핵심 수치(A 보기 531 줄 수·길이, 색 1·2 면적의 전·후, 가까운 다섯 자리의 픽셀 차이), 겹쳐 본 결과 한 줄, 못 한 것, 요청 밖으로 달라진 것. 긴 표와 그림은 파일로 두고 이름만 적는다.
