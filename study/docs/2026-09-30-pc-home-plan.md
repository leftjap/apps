# 홈 PC 화면(왼쪽 레일 + 본문) 구현 계획 (2026-09-30)

> 실행 방식: 이 세션에서 인라인 실행(test-first → 구현 → 화면 대조 루프). 체크박스로 진행을 표시한다.
> 같은 시각에 다른 세션이 study 를 고치고 있으므로 이 세션은 아래 Files 에 적은 파일만 만지고, 커밋 전에 `git status` 로 내 파일만 골라 담는다.

**Goal:** 홈 PC 화면(`renderHomeDesktopV2`, 폭 1024px 이상)을 시안(`design-ref/design_handoff_pc_home/`)대로 왼쪽 레일 296px(누르는 것) + 본문 최대 920px(보는 것)로 바꾸고, 1023px 이하 모바일은 픽셀 차이 0 으로 유지한다.

**Architecture:** `homeDesktopV2.js` 의 데스크톱 빌더와 `VH_CSS` 를 바꾼다. 모바일 빌더(`renderHomeMobileV2`·`VHM_CSS`)와 공용 계산(캘린더·링·누적·phase)은 유지한다. 기존 `todayRingCard`·`ctaCard` 에 선택적인 desktop 인수를 더해 링·CTA의 값 계산을 공유하고, PC DOM만 분기한다. 모바일 DOM은 바뀌지 않는다.

**Spec:** `design-ref/design_handoff_pc_home/README.md` + `mockups/Home.dc.html`(1440) + `mockups/Home1024.dc.html`(1024, 주 발화 접힘). 수치는 목업 인라인 스타일이 정본.

## Global Constraints
- `home.js`(state 계산·phase·`showSyncRisk`·`watchSize`·데모 픽스처), 라우트, 기존 문구는 고치지 않는다.
- `homeDesktopV2.test.js`·`home.test.js`·`home.dayRollover.test.js`·`home.syncRisk.test.js` 는 수정 없이 통과(새 describe 는 끝에 추가만).
- 새 토큰·새 폰트 없음. 색은 `V_VARS` 변수, 그 밖의 값은 목업 인라인 스타일 그대로.
- 아이콘 `VI.LIST`·`VI.HEADPHONES` 두 개만 `atoms.js` 에 추가.

## 결정 (작업지시서가 비워 둔 곳 · 테스트와 부딪히는 곳)
- `≈ 16분` 을 `&nbsp;` 로 붙이면 기존 테스트의 일반 공백과 달라진다. 글자는 그대로 두고 소요 시간 구절과 `「첫 문장」부터` 를 PC에서만 nowrap span으로 감싼다. 모바일 DOM에는 span을 추가하지 않는다.
- 링 두께 15 는 SVG 속성(11, 모바일 공용)이 아니라 데스크톱 CSS `stroke-width` 로 준다. 확산 펄스 `.pl` 은 172px 기준 `inset:8px`(링 바깥 테두리에서 시작)이므로 76px 에서는 같은 비율인 `inset:2.5px` 로 둔다.
- 1024~1159 접힌 주 발화 줄: 목업은 칸 아래 14px 뒤에 선이 온다. 앱은 `.vh-wkcol` 이 그리드 5행이라 행 간격 8px 이 이미 있으므로 `margin-top:6px` 로 같은 14px 을 만든다.
- 글꼴은 목업 인라인 값을 따른다. 라벨·요일·칸 숫자·누적 값은 `Outfit, Pretendard, sans-serif`, 월 표시는 `Outfit, sans-serif`이다. PC 루트에 목업의 `-webkit-font-smoothing:antialiased`를 적용한다.
- 기록·설정 줄의 hover 는 작업지시서·목업에 없으므로 넣지 않는다.
- `.vh-cum` 은 `vh-card` 클래스를 유지한 채(모바일 테스트가 두 번째 클래스를 읽는다) 데스크톱 CSS 에서 바탕·테두리·그림자를 뺀다.

