# ~/apps

## 프로젝트 구조
- 앱: Study/Today/Book/Pick/Cue/Best (PWA, GitHub Pages `/apps/<app>/` 배포). `launcher/` 는 디자인 브리프 스텁(앱 아님). `lietome/` 는 라이투미(표정 판독 게임 시제품, 의존성 없는 `node build.mjs`, `/apps/lietome/` 배포, 설계는 `lietome/docs/design.md`, 탐색용 임시 화면은 `lietome/lab/<이름>/index.html` 한 파일로 두면 빌드가 `/apps/lietome/lab/<이름>/` 으로 그대로 올린다. 앱의 미리보기 창이 옆 파일을 읽지 못하고 500KB 넘는 HTML 을 열지 못하므로 사진은 파일 안에 넣는다(`lietome/tools/lab-like/build.py`, `test/lab.test.js` 가 검사)). `mapo/` 는 마포 라이브 3D(작업 전 `mapo/CLAUDE.md` 의 4단계 순서·승인 게이트·하드코딩 금지부터 따른다. 마포구 미니어처 웹 토이, Vite+TypeScript+three, `/apps/mapo/` 배포, 설계는 `mapo/docs/design.md`. 다른 구역으로 넓힐 때는 `mapo/docs/new-area-checklist.md`(마포에서 생긴 실수와 마포 전용 값 목록)부터 읽는다. 지도 자료는 `pnpm fetch`→`pnpm bake` 로 구워 `mapo/public/data/` 에 커밋해 두고 CI 에서는 굽지 않는다. 현재 1.9단계: 홍대입구·연남·합정·서강대교 반경 2km, 전부 시뮬레이션. 버스 노선·정류장·학교 부지는 OSM, OSM 에 없는 건물은 Overture(`mapo/tools/overture.py`)를 굽고 위치·배차·신호는 시뮬레이션. 차는 길 정본(`mapo/public/data/road.json`, 서울시 차선으로 읽은 차로와 선 없는 방향까지 굽기가 정한 최종 차로, `pnpm bake` 가 함께 굽고 판을 손으로 바꿨으면 `node tools/road.ts`, 설계 문서 51절. 실행 중에는 차로를 고치지 않는다)의 차로 가운데선을 따라 달리고 차로마다 서울시 정지선(없으면 횡단보도 1m 앞)에 서며(40절), 교차로·신호(`mapo/src/sim/intersection/`: 차로마다 허용 움직임, 교차로 안 고정 경로, 게이트에서만 들어가기, 45절)를 따르고, 대수는 도로 흐름 속도로 정해 카메라가 보는 곳부터 채우며 화면 밖에서만 놓고 뺀다. 사람 수는 구역 인구 비례(화면 배율 표시), 건물 출입구·역 출구·정류장으로 드나들고, 나이대·성별은 공급자 비율(실시간 도시데이터와 같은 칸)을 따른다. 막힌 길은 피하고 막힌 곳에는 차를 놓지 않아 PC 5,000대에서도 흐름이 유지된다(설계 문서 13·14절). 횡단보도·차선·정지선과 차로 수·차로 폭은 서울시 교통안전시설물 자료(`python3 mapo/tools/seoul.py` 로 받아 `pnpm bake`)를 따르고, 신호는 보행 신호 횡단보도가 있는 교차로·길 중간에 두며, 사람은 큰길을 횡단보도로만 건넌다(18절). 찻길 가장자리와 모퉁이 반지름은 같은 차선 자료의 연석 쪽 가장자리선으로 읽고(골목은 행정안전부 실폭도로 면 경계로 한 번 더 맞춘다), 그 바깥 도시생태현황도 도로 부지를 보도로 그린다(23절, 국가 공간정보 SHP 는 `python3 mapo/tools/public.py`). 국토지리정보원 정밀도로지도 측량 연석·노면선(신청 자료라 커밋 안 함 `mapo/tools/raw/ngii/hd-lines.json`, 없으면 측량 없이 굽는다)이 있으면 서울시 선을 측량 자리로 옮기고 찻길 면 가장자리·회전교차로를 측량에 맞춘다(`mapo/tools/road/hdcurbs.ts`, 63절). 찻길 가장자리는 서울시 칠한 선이 모두 들어오게 넓히고 노면 표시는 그린 찻길 면 안으로 자르며, 연석 선은 찻길 면 경계로 구운 `mapo/public/data/curbs.json`, 화살표는 칠한 선 사이 칸 가운데에 둔다(44절). 찻길 면은 지금 찻길 띠·교차로 면에 길 정본 차로 띠·교차로 경로·마주 오는 찻길 사이 틈을 한 0.25m 격자에 칠해 외곽선 하나로 굽고(`mapo/tools/road/surface.ts`, `node tools/surface.ts`, `surface.json` v2 칸 층 g·w·m), 연석은 그 외곽선, 보도 면은 찻길 밑까지 깐 한 면, 로드뷰 포장은 1m 틈을 메운 구역(`mapo/src/data/paving.ts`)으로 그리며, 9판 0 시험 판에서 까닭 없이 선 차·찻길 면 밖·빗금 위 차를 상한으로 센다(58절·59.8절). 건물 층수·용도는 건축물대장 표제부(OSM 도로명주소로 연결)·국토교통부 GIS건물통합정보·수치지도 건물 점(`python3 mapo/tools/buildings.py`)으로 정하고, OSM·Overture 에 없는 건물은 GIS건물통합정보 외곽선으로 세운다(브이월드 로그인 뒤 받은 서울 SHP 를 `mapo/tools/raw/public/` 에 두고 `python3 mapo/tools/public.py`). 건물 덩어리는 렌더러가 유형별로 나누고(빌라 북쪽 사선·필로티, 상가주택, 업무 빌딩 저층부, 박공 단독주택, 27절), 가게 유리·간판·업종별 소등은 소상공인 상가(상권)정보(`python3 mapo/tools/shops.py`, 층 정보 포함)로 가게가 붙은 건물의 실제 층에만 그린다(29절). 지하철 출구는 서울교통공사 캐노피 자료(OA-22449)와 로드뷰로 정한 7가지 모양으로 그리고, 출구 지붕이 작은 건물로 들어 있는 26곳은 그 외곽선으로 자리·방향·길이를 맞춘 뒤 그 건물을 지운다(`mapo/src/data/exits.ts`·`exitFit.ts`, 30절). 횡단보도는 서울시 면 모양 그대로 그리고(2026 자료에 없는 2021 면은 뺀다), 사람은 횡단보도를 우측통행으로 건너며 기다릴 때는 빈자리에, 신호 대기 줄 뒤에서는 0.75m 띄워 서고, 몸 방향은 초당 7라디안까지만 돈다(20절). 갈림이 없는 통과 노드는 교차로가 아니고, 차는 차로 수가 바뀌어도 차로마다 고르게 퍼지며, 신호는 큰길 중요도 순 나무로 초록불 물결(11m/s)을 이룬다. 중앙버스차로 구간에서는 버스가 가운데 차로로 달려 서울시 정류소 자료의 중앙차로 정류장(`python3 mapo/tools/medstops.py` → `src/data/medStops.ts`) 승강장에 서고, 사람은 승강장 끝 횡단보도로 건너 승강장에서 줄을 서 타고 내린다(19·21절). 차는 ACC 식으로 따라가고 꺾인 길 꼭짓점 앞뒤 1.5m 로 방향을 구해 급제동·튐이 적고, 승용차는 옆모습을 따라 둥근 단면을 이어 붙인 모양이다(24절). 실시간 도시데이터(인구·도로 속도·비·눈·미세먼지·사고통제·문화행사, 중계 함수 `mapo/supabase/functions/mapo-citydata`, TOPIS 돌발정보도 같은 함수가 받음)와 실시간 지하철(열차 위치·역 도착 정보, `mapo-subway`, 둘 다 `deno test`)을 받아 `mapo/src/data/live.ts`·`subway.ts` 가 덧씌우고, 15분(도시데이터)·6분(지하철) 넘게 끊기면 시뮬레이션으로 돌아간다. 돌발은 속도를 낮추지 않고 차로를 막거나 구간을 통제하며(`src/sim/incidents.ts`), 도로 위 점멸등·라바콘으로만 보인다(16·17·22·28절). 1·2단계(지도) 승인 전까지 기본 주소는 빈 지도이고 차는 `?cars=1`, 사람은 `?people=1` 일 때만 돈다(59.11절)). `notes/` 는 빌드 없는 정적 안내 페이지(`notes/<이름>/index.html` 한 파일 → `/apps/notes/<이름>/`, 배포 워크플로가 그대로 복사. 공개 저장소이므로 실명·카드번호·개인 기록은 넣지 않는다). `dongne/` 는 동네(가제, 켜 두고 보는 서울 동네 키워드 지도, 설계는 `dongne/docs/design.md`. 지금은 측정 단계로 화면 없음: `node probe/measure.mjs`, 키는 `~/.config/dongne/.env`, 동네 목록은 `node probe/gazetteer.mjs` 가 행정동 경계를 `dongne/data-raw/`(커밋 안 함)에 받아 만든다). `readingtime/` 는 iOS 네이티브 준비 중이며, 웹 프로토타입(`prototype/`)이 픽셀 정본, 시안은 `design-ref/v3`(v8 최종). 기록 화면(원페이지: 월 히트맵·책·지도)은 별도 정본 `design-ref/design_handoff_record_onepage/` + 픽셀 오라클 `.oracle/`(`scripts/record-verify.sh` 로 대조), 탭 모드(05)도 별도 정본 `design-ref/design_handoff_tap_mode/`(시안 J).
- **`gym/` 은 iOS 네이티브 앱** (2026-07-07 전환, `ea98b97`). **실기기에 설치된 건 네이티브**(`Gym.xcodeproj` + `GymKit/Sources/{GymCore,GymViews}`, SwiftUI). 같은 폴더의 PWA(`src/`+`mocks/`)는 잔존이며 Pages 배포는 계속되지만 폰엔 없다. **화면·디자인 작업을 PWA 에만 하면 실기기엔 변화가 0** (2026-07-17 실사고: 웹만 고치고 "실기기 반영됨" 오단정). 상세·검증도구는 `~/apps/gym/CLAUDE.md`.
- 앱별 스펙: `~/apps/<app>/specs/<app>-app-spec.md` (현재 best/gym/pick/study)
- `~/apps/lessons/`: 환경 함정 (lazy load, 인용 시 직접 Read)
- `~/apps/scripts/`: `claude-wip-snapshot.sh` (Stop hook 자동 호출), `heavy.sh` (여러 세션이 무거운 측정·굽기·전체 테스트를 한 번에 하나만 돌리게 하는 잠금: `heavy.sh <제한 초> <명령>`)
- 커밋: Conventional Commits. 마일스톤은 `git tag`.
- **자동 commit + push**: Claude 가 본 세션 작업을 (1) 수정·추가 (2) 검증 통과 (3) 사용자 계획 범위 내 완료 시, **본 세션이 직접 편집·추가한 파일만 골라** Conventional Commits 로 commit + `git push origin main` 자동 실행. 사용자 별도 지시 불필요. WIP 에 다른 세션 잔존이 섞여 있으면 `git reset --soft` + `git restore --staged <무관>` 로 본 세션 파일만 분리 (무관 파일은 working tree 에 남겨 다음 세션 처리). 예외: DB 마이그·secret·force push·`reset --hard` 등 destructive 는 사전 확인. push 충돌·hook fail 시 자율 재시도 금지. 즉시 사용자 보고. 롤백은 `git revert` + push.

