# 지시서 3c: 3D 화면 (`?v=2`)

기준 문서 `docs/redraw.md` 를 처음부터 끝까지 읽고 시작한다. 이 지시서와 기준 문서로 정해지지 않는 선택이 나오면 스스로 정하지 말고 멈춰서 묻는다. 이 지시서에 없는 파일은 고치지 않는다. 지시서 2(0ce01474), 3a·3b(dc22e61d)의 결과는 검수를 통과했다.

## 목표

주소에 `?v=2` 를 붙였을 때만, 새 자료(`public/data/v2/split.json`·`marks.json`)로 바닥과 노면 표시를 3D 화면에 그린다. 기본 주소(`?v=2` 없음)의 화면과 동작은 한 군데도 바뀌지 않아야 한다. 이 화면으로 지오가 3단계를 판정한다(`docs/redraw.md` 9절: 「3D 화면에서 깔끔함」).

차·사람, 신호등, 가로수, 버스 정류장, 골목의 표시, 시제품 구역 밖의 도로는 이 지시서의 범위가 아니다(`?v=2` 에서는 그리지 않는다).

## 읽는 자료

| 자료 | 파일 | 형식 |
|---|---|---|
| 바닥 네 면 | `public/data/v2/split.json` 의 `car`·`walk`·`mix`·`ped` | 다각형 목록, 다각형은 고리 목록(첫 고리 바깥, 나머지 구멍), 고리는 `[x, z, …]` dm 정수 |
| 노면 표시 | `public/data/v2/marks.json` 의 `center`·`lane`·`solid`(선, `[x, z, …]` dm), `stop`(`[x1, z1, x2, z2]` dm), `cross`(`{p: [x1, z1, … x4, z4] dm, sig, mid}`) | 지시서 3b |

두 파일은 `?v=2` 일 때만 받는다. 좌표는 10 으로 나눠 m 로 쓴다. x 는 동쪽, z 는 남쪽이고 앱의 판 좌표와 같다.

## 지금 코드에서 알아 둘 것 (기획 세션이 조사한 것. 줄 번호는 조사 시점 것이니 직접 확인한다)

- 쿼리는 `src/main.ts` 58줄 `URLSearchParams(location.search)` 로 읽는다. 차·사람은 67~68줄(`cars`, `people`).
- 자료는 97~117줄의 `Promise.all` 하나로 받는다. 예전 자료(`road.json`·`walk.json`·`surface.json`·`marks.json`)는 하나라도 못 받으면 앱이 죽고, 차 그래프·신호·정류장 자리는 켜지 않아도 늘 만든다. 그래서 **`?v=2` 에서도 예전 자료 받기와 시뮬레이션 준비는 그대로 두고**, 장면에 더하는 것만 가린다.
- 장면에 더하는 곳은 267~299줄이다. 도로에 관계된 것: `makeRoads`(190), `makeMarks`(195), `makeCurbs`(200), `makeSignalMarks`(211), `makeFlow`(212), `makePaving`(272), `makeBusStops`·`makeBusIslands`(278~279), `makeTrees`(218), 바닥 원판과 땅 쓰임새 `makeGround(mask, sidewalkAreas(board.groundAreas, surface))`(269).
- 다각형 면은 모듈마다 `THREE.ShapeUtils.triangulateShape(outer, holes)` 로 만든다(예: `src/render/roads.ts` 97~117줄 `addGround`). 띠는 `src/render/util.ts` 의 `ribbon()`·`addRibbon()`·`ribbonGeometry()`. 재질은 `src/render/env.ts` 의 `material()` 과 색 표 `pal`(낮·노을·밤이 저절로 바뀐다).
- 바닥 층은 모두 y = 0 이고 `renderOrder` 와 `material({offset})` 로 겹침을 피한다: 찻길 −5(offset 2), 노면 표시 −2.6(offset 5, y 0.35), 횡단보도 −2.5(offset 5, y 0.35).
- 타입 검사와 빌드는 `pnpm build`(`tsc --noEmit && vite build`). base 경로는 `/apps/mapo/`.

## 만들고 고칠 파일

1. **새 파일 `src/render/v2.ts`**: `makeGroundV2(split, marks)` 가 `THREE.Group` 을 돌려준다. 자료를 푸는 함수(dm → m, 형식 확인)도 이 파일에 둔다.
2. **`src/main.ts`**: 아래 「`main.ts` 에서 바꿀 것」만 고친다.
3. 그 밖의 `src/` 파일(`roads.ts`·`marks.ts`·`signals.ts`·`env.ts`·`util.ts` 등)은 고치지 않는다. `util.ts`·`env.ts` 의 도우미는 가져다 써도 된다. 예전 도로 그리기 모듈(`roads.ts`·`marks.ts`·`signals.ts`·`curbs.ts`·`areas.ts`)의 함수는 가져다 쓰지 않는다(필요한 만큼 `v2.ts` 안에 새로 쓴다).

## `v2.ts` 가 그리는 것