## Files
- Modify: `src/pages/homeDesktopV2.js` (데스크톱 빌더·`VH_CSS`·CTA 문구/링 공용 함수)
- Modify: `src/components/v2/atoms.js` (`VI.LIST`·`VI.HEADPHONES`)
- Test: `src/pages/homeDesktopV2.test.js` (끝에 새 describe 추가)
- Local only: `design-ref/design_handoff_pc_home/` (개인 기록이 포함된 시안이므로 공개 저장소에 커밋하지 않는다)
- Test: `e2e/home-desktop.spec.js` (preview 빌드에서 동작·반응형 회귀 검사)
- Modify: `CLAUDE.md`(study) 화면 시안 줄, `specs/study-app-spec.md` §7 에 PC 배치 한 단락
- Create: 이 문서

## Task 1: 새 동작 테스트(red) → 구현(green)
- [x] 레일·헤더·기록/설정 경로·nowrap 계약 테스트 6개 추가. 반응형 경계와 과목·phase·CTA 경로는 별도 E2E 6개로 검사한다.
- [x] 테스트 우선 실행: 새 테스트 6개 실패, 기존 46개 통과.
- [x] 구현 후 홈 관련 4파일 88개 통과. 기존 테스트 삭제·수정 없음.

## Task 2: 화면 대조 루프 (Playwright Chromium)
- 기준선: 수정 전 화면을 390·1023 × 상태(시안 데이터·fresh·mid·done·ja·math·초과·누적 3칸) 로 캡처.
- 오라클: 목업 두 개를 같은 Chromium 으로 1440·1024 렌더(텍스트 잎 좌표·글꼴·색 + 스크린샷).
- 루프: 캡처 → (a) 390·1023 은 수정 전과 픽셀 차이 0 (b) 1440·1024 는 목업과 텍스트 잎·카드 상자 수치 비교 + 평평한 영역 색 비교 + 픽셀 차이 영역 확인 → 고치고 다시 캡처. 설명되는 차이만 남을 때까지 반복.
- 그 밖의 폭: 1159/1160(접힘 전환), 1023/1024(모바일↔PC 전환, resize 로 재마운트), 1280·1920(가운데 정렬·넘침 없음).
- 기능(실제 Chromium 에서 누르기): 과목 전환 3개(레일 줄 수·라벨), CTA 5개·기록·설정 이동 해시, hover 색, 동기화 배너가 있을 때 레일·본문이 아래로 밀림, 긴 첫 문장 말줄임, 초과 상태 코랄 링·펄스, SPA `#/` 실제 경로(가짜 DB)에서 `#/listen` 갔다 돌아오기, 데모 `?demo=1` 세 phase.
- 마지막: `pnpm test` → `pnpm build` → `pnpm preview` 에서 `dist` 의 `mocks/home.html?demo=1` 1440 캡처가 개발 서버와 같은지.

### 결과
2026-10-01 Codex에서 재개했다. 시작 HEAD는 `0fec8b62`이고 기존 tracked 변경은 없었다. 다른 세션의 파일은 수정·스테이징하지 않았다.

