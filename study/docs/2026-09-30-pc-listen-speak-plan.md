# 연속 듣기 · 말하기 연습 PC 배치 구현 계획 (2026-09-30)

> 실행 방식: 이 세션에서 인라인 실행(test-first → 구현 → 화면 대조 루프). 체크박스로 진행을 표시한다.

**Goal:** `#/listen`·`#/speak` 를 폭 1024px 이상에서 시안(`design-ref/design_handoff_pc_listen_speak/`) 배치로 바꾸고, 1023px 이하는 현행을 유지한다.

**Architecture:** 두 화면 모두 DOM 하나에 `@media (min-width:1024px)` CSS 만 더한다. PC 배치에 필요한 묶음 요소(제목 줄·그리드·카드)는 새로 두되, 1023px 이하에서는 `display:contents` 로 상자를 없애 자식들이 현행처럼 `.li-wrap`/`.sp-wrap` 의 flex 항목으로 흐르게 한다. PC 전용 요소(라벨·진행 막대·세션 목록 등)는 1023px 이하에서 `display:none`.

**Tech Stack:** vanilla DOM(`h()`), 페이지 CSS 문자열 + `V_VARS`, vitest(jsdom), Playwright Chromium(화면 대조).

**Spec:** `study/design-ref/design_handoff_pc_listen_speak/README.md` + `mockups/*.dc.html`(수치 정본)

## Global Constraints
- 서비스(`listenAudio.js`·`speakPicks.js`·`voicePrompt.js`), 라우트, 홈 CTA, 기존 문구는 고치지 않는다.
- 1023px 이하 변화는 두 가지뿐: 듣기 목록을 합성 전에 그림(줄 disabled), 듣기 실패 문구·`다시 시도` 를 재생 카드 안(상태 문구 아래)으로.
- `listen.test.js`·`speak.test.js` 는 수정 없이 통과.
- 새 토큰·새 폰트 없음. 색은 `V_VARS` 변수, 그 밖의 값은 목업 인라인 스타일 그대로.
- data-role: `session-list`, `session-row`(+`data-key`), `session-copy`. `copy` 는 큰 복사 버튼 전용.

## 결정 (작업지시서가 비워 둔 곳)
- 상단 바 `홈으로` 버튼: 목업은 `padding:0;height:44px` 이지만 작업지시서가 "내용은 현행 그대로" 라고 했고 stats·sentences PC 화면도 같은 현행 스타일이라 유지한다(목업 대비 6px 이동은 의도한 차이).
- 듣기 만드는 중: `– / N` 을 보이고 시간 글자는 비운다(`seconds` 를 모르므로 `0:00 / 0:00` 을 쓰지 않는다).
- 세션 줄 `복사` 의 클립보드 실패 폴백: 현행 버튼은 화면의 textarea 를 선택해 복사하는데, 다른 세션 줄에 그대로 쓰면 고른 세션 프롬프트가 복사된다. 그 줄의 문구를 담은 임시 textarea 로 `execCommand('copy')` 한다.
- `aria-current="true"` 는 목업처럼 세션 고르기 버튼에 단다. 줄 컨테이너에는 `data-role="session-row"`·`data-key`·`.on`.
- 라벨 글꼴은 목업 화면별 값 그대로: 듣기 `Outfit,sans-serif`, 말하기 `Outfit,Pretendard,sans-serif`.

## Files
- Modify: `src/pages/listen.js` (DOM 묶음·재생 카드 새 요소·목록 먼저 그리기·CSS)
- Modify: `src/pages/speak.js` (DOM 묶음·세션 목록·범위 설명·카드 머리·프롬프트 머리·CSS)
- Test: `src/pages/listen.test.js`, `src/pages/speak.test.js` (기존 테스트는 그대로, 새 describe 추가)
- Create: `design-ref/design_handoff_pc_listen_speak/` (시안 폴더 그대로)
- Modify: `CLAUDE.md`(study) 스펙·문서 목록에 시안 경로 한 줄