**바닥 면**(y = 0, `renderOrder` −5, `material` 의 offset 2, 구멍은 `triangulateShape` 의 holes 로):

| 면 | 색(`env.ts` 색 표의 키) |
|---|---|
| 찻길 `car` | `tarmac` |
| 함께 쓰는 면 `mix` | `tarmacMinor` |
| 인도 `walk` | `paving` |
| 사람만 쓰는 면 `ped` | `walk` |

색 표에 그 키가 없거나 `material()` 로 단색 면을 만들 수 없으면 멈추고 보고한다. 네 면은 서로 겹치지 않으므로 같은 `renderOrder` 를 쓴다.

**노면 표시**(예전 표시와 같은 높이·`renderOrder`·offset 을 쓴다: 높이 y = 0.35, 선과 정지선 `renderOrder` −2.6, 횡단보도 −2.5, offset 5. 예전 코드에서 값을 직접 확인하고, 다르면 예전 코드의 값을 따른다):

| 표시 | 모양 |
|---|---|
| 중앙선 `center` | 노란 실선, 폭 0.15m |
| 차선 `lane` | 흰 점선, 폭 0.15m, 3m 칠하고 5m 띄움(선의 처음부터 선을 따라 잰다) |
| 흰 실선 `solid` | 흰 실선, 폭 0.15m |
| 정지선 `stop` | 흰 실선, 폭 0.45m |
| 횡단보도 `cross` | 흰 줄무늬. 사각형의 네 꼭짓점은 차례로 E0+2v, EN+2v, EN+8v, E0+8v 다(앞 두 점을 이은 변이 길을 가로지르는 가까운 변, 뒤 두 점이 먼 변). 줄무늬는 길 방향(가까운 변에서 먼 변으로)으로 놓고, 가로지르는 방향으로 0.45m 칠하고 0.45m 띄운다. 가로지르는 변의 길이를 0.9m 로 나눠 줄무늬 수를 정하고 남는 폭은 양 끝에 고르게 남긴다 |

흰색과 노란색, 밤의 밝기는 예전 차선(`src/render/marks.ts` 의 `paint()` 와 그 재질)과 같게 한다: 흰색 (0.95, 0.95, 0.93), 노랑 (0.96, 0.76, 0.24), 밝기 `0.8 + 0.25 × (1 − uNight)`. 같은 식을 `v2.ts` 의 재질에 쓴다.

## `main.ts` 에서 바꿀 것

1. `const V2 = params.get('v') === '2'`(쿼리를 읽는 곳 옆).
2. `V2` 이면 `split.json`·`marks.json`(v2)을 받는다. 예전 `Promise.all` 은 그대로 두고, 그 뒤에 따로 받거나 같은 묶음에 조건으로 더한다. 못 받으면 예전 자료처럼 오류를 낸다.
3. `V2` 이면 차·사람을 켜지 않는다(`cars=1`·`people=1` 이 있어도 꺼진 것으로 다룬다).
4. `V2` 이면 아래를 **장면에 더하지 않는다**(만드는 코드는 그대로 둔다. 다른 코드가 그 객체를 쓰므로): 찻길 면(`makeRoads` 의 결과), 예전 노면 표시(`makeMarks`), 연석(`makeCurbs`), 횡단보도와 신호등(`makeSignalMarks`), 정체 띠(`makeFlow`), 로드뷰 포장(`makePaving`), 버스 쉼터와 중앙 승강장, 가로수. 장면에 더하지 않은 객체의 `update` 가 매 프레임 불려도 오류가 나지 않는지 확인한다(오류가 나면 그 호출만 `V2` 가 아닐 때로 묶는다).
5. `V2` 이면 바닥 원판은 `makeGround(mask, board.groundAreas 에서 종류가 GK.ROADSIDE 가 아닌 것)` 으로 만든다(`sidewalkAreas(…, surface)` 를 쓰지 않는다). 예전 도로 부지 면이 새 인도 옆에 남지 않게 하려는 것이다.
6. `V2` 이면 `makeGroundV2(…)` 의 결과를 장면에 더한다.
7. `V2` 가 아닐 때의 코드 경로는 바꾸지 않는다. 조건문으로 감싸는 것 말고는 줄을 옮기거나 고쳐 쓰지 않는다.

`makeRoads` 의 결과에 다리 상판·터널 입구·교각이 함께 들어 있어서 4를 따르면 `?v=2` 에서는 다리도 사라진다. 이번에는 그대로 둔다(시제품 구역 안만 본다).

## 확인과 화면