---

## 기록 위치 (CLAUDE.md 누적 금지)

- 절차 (5+ 단계) → `~/.claude/skills/<name>/SKILL.md`
- 환경 함정 → `~/apps/lessons/<topic>.md` (`@import` 금지, 텍스트 경로 인용만)
- 앱 spec → `~/apps/<app>/specs/<app>-app-spec.md`
- 세션 간 연속성 → auto memory (`~/.claude/projects/<project>/memory/`). handoff 디렉터리 운영은 2026-08-30 폐기 (기존 파일은 `**/handoff/` gitignore 로 남겨 둠, 신규 작성 금지).

---

## 자격증명·Secret

**`leftjap/apps` 는 PUBLIC repo.** 2026-06-10 에 가계부 스크린샷이 공개된 사고가 있었다. 스크린샷·스크랩 데이터·개인 기록은 커밋하지 않는다 (`**/handoff/`, `best/fixtures/`, `best/data/` 는 .gitignore 로 봉인됨).

하드코딩 금지 (환경변수 또는 config 사용). 단 Supabase anon key 는 `VITE_` prefix 환경변수로 클라이언트 번들 포함 허용. RLS 로 격리, anon key 자체는 공개 가능. service role key 는 절대 번들 금지.

**로컬 저장 위치 (자동 로드, 매 세션 키 재요구 금지)**:
- `~/.config/study/.env` (chmod 600): `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. study 로컬 자동화·sanity check 실행 시 `source ~/.config/study/.env` 또는 dotenv 로드
- `~/.config/best/.env` (chmod 600): best 전용 Supabase 프로젝트 자격증명. best 수집 파이프라인이 사용
- repo secret (`leftjap/apps`): GitHub Actions 워크플로용. `gh secret list --repo leftjap/apps` 로 확인 (`SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)