## Task 1: 듣기 — 새 동작 테스트(red) → 구현(green)
- [x] 테스트 추가: ① 합성 전 목록이 그려지고 줄이 disabled, 합성 뒤 enabled ② `timeupdate` 로 `n / N`·시간·지금 나오는 문장이 바뀐다(처음 `– / N`, `재생을 누르면 첫 문장부터`) ③ 합성 실패 시 `다시 시도` 가 `.li-rail` 안, 상태 문구 뒤 ④ 라벨은 언어를 따른다(ja → `한글 뒤 일본어 · 무한 반복`) ⑤ `다시 만들기` 는 재생 카드 맨 끝.
- [x] 실행해 실패 확인: `pnpm exec vitest run src/pages/listen.test.js`
- [x] 구현: `.li-head`(h1+sub) / `.li-main`(grid) > `.li-rail`(라벨·재생·상태·진행·구분선·지금 문장·다시 만들기) + `.li-card` > `.li-list`. 빈 문구는 `.li-main` 안.
- [x] 통과 확인(새 테스트 + 기존 12개).

## Task 2: 말하기 — 새 동작 테스트(red) → 구현(green)
- [x] 테스트 추가: ① 세션 줄 클릭 → select 값·표현·textarea 가 그 세션으로, 선택 표시(`.on`·`aria-current`) 이동 ② 다른 세션 줄 `복사` → 그 세션 전체 프롬프트, 선택은 그대로, 버튼 `복사됨` ③ 고른 세션 줄 `복사` → textarea 값(체크 해제 반영) ④ 체크 0개 → `[data-role="copy"]` disabled, 설명 `표현을 하나 이상 고르세요` ⑤ 표현과 문장이 같은 카드는 `.se` 없음 ⑥ 카드 머리(라벨·제목·상황)·프롬프트 설명·범위 설명 문구 ⑦ 범위를 오가도 세션 목록 선택 유지, 다른 범위에서는 목록 hidden.
- [x] 실패 확인 → 구현 → 통과 확인(새 테스트 + 기존 8개).

## Task 3: 화면 대조 루프 (Playwright Chromium)
- 기준선: 수정 전 화면을 390·1023·1024·1440 폭 × 상태 14종으로 캡처(완료, 스크래치패드 `verify/before`).
- 오라클: 목업을 같은 Chromium 으로 1440·1024 렌더(완료, `verify/mock`).
- 루프: 캡처 → (a) 1023·390 은 수정 전과 픽셀·좌표 비교(예외 두 가지 외 차이 0) (b) 1024·1440 은 목업과 텍스트 요소 좌표·글자 크기·색·카드 상자를 수치로 비교하고 픽셀 차이 영역을 눈으로 확인 → 차이를 고치고 다시 캡처. 설명되는 차이만 남을 때까지 반복.
- 기능 확인(실제 재생 포함): 듣기 재생/일시정지·줄 눌러 이동·진행 막대 이동·sticky(긴 목록)·다시 만들기·실패 후 다시 시도·빈 상태, 말하기 탭 전환·세션 줄 선택·줄 복사·큰 복사·체크 해제·빈 상태·데모(`?demo=1`) 두 페이지.

### 결과 (2026-09-30)
- vitest: listen 18(새 6)·speak 19(새 11) 통과, 전체 85파일 1,846개 통과. `pnpm build` 통과.
- 1023·390: 14개 상태 모두 수정 전과 픽셀 차이 0(같은 환경에서 옛 코드와 비교). 예외 두 상태(만드는 중·실패)만 의도대로 달라짐.
- 1024·1440: 상단 바 box-sizing 1px 을 보정하면 텍스트 요소 위치 0.6px 이내, 글자 크기·굵기·색·글꼴·줄 높이와 카드 상자(위치·크기·반경·패딩·배경·그림자)가 목업과 같다. 남은 차이는 결정 항목(`홈으로` 6px, 상단 바 60px, 말하기 상단 `영어` 1px(현행 줄 높이), 재생 카드 sticky)뿐. 프롬프트 본문은 목업과 글자 단위로 같다.
- 실제 SPA 경로(`#/listen`·`#/speak`)와 운영 빌드(`dist`)가 목업 페이지 캡처와 픽셀 단위로 같다.
- 기능 전수(실제 Chromium, 무음 WAV 실제 재생): 듣기 61개·말하기 59개 확인 통과.

## Task 4: 마무리
- [x] `pnpm test` 전체, `pnpm build`.
- [x] 시안 폴더 복사, study `CLAUDE.md` 한 줄.
- [x] 이 세션이 만든 파일만 커밋·푸시(WIP 스냅샷 확인).
