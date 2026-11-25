# s1-bake: 마포 전역 구역 설정과 정적 굽기 (차·사람 0)

## 지오의 원문 (2026-11-25 02:10)
「마포구를 그냥 전부 구현하자. 블랙홀처럼 성산동 일대가 빠져 있으니 애매해 보임.」「건물은 지금처럼 대충 그려놔도 상관없음 … 근데 도로는 조금 더 디테일이 있으면 좋겠어.」「신촌도 연대까지는 구현하는 게 좋지 않을까? 이대까지? 서강대도? … 기존에 해왔던 노하우가 있으니까 토큰 아껴가며 복붙하듯이 진행하면 좋을 거 같애.」

## 배경 (마스터가 확인한 것)
- 지금 저장소의 넓힌 지도 `hongdae-district`(5.63㎢)는 H2 커밋 4c3d90d1 의 길로 굽는다: 구역 설정 `tools/v2/areas/hongdae-district.json`, 정밀도로지도 원본 `tools/raw/ngii/hongdae-district/`(조각을 합치는 도구 `tools/v2/import_survey_tiles.py`), 바닥 `hapjeong_hd.py`·`hapjeong_hd_a.py`, 횡단보도 `hapjeong_crossings.py`, 건물 `hapjeong_buildings.py`, 검사 `check_connected_map.py`. 결과는 `public/data/v2/hongdae-district{,-a,-buildings}.json.gz`.
- dot 이 `tmp/mapo-all/preview-work/build.py` 로 만든 33㎢ 검토본은 이 길이 아니다(찻길·인도·물·건물 면만 있고 섬·A4·횡단보도·노면 표시가 비어 있다). **그 검토본을 옮기지 말고**, 위의 길을 전역 윤곽에 그대로 돌린다.
- 전역 윤곽 `tmp/mapo-all/i1/outline.json`(33.18㎢, 이미 이 프레임 좌표). 필요한 지도 조각 목록 `tmp/mapo-all/i1/sheets.tsv`(필요 184장, 182장이 `tools/raw/ngii/suchi/sheets/` 에 있음. 없는 376081852·376081875 는 한강 한가운데라 이번에는 비워 두고 개수만 적는다). 정밀도로지도 WFS 조각은 `tmp/mapo-all/i1/wfs/<층>_*.json`(a1·a2·a4·b1·b2·b3·c1 등, 240MB) 에 이미 받아 있다. 새로 받지 않는다.
- 근거로 읽을 곳: `docs/area-recipe.md` 의 「H2」 절(75~81행), 「I1」 절(24~40행), 「순서」 표(272~285행). 코드는 `rg -n '<파일 이름>' docs/code-map.md` 로 줄 범위를 찾아 그 범위만. `git show 4c3d90d1 --stat` 로 H2 가 건드린 파일을 본다.

## 할 일
1. `tools/v2/areas/mapo-all.json`: `hongdae-district.json` 을 본떠 id·title(「마포 3D 지도」)·window·outline 을 전역 윤곽으로. `comparisonAreas` 등 대조 설정은 지금 값을 그대로 쓰되 성립하지 않으면 최소로 고치고 답에 적는다. 차·사람 설정은 넣지 않거나 꺼 둔다.
2. 정밀도로지도 조각을 `tools/raw/ngii/mapo-all/` 로 합친다(`import_survey_tiles.py`).
3. 정적 자료만 굽는다: `public/data/v2/mapo-all.json.gz`, `mapo-all-a.json.gz`, `mapo-all-buildings.json.gz`. 차 그래프·보행 그물·출입구는 굽지 않는다. 메모리가 크면 `~/apps/scripts/heavy.sh 7200 <명령>` 으로 돌린다. 한 번에 2시간 넘거나 메모리가 모자라면 고치려 들지 말고 멈추고 어디서 막혔는지 적는다(단계 S1 의 「틀렸다는 신호」).
4. 검수용 위에서 본 그림 넷(`tmp/loop/s1-bake/{sinchon,seongsan,mapo-daero,gangbyeon}.png`, 각 400m×400m, 1픽셀 = 0.5m): 구운 `-a.json.gz` 와 `-buildings.json.gz` 에서 찻길·인도·섬·A4·횡단보도·노면 표시·건물을 색을 달리해 그린다(matplotlib 이나 PIL, 스크립트는 `tmp/loop/s1-bake/draw.py`). 자리: 연세로·신촌역 사거리, 성산동 성미산로 일대(지금 빈 곳), 마포대로 공덕 오거리, 강변북로와 양화대교 북단. 좌표는 프레임 좌표로 찾아 그림 제목에 적는다.

## 문턱 (재는 명령)
`bash docs/redraw-orders/queue/s1-bake/check.sh` 종료 0: 파일 일곱 개가 있고, `check_connected_map.py --area mapo-all` 이 통과하고, 단위 시험 둘이 통과하고, 다른 구역 자료·구역 설정·`src/sim` 이 그대로이고, 건물 30,000동 이상·횡단보도 1,500개 이상. 검수자는 그림 넷을 직접 열어 찻길·인도·횡단보도·노면 표시가 홍대 일대 수준으로 그려졌는지 본다.

## 하지 않는 것
- 화면(`src/aerial/`, `*.html`), 칸 나누기(`pack_district_tiles.py`), 차·사람 굽기는 다음 일감이다. 손대지 않는다.
- `hongdae-district` 와 다른 구역의 설정·자료를 고치지 않는다. 굽는 도구를 고쳐야 하면 기존 구역의 결과가 바이트 단위로 그대로인 범위에서만, 그리고 답에 줄 단위로 적는다.
- `tmp/mapo-all/preview-work/` 의 검토본, dot 의 보관 패치(`tmp/mapo-all/dot-wip-2026-11-25/`)를 쓰거나 고치지 않는다.
- 물 없는 두 조각을 메우지 않는다(다음 일감).

## 답의 꼴 (25줄 안쪽)
바꾼·만든 파일, 굽는 데 걸린 시간과 최대 메모리, `check_connected_map.py` 요약 수치(건물, 찻길·인도 면, 횡단보도, 노면 표시, 윤곽 밖, 겹침), 기존 구역과 비교해 이상한 수치, 못 한 것, 요청 밖으로 달라진 것.

## 검수할 때 (마스터가 21:45 에 더함)
`docs/redraw-orders/s1-checklist.md` 의 「자료를 만든 직후」 1~6번을 본다. 그림 넷으로 볼 수 있는 것은 그림을 직접 열어 보고, 수치는 검사 출력에서 확인한다. 항목마다 「봤다/못 봤다」를 가린다.