---

## 환경 함정

- **테스트 실행**: 2026-08-30 부로 6개 PWA 의 `test` 스크립트를 `vitest run` 으로 바꾸고 watch 는 `test:watch` 로 분리했으므로 `pnpm test` 는 안전합니다. 다만 `run` 없이 `pnpm vitest` 로 직접 부르면 여전히 watch 에 걸려 Bash 가 멈추므로, PreToolUse hook 이 그 경우만 차단합니다.
- **앱 미리보기 도구 금지**: `preview_start`·`mcp__Claude_Browser__*` 는 권한 묻지 않는 모드에서도 지오에게 승인 창을 띄워 세션을 멈춘다(2026-11-17 마포 하위 세션 사고, 지오 「앞으로는 허용 승인 물으면 절대 안 됨」). 지금은 `~/.claude/settings.json` 의 `permissions.deny` 로 막혀 도구 목록에 없다. 화면 확인은 디버그 크롬(`~/.claude/scripts/chrome-debug.sh`, 9333, chrome-devtools MCP `new_page` 에 `background: true`)으로 빌드 결과나 배포본을 연다. 하위 작업 지시문에도 이 줄을 넣는다.
- **PWA 배포 전 확인**: `pnpm test` → `pnpm build` → `pnpm preview` 순. manifest·서비스워커·오프라인은 dev 모드에서 꺼져 있어 `preview` 단계에서만 확인된다. 홈 화면 추가와 standalone 동작은 자동화가 불가능하므로 iPhone Safari 실기기로 직접 본다.
- **pnpm 10 onlyBuiltDependencies**: 누락 시 esbuild postinstall 차단. PWA 앱(study/gym/today/book/pick/cue/best) `["esbuild"]`.