1. `pnpm build` 가 오류 없이 끝난다(타입 오류 0).
2. 화면 찍기: 빌드 결과(`dist/`)를 `pnpm exec vite preview --port 5198 --strictPort` 로 배경에서 띄우고(끝나면 반드시 끈다. 5198 이 쓰이고 있으면 멈추고 보고한다), 헤드리스 Chromium 으로 찍는다. 검수 세션이 카카오맵을 찍을 때 쓴 것과 같은 `~/apps/pick/node_modules/.pnpm/playwright-core@1.60.0` 을 쓴다(없으면 멈추고 보고한다). 디버그 크롬(9333)이 headed 로 떠 있으면 쓰지 않는다. 미리보기 도구(`preview_start`, `mcp__Claude_Browser__*`)와 claude-in-chrome 은 쓰지 않는다. 화면 크기 1600×1000, 화면이 다 그려진 뒤(로딩이 끝나고 3초 뒤) 찍는다.
3. 찍을 화면(`tmp/v2/shots/` 에 저장, 커밋하지 않는다). 카메라 자리는 지금 앱이 가진 방법(`view`·`tour` 쿼리, 또는 `main.ts` 의 카메라 조작 코드)으로 잡는다. **지금 있는 방법으로 아래 자리를 잡을 수 없으면, 카메라용 쿼리를 새로 만들지 말고 멈춰서 어떤 방법이 있는지 보고한다.**
   - `3d-v2-top.png`: 시제품 구역 전체가 보이게 위에서.
   - `3d-v2-hapjeong.png`(합정 사거리, 판 (−490, 245)), `3d-v2-seogyo.png`(서교동사거리, (−70, −130)), `3d-v2-hongdae.png`(홍대입구역, (670, −830)), `3d-v2-walk.png`(홍대 걷고싶은거리, (640, −560)), `3d-v2-eoul.png`(어울마당로 남쪽, (160, 200)): 비스듬히 내려다보는 각도로, 화면 폭에 약 150~250m 가 들어오게.
   - `3d-v2-seogyo-night.png`: 서교동사거리의 밤 화면(시각 쿼리는 `makeClock(location.search)` 이 읽는 것을 쓴다).
   - `3d-v1-seogyo.png`: 같은 서교동사거리를 `?v=2` 없이(기본 화면이 그대로인지 보는 용도).
4. 기본 화면이 바뀌지 않았는지: `?v=2` 없는 화면을 이 변경 전 커밋의 빌드와 같은 자리에서 한 장씩 찍어 눈으로 견준다(변경 전 빌드는 `git worktree` 를 쓰지 말고, 변경을 커밋하기 전에 `git stash` 도 쓰지 말고, 배포본 `https://leftjap.github.io/apps/mapo/` 을 같은 자리로 열어 찍는다). 다르면 멈추고 보고한다.
5. 커밋 직전에 `pnpm test:map` 을 한 번 돌리고 요약 줄만 읽는다(`mapo/CLAUDE.md` 토큰 절약 규칙 3). 이 변경과 상관없는 실패가 이미 있었다면 그 개수를 변경 전과 견줘 적는다.

## 하지 않는 것

- `src/render/v2.ts` 와 `src/main.ts` 말고는 만들거나 고치지 않는다. `tools/`, `public/data/`, `test/` 를 고치지 않는다.
- 기본 화면(`?v=2` 없음)을 바꾸지 않는다.
- 결과가 어색해도 이 지시서에 없는 것(연석 높이, 그림자, 색 고르기, 차선 다듬기, 구역 밖 도로 그리기)을 넣지 않는다. 본 것을 보고에 적는다.
- 화면(`tmp/`)은 커밋하지 않는다. 굽기(`pnpm bake`), 전체 `pnpm test`, 하위 에이전트를 쓰지 않는다.

## 검수 세션이 화면에서 볼 것 (구현 세션은 고치지 않는다)

1. 찻길·인도·함께 쓰는 면·사람만 쓰는 면이 2D 그림과 같은 자리에 같은 모양으로 그려졌는지(구멍, 빠진 면, 뒤집힌 삼각형이 없는지).
2. 건물과 바닥이 어긋나거나, 바닥 면끼리 깜빡이는 겹침(z-fighting)이 있는지.
3. 차선·중앙선·정지선·횡단보도가 찻길 위에 제대로 놓였는지, 밤 화면에서 보이는지.
4. 시제품 구역 테두리 안팎과 「그 밖」 땅(예전 땅 쓰임새 면)이 새 바닥 옆에서 어색한지.
5. 기본 화면이 그대로인지.

## 끝나는 조건과 보고

- `pnpm build` 가 끝나고 화면 여덟 장이 생겼고 기본 화면이 그대로이면, `src/render/v2.ts`·`src/main.ts` 만 커밋하고 푸시한다(커밋 전 `git log --oneline -1` 로 WIP 스냅샷 커밋이 끼었는지 본다. `git stash`·`reset --hard`·브랜치 전환·force push 금지). 푸시하면 배포가 돌므로, 빌드가 실패하는 상태로 푸시하지 않는다.
- 보고는 열 줄 안쪽, 맨 앞에 커밋 해시: `pnpm build` 결과, `pnpm test:map` 요약, 쓴 색 표의 키와 실제 색, 카메라를 잡은 방법, 화면 파일 목록, 화면에서 눈에 띈 것(고치지 말고 적기만).
- 같은 문제를 두 번 고쳐도 안 되면 멈추고 원인을 보고한다.
