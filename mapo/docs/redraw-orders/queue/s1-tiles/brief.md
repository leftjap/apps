# s1-tiles: 마포 전역을 칸으로 나누고 화면 주소 하나로 연다

지오: 「차로까지 완성하고 보여준다」. 「3d 로 구현하니까 자칫 pc나 모바일 웹에서 느려지거나 뻗을 수가 있잖아. 그런 것도 감안해서 작업해야지 나중에 갈아엎는 이유가 되면 안됨.」

전역 자료(`public/data/v2/mapo-all{,-a,-buildings}.json.gz`)는 앞 일감에서 이미 만들었다. 이번에는 그것을 홍대 일대와 같은 길(I2)로 칸으로 잘라, 전역 지도를 주소 하나로 여는 것까지 한다. 자료를 다시 만들지 않는다.

## 읽을 곳 (이것만 읽는다)

- `src/aerial/yanghwa-map.ts` 23~60줄: 구역 고르기와 칸 쓰기 판정.
- `src/aerial/district-tiles.ts`: 칸을 받고 버리는 쪽. `docs/code-map.md` 에서 줄 범위를 찾아 필요한 함수만.
- `tools/v2/pack_district_tiles.py` (137줄): 칸으로 자르는 도구.
- `docs/area-recipe.md` 의 「I2」 절(41~48줄): 홍대에서 정한 칸 구조와 잰 값, 전역으로 갈 때 볼 것.
- `hongdae-district.html` (26줄), `tools/v2/areas/hongdae-district.json` 의 `output`·`camera` 부분. `tools/v2/areas/mapo-all.json` 은 윤곽 좌표가 수만 줄이므로 통째로 읽지 말고 `tools/.venv/bin/python -c` 로 필요한 키만 꺼내 본다.

## 할 일

1. **칸 자료**: `tools/.venv/bin/python -B tools/v2/pack_district_tiles.py --area tools/v2/areas/mapo-all.json` → `public/data/v2/mapo-all-tiles/`(`.gitignore` 로 묶여 있다. 그대로 둔다).
2. **화면**: `mapo-all.html` 을 새로 만든다(`hongdae-district.html` 을 본뜨고 `data-area="mapo-all"`, 제목 「마포 3D 지도」, 출처 줄 그대로).
3. **칸 쓰기 판정 일반화**: 지금은 `src/aerial/yanghwa-map.ts:27` 이 `district === 'hongdae-district'` 로 묶여 있다. 구역 설정이 정하게 바꾼다(예: 구역 JSON 에 `"tiles": true`). 구역 이름 목록을 늘리는 방식은 쓰지 않는다. 홍대 화면의 `?tiles=1`·기본 주소·`?cars=1` 는 지금 그대로 돌아야 한다.
4. **먼 단계가 2.0MB 를 넘으면 줄인다**(I2 에서 177칸이면 약 2.0MB 로 어림했다). 줄이는 값(단순화 허용 오차, 작은 건물 묶기 기준 따위)은 **구역 설정에서 받게** 하고 기본값은 지금과 같게 해서, 홍대 칸 자료 41개가 바이트 그대로 남아야 한다(검사가 본다). 전역에만 다른 값을 준다.
5. **보기 일곱 개**를 `tmp/loop/s1-tiles/views.tsv` 에 `이름<탭>주소` 로 적는다. 이름과 배율은 정해져 있다:
   - `near-sinchon`, `near-hapjeong`, `near-gongdeok`, `near-seongsan`: `width` 60~200 (연세로·신촌역 사거리, 합정 사거리, 마포대로 공덕 오거리, 성산동 성미산로)
   - `mid-hongdae`, `mid-mapodaero`: `width` 600~1500
   - `full`: `width` 9000 이상(전체 보기)
   - 주소 틀: `http://localhost:5199/apps/mapo/mapo-all.html?tiles=1&center=<x>,<z>&width=<m>`. 가운데 좌표는 프레임 좌표다(구운 `-a.json.gz` 나 앞 일감의 그림에서 찾는다).
6. **잰 값**을 `tmp/loop/s1-tiles/measure.md` 에 15줄 안쪽으로 적는다: 칸 수, 먼 단계 바이트, 일곱 보기의 첫 표시·받는 자료·프레임, 모바일 전체 보기 값, 줄이려고 바꾼 것, 못 한 것.

## 문턱과 재는 명령

`bash docs/redraw-orders/queue/s1-tiles/check.sh` 한 번으로 다 잰다. 안에서 보는 것:

- 칸 색인이 윤곽을 덮는다(윤곽과 1만㎡ 이상 겹치는 500m 칸 가운데 빠진 것 0), 색인과 파일 크기가 맞는다.
- 먼 단계 `overview.json.gz` ≤ 2,000,000 바이트.
- 먼 단계의 횡단보도 수와 건물 면 수가 구운 자료와 **같다**(자르면서 잃지 않았다).
- 일곱 보기: 페이지 오류 0, 칸이 다 붙을 때까지의 첫 표시가 가까운·중간 보기 ≤ 8초·전체 보기 ≤ 6초, 받는 지도 자료가 가까운 ≤ 10MB·중간 ≤ 15MB·전체 보기 ≤ 2.5MB, 프레임 p95 ≤ 33ms(실제 GPU, 1440×900 DPR 2).
- 모바일(390×844 DPR 3, CPU 4배 느리게) 전체 보기는 **값만 적는다**(처음 재는 칸이라 문턱 없음).
- 기존 화면 네 장(`hongdae-district` 의 `?tiles=1` 폭 150m·700m, 기본 폭 700m, `yanghwa-map` 폭 700m)이 `tmp/loop/s1-tiles/before/` 와 픽셀까지 같다.
- `pnpm test:map` 통과, `src/sim`·다른 구역 자료·홍대 칸 자료가 그대로.

개발 서버는 `pnpm exec vite --port 5199 --strictPort` 로 띄운다(5198 은 다른 서버가 쓸 수 있다). 검사가 떠 있지 않으면 스스로 띄우고 끝나면 내린다.

## 하지 않는 것

- 차·사람·버스·신호(`?cars=1` 쪽 코드), `pnpm bake`, 전체 `pnpm test`.
- 다른 구역의 자료를 다시 만들거나 `src/sim` 을 고치는 것.
- 좌표·구간 번호·구역 이름으로 예외 두기.
- `tmp/loop/s1-tiles/before/` 의 그림과 `docs/redraw-orders/queue/s1-tiles/` 의 검사 파일 고치기(통과 기준이다).
- 미리보기 도구와 `claude-in-chrome`(지오에게 승인 창을 띄워 세션을 멈춘다). 소리를 내지 않는다.

## 답의 꼴

12줄 안쪽. 바꾼 파일, 칸 수와 먼 단계 바이트, 일곱 보기 수치(표는 `measure.md` 에 두고 핵심 세 줄만), 줄이려고 바꾼 것, 못 한 것과 막힌 자리.