- `pnpm test`: 85파일 1,861개 통과. `pnpm build`: 성공. `pnpm exec playwright test e2e/home-desktop.spec.js`: Chromium 6개 통과. lint/typecheck 스크립트는 이 프로젝트에 없다.
- 전체 `pnpm exec playwright test`: 12개 통과·12개 실패·10개 skip. 수정 전 HEAD를 `/tmp/study-home-baseline/`에 추출하고 동일 환경으로 빌드해 실행하면 6개 통과·동일한 12개 실패·10개 skip이다. 새 홈 E2E 6개만 통과 수에 추가됐고 신규 실패는 없다. 기존 실패는 auth-guard의 A/B/C(3개), data-display의 홈 DOM/큐/로그/재방문(4개), empty-content의 A/B/C(3개), pwa의 manifest/index meta A/D(2개)이다. 범위 밖 테스트를 지우거나 기대값을 완화하지 않았다. 상세 실패명·대조 결과는 `output/study-pc-home-20261001/e2e-comparison.json`에 보관한다.
- Chromium 모바일: 390·1023px × 8상태(시안 값·fresh·mid·done·일본어·수학·직전 초과·누적 3열), 기존 소스를 route로 주입한 화면과 새 소스를 같은 시점에 비교했다. 16개 모두 PNG 바이트까지 같다.
- PC 목업 대조: 1440×740·1024×760, 동일 Chromium·폰트·데이터에서 캡처했다. 텍스트의 위치/크기(0.6px 허용), 글자 크기·굵기·색 불일치 0개. 평평한 5×5 색 영역의 차이 0픽셀. 애니메이션을 끈 전체 이미지 차이는 1440에서 51픽셀, 1024에서 115픽셀이다. 복습 보조줄을 nowrap span으로 나눈 텍스트 래스터화 차이 39픽셀과 반복 아이콘 stroke-linejoin(round) 차이 12픽셀은 두 폭에 공통이며, 좁은 창은 중첩 grid의 1/64px 반올림으로 막대·점 가장자리 64픽셀이 추가된다. 문구·기록 계산을 바꾸거나 고정 폭으로 이 차이를 숨기지 않았다.
- 애니메이션이 있는 원본 캡처도 확인했다. 정지 프레임에서는 합성 레이어의 알파 반올림 때문에 1/255 색 차이가 생겨, 최종 평면 색 검사는 애니메이션을 끈 동일 조건으로 분리했다. 펄스 DOM·stroke 색과 기존 애니메이션 규칙은 별도로 확인했다.
- preview E2E: CTA 7개 경로, 일본어→수학→영어 전환과 수학 경로, 390/1023/1024/1159/1160/1280/1920 폭 및 역방향 resize, 3개 phase를 검사했다. 레일 296px·본문 최대 920px·가로 넘침 없음·28일/4주 유지 조건을 확인했다.
- 개발 서버/preview의 1440×900 mid 데모: 애니메이션을 첫 렌더 전부터 끄고 폰트·레이아웃을 확인한 최종 캡처는 PNG 바이트까지 같다. 실제 CSS 속성·DOM 좌표 차이도 0개이며, CSS custom property 문자열은 빌드 압축에 따른 따옴표·소수 표기만 다르다. 초기 캡처는 서로 다른 래스터 결과가 나왔으므로 그 파일을 동일하다고 보고하지 않았고, 소스 수정 없이 조건을 통제해 재측정했다.
- Chromium·WebKit: 긴 첫 문장 말줄임과 가로 넘침 없음, 직전 초과 코랄 링·펄스, 비교 기록 없음, 복습 큐 없음·자유 복습 경로, 주요/복습/보조 버튼 hover 색, 전체 폭 동기화 위험 배너와 레일·본문 아래 이동 및 설정 진입을 검사했다.
- 실제 SPA 라우터: 별도 브라우저의 빈 테스트 Dexie DB에서 home → listen 빈 상태 → home 왕복을 확인했다(pageerror 0). 첫 시도는 테스트 harness가 기본 경로(login)를 홈으로 착각해 대기 시간이 초과했고, 실제 라우터의 기본값을 확인한 뒤 명시적인 `#/home`으로 고쳤다. 프로덕션 인증·데이터는 사용하지 않았다.
- 독립 읽기 전용 코드 리뷰: 수정이 필요한 버그 지적 없음. 모바일 분리·언어/phase별 경로·긴 문장·경계 조건을 정본과 대조했다.
- iPhone Safari 실기기, 실제 로그인 계정·마이크/TTS·클라우드 동기화의 종단 검증은 수행하지 않았다. 이번 변경은 홈 배치에 한정된다.
- 검증 스크립트·로그·캡처는 로컬 `output/study-pc-home-20261001/`에 보관하며 공개 저장소에 커밋하지 않는다.

## Task 3: 마무리
- [x] `pnpm test` 전체, `pnpm build`.
- [x] study `CLAUDE.md` 한 줄, 스펙 §7 한 단락.
- 배포 판단: 전체 E2E의 실패 12개는 수정 전 HEAD에서도 같은 항목으로 재현됐고, 이번에 추가한 홈 E2E 6개는 Pages 경로(`/apps/study/`) 빌드에서 통과했다. 개인 기록이 포함된 시안·캡처는 제외하고 구현·테스트·문서 파일만 배포 대상으로 삼는다.
