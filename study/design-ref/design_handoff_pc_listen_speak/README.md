# Handoff: 스터디앱 · 연속 듣기 · 말하기 연습 PC 화면 (2026-09-29)

## Overview
`#/listen`(연속 듣기)과 `#/speak`(말하기 연습)는 지금 모바일 한 줄 배치(최대 폭 560px)만 있다. 폭 1024px 이상에서 PC 배치로 바꾼다. 1023px 이하는 현행 그대로 둔다(예외 두 가지는 §1-2·§1-3에 적었다).

- 대상: `leftjap/apps@main` `study/` — `src/pages/listen.js`, `src/pages/speak.js` 두 파일의 DOM 구성과 `CSS` 문자열. 서비스(`listenAudio.js`·`speakPicks.js`·`voicePrompt.js`)는 고치지 않는다.
- 1024 기준은 앱의 desktop 판정과 같다(`src/components/session/SessionLayout.js` `pickSize()` — `w >= 1024`). 구현은 같은 DOM + `@media (min-width:1024px)` CSS 로 한다. 리사이즈 때 다시 마운트할 필요는 없다.
- 새 토큰·새 폰트는 없다. 색은 `V_VARS`(`src/components/v2/atoms.js`)를 쓰고, 나머지 수치는 이미 있는 PC 화면(`stats.js` `.vt2-*`, `sentences.js` `.vl-*`, `homeDesktopV2.js` `.vh-*`)의 값만 쓴다.
- 정본: 이 문서 + `mockups/Listen.dc.html` · `mockups/Speak.dc.html`. 수치는 목업 인라인 스타일이 정본이다.
- 이 폴더는 `study/design-ref/design_handoff_pc_listen_speak/` 에 둔다(`readingtime/design-ref/` 관례).

## About the Design Files
`mockups/*.dc.html` 은 **HTML로 만든 디자인 레퍼런스(동작 프로토타입)** 이다. 프로덕션 코드가 아니며 그대로 옮기지 않는다. 같은 폴더의 `support.js` 와 함께 브라우저에서 열린다. React·Babel 은 unpkg 에서, Pretendard 는 앱과 같은 jsdelivr 주소에서 받는다. `support.js` 는 `readingtime/design-ref/design_handoff_tap_mode/mockups/support.js` 와 같은 파일이다.

- `Listen.dc.html`: 줄을 누르면 그 줄로 이동하며 재생, 재생 버튼으로 재생↔일시정지, `다시 만들기` 로 준비 상태. 재생 위치 `0:34 / 1:02` 는 목업용 값이다(실앱은 오디오 값).
- `Speak.dc.html`: 탭 전환, 세션 고르기, 체크를 풀면 프롬프트가 바로 바뀜, 줄마다 `복사`, 큰 `프롬프트 복사`(1.5초 `복사됨`). 프롬프트는 `voicePrompt.js` 의 `buildVoicePrompt` 를 그대로 옮겨 돌린 결과다.
- 목업 데이터: `seeds/en-personal-2026-09-20.json` · `-09-21.json` 의 카드 8장. 사용자 스크린샷의 연속 듣기 목록 8문장과 같은 문장이다.
  - `9월 25일` 세션은 사용자 스크린샷의 말하기 연습 세션 선택 상자에서 확인한 값이다.
  - `9월 20일` 세션은 시드 파일 날짜로 넣은 예시다. 실제 세션 목록에 이 세션이 따로 있는지, 날짜가 무엇인지는 확인하지 못했다. 실앱은 `sessionLogs` 의 `date` 를 쓴다.
  - "최근 어려웠던 표현" 탭은 빈 상태를 보여 주려고 비워 뒀다.
- `screens/*.png`: 목업을 1440 폭으로 렌더한 것이다. 개인 기록이 아니라 이미 커밋된 시드와 같은 문장만 담겨 있다. (`readingtime/design-ref/design_handoff_home_record/home-14a-v11@2x.png` 처럼 시안 PNG 가 커밋된 예가 있다.)

| 파일 | 상태 |
|---|---|
| `screens/01-listen-playing.png` | 듣기 · 재생 중 (5번째 문장) |
| `screens/02-listen-ready.png` | 듣기 · 준비 완료(재생 전) |
| `screens/03-speak-session.png` | 말하기 · 세션 탭 기본 |
| `screens/04-speak-uncheck-and-row-copy.png` | 말하기 · 표현 하나 체크 해제 + 9월 20일 줄 `복사됨` |
| `screens/05-speak-random.png` | 말하기 · 랜덤 복습 탭 |
| `screens/06-speak-hard-empty.png` | 말하기 · 어려웠던 표현 탭 빈 상태 |

## Fidelity
High-fidelity. 색·글자·간격·상태가 최종값이다. 목업의 색은 `V_VARS` 값을 그대로 적었으니 코드에서는 변수명을 쓴다.

| 목업 값 | 코드 |
|---|---|
| `oklch(44% .062 192)` | `var(--teal)` |
| `oklch(35% .058 192)` | `var(--teal-deep)` |
| `oklch(44% .062 192 / .08)` | `var(--teal-soft)` |
| `oklch(58% .115 32)` | `var(--coral)` |
| `oklch(97.5% .009 95)` | `var(--bg)` |
| `#fffefb` `#e7e3d6` `#25322f` `#6f7a75` `#9da69f` | `--card` `--line` `--ink` `--mut` `--faint` |
| `#efebde` | stats `.vt2-tabs` 바탕 |
| `#f8f6ee` | sentences `.vl-hbox` · home `.vh-cta.sec:hover` |
| `#f1ede0` | sentences `.vl-row` 구분선 |
| `#ece8da` | `.v-bar` 트랙 |

1024 폭 확인: 목업의 바깥 폭을 1024로 줄여 렌더해 두 화면 모두 넘치거나 겹치는 곳이 없음을 확인했다(목업에서만 확인, 실앱은 아래 "화면 확인"에서).

---

## 공통 PC 프레임 (두 화면 같음)
- 상단 바: 높이 60, 아래 1px `--line`(현행 `.li-top`/`.sp-top`). 안쪽 `max-width` 를 560 → 1064 로(stats `.vt2-top-in` 과 같은 값), padding `0 20px`. 내용(홈으로·언어)은 현행 그대로.
- 본문: `max-width:1064px; margin:0 auto; padding:26px 20px 56px` (sentences `.vl-wrap`).
- 제목: 현행 `.li-h1`/`.sp-h1` 그대로(Outfit 26/700, -0.02em). PC 는 왼쪽 정렬.
- 카드: 바탕 `--card`, 1px `--line`, 반경 20(듣기 재생 카드만 22), 그림자 `0 1px 0 rgba(25,35,32,.02), 0 10px 22px -18px rgba(25,35,32,.12)` (`.vh-card`).
- 작은 라벨: Outfit 10.5/600, letter-spacing .16em, uppercase, `--faint` (`.vh-lab`).

---

## 1. 연속 듣기 `#/listen` — `mockups/Listen.dc.html`

### 1-1. 배치
- 제목 줄(새 묶음): `연속 듣기` + 옆에 현행 부제 `sub`(만들기 전 `영어 8문장`, 만든 뒤 `listenTitle()` 결과), 14px `--mut`, baseline 정렬, gap 14. 모바일은 현행처럼 가운데로 세로 배치.
- 본문: `display:grid; grid-template-columns:minmax(0,1fr) 356px; gap:26px; align-items:start`. 왼쪽 = 문장 목록 카드, 오른쪽 = 재생 카드.
- **DOM 순서**: `listen.test.js` 가 재생 버튼이 목록보다 DOM 앞에 있는지 본다(`DOCUMENT_POSITION_FOLLOWING`). 재생 카드를 DOM 앞에 두고 `grid-template-areas:"list rail"` 로 목록을 왼쪽에 놓는다.
- 재생 카드·목록 카드 모두 지금의 `body`(`.li-wrap`) 안에 둔다. `build()` 첫 줄의 정리 코드 `body.querySelectorAll('.li-err, .li-retry, .li-rebuild, .li-empty')` 가 그대로 찾을 수 있어야 한다.

### 1-2. 문장 목록 카드 (왼쪽)
- 카드 padding `8px 16px`, 줄 사이 2.
- 줄(`.li-row`, `<button>` 유지): `grid-template-columns:28px minmax(0,1fr) minmax(0,1.15fr); gap:0 18px; align-items:baseline; padding:13px 14px; border-radius:12px`.
  - 번호: Outfit 12/700, `--faint`, 오른쪽 정렬, tabular-nums.
  - 한글: 현행 `koText`(괄호 힌트 남김), 14px, line-height 1.4, `--mut`.
  - 영어: 16/700, line-height 1.35, `--ink`.
- 현재 줄 `.cur`: 바탕 `--teal-soft`, 번호·영어 `--teal-deep`, 한글 `--ink`.
- hover(현재 줄·disabled 제외): 바탕 `#f8f6ee`. disabled 줄은 `cursor:default`.
- 스크롤: 현행 `scrollIntoView({ block:'center', behavior:'smooth' })` 유지.
- **목록을 소리 만들기 전에 그린다**: 지금은 합성이 끝난 뒤 `renderScript()` 를 부른다. PC 에서는 그동안 왼쪽이 비므로, `buildListenPairs()` 직후 목록을 먼저 그리고 줄을 `disabled` 로 둔 뒤, 합성이 끝나면(성공 시) 풀어 준다. 실패하면 disabled 로 둔다. 모바일도 같은 코드 경로를 쓴다 — 목록이 먼저 보이는 것이 모바일의 유일한 변화다.

### 1-3. 재생 카드 (오른쪽)
- 카드 padding `22px 28px 26px`, 반경 22, 세로 flex 가운데 정렬, gap 14. `position:sticky; top:24px`(문장이 많으면 목록만 스크롤되고 재생 카드는 따라온다).
- 위에서 아래로:
  1. 라벨(새) `한글 뒤 영어 · 무한 반복`, 왼쪽 정렬, `.vh-lab`. 일본어면 `한글 뒤 일본어 · 무한 반복`(`langLabel(lang)`). 홈 CTA 보조줄 앞부분과 같은 말이다.
  2. 재생 버튼: 현행 `.li-play` 그대로(120 원, 재생 `--teal` / 재생 중 `--coral`, 아이콘 44, `data-role="play"`). PC 에서는 위 여백만 18 → 6.
  3. 상태 문구: 현행 `.li-state` 문구 그대로, 13px. PC 에서는 색을 `--faint` → `--mut`(흰 카드 위에서 `--faint` 는 대비가 약함).
  4. **진행 막대(새)**: 높이 6, 반경 999, 트랙 `#ece8da`, 채움 `--teal`, 너비 = `audio.currentTime / seconds`(`seconds` = `buildListenAudio` 결과의 한 바퀴 길이). 기존 `timeupdate` 리스너에서 갱신하되, 지금 리스너는 `starts.length` 가 있을 때만 일하므로 막대 갱신은 그 조건 밖에 둔다. 막대는 `aria-hidden="true"`(아래 글자가 같은 값을 말한다).
     아래 줄: 왼쪽 `5 / 8`(Outfit 13/700 `--mut`, `curIdx + 1` / 문장 수, `curIdx` 가 -1 이면 `– / 8`), 오른쪽 `0:34 / 1:02`(Outfit 12/600 `--faint`, `m:ss`, 초는 버림).
  5. 구분선 1px `--line`.
  6. **지금 나오는 문장(새)**: 라벨 `지금 나오는 문장` · 한글(`koText`) 13px `--mut` · 영어 18/700, line-height 1.4, `--teal-deep`, `text-wrap:pretty`. `curIdx` 가 -1 이면 한글 없이 영어 자리에 `재생을 누르면 첫 문장부터`. 최소 높이 84(문장이 바뀌어도 카드 높이가 흔들리지 않게).
  7. `다시 만들기`: 현행 `.li-rebuild`(`data-role="rebuild"`). 지금은 `body.insertBefore(…, listEl)` 로 목록 앞에 끼우는데, 재생 카드 맨 아래에 넣는다.
- 만드는 중: 상태 문구는 현행 `소리 만드는 중 n/N`(N 은 합성 묶음 수, 문장 수가 아님). 재생 버튼 disabled, 진행 막대는 빈 트랙.
- 실패: 현행 `.li-err` 문구와 `다시 시도`(`data-role="retry"`)를 재생 카드 안, 상태 문구 아래에 넣는다. 지금은 본문 맨 끝에 붙는데, 목록이 먼저 그려지면 모바일에서도 목록 아래로 밀리므로 두 폭 모두 재생 카드 안으로 옮긴다(모바일의 두 번째 변화).
- 문장 없음: 현행 `.li-empty` `아직 들을 문장이 없어요`. PC 에서는 목록 카드 자리에 이 문구 한 줄만 두고 재생 카드는 숨긴다.
- 1023px 이하에서는 새 요소(라벨·진행 막대·지금 나오는 문장)를 숨긴다.

---

## 2. 말하기 연습 `#/speak` — `mockups/Speak.dc.html`

### 2-1. 배치
- 제목 + 현행 설명문(14px, line-height 1.5, `--mut`, `max-width:720px`), gap 10.
- 본문: `grid-template-columns:356px minmax(0,1fr); gap:26px; align-items:start`.
  - 왼쪽: 범위 탭 → 세션 목록(세션 탭) 또는 범위 설명 카드(다른 탭).
  - 오른쪽: 표현 카드 → 프롬프트 카드.

### 2-2. 범위 탭 (현행 `.sp-scope` 3개, PC 에서 모양만 바꿈)
- stats `.vt2-tabs` 모양: 바탕 `#efebde`, 반경 11, padding 4, gap 4. 버튼 높이 36, padding `0 18px`, 13/700, 반경 8, 글자 `--mut`. 선택 = 바탕 `--card`, 글자 `--teal-deep`, 그림자 `0 2px 6px -3px rgba(25,35,32,.22)`.
- `data-scope`, `.on` 클래스, 누를 때의 `load(s, false)` 동작은 그대로(테스트가 본다).

### 2-3. 세션 목록 (새, PC 전용 — 모바일 `<select>` 자리)
- 카드 padding `14px 10px 10px`. 머리 줄: 라벨 `세션` + 오른쪽 개수 `{sessions.length}개`(Outfit 12/600 `--faint`), padding `0 10px 8px`.
- 줄: `display:flex; align-items:flex-start; gap:8px; padding:4px 8px 4px 4px; border-radius:14px`. 선택된 줄 바탕 `--teal-soft`, `aria-current="true"`. 나머지 줄 hover 바탕 `#f8f6ee`.
  - 왼쪽 `<button>`(세션 고르기): padding `9px 10px`, 세로 gap 4.
    - 윗줄 `9월 25일 · 표현 4개` — 12/600, 선택 `--teal-deep` / 나머지 `--faint`. 날짜는 현행 `sessionLabel()` 과 같은 식(`Number(m)월 Number(d)일`). 개수는 `s.items.length` 로, `listSessions()` 가 `SPEAK_MAX`(5)에서 자른 뒤의 수다.
    - 아랫줄 첫 문장(`s.items[0].sentence || s.items[0].expr`, 현행 `sessionLabel()` 과 같음) — 14.5/700, line-height 1.4, 두 줄까지(`-webkit-line-clamp:2`). 선택 `--teal-deep` / 나머지 `--ink`.
  - 오른쪽 `복사` 버튼: 높이 32, `min-width:58px`, padding `0 12px`, 12.5/700, 반경 999, 테두리 1.5, `margin-top:9px`. 선택 줄 = 테두리 `--teal`, 글자 `--teal-deep` / 나머지 = 테두리 `--line`, 글자 `--mut`. 누르면 1.5초 `복사됨`. `aria-label="9월 25일 세션 프롬프트 복사"`.
- **복사 내용**: 그 줄이 지금 고른 세션이고 범위가 세션이면 textarea 값 그대로(체크 해제 반영). 다른 세션이면 그 세션 표현 전부로 `buildVoicePrompt(s.items)`(이미 import 돼 있음). 복사해도 선택은 바뀌지 않는다. 클립보드 실패 시 폴백은 현행 복사 버튼과 같게.
- 목록은 자르지 않는다(세션이 늘면 페이지가 길어진다).
- **현행 `<select data-role="session">` 은 지우지 않는다.** 모바일에서 그대로 쓰고 PC 에서만 CSS 로 숨긴다. 선택 상태의 원본은 `sessSel.value` 하나다.
  - 줄 클릭 = `sessSel.value = key` 후 `change` 이벤트를 발생시켜 기존 경로로 처리하고, 목록의 선택 표시도 다시 칠한다.
  - 목록은 `load()` 안에서 `<option>` 을 다시 만드는 자리에서 같이 다시 그린다(범위를 오갔다 돌아올 때 선택 유지 — 현행 테스트 "다른 범위를 봤다가 세션으로 돌아오면" 과 같은 동작).
  - 목록을 보일지 여부는 select 의 `hidden` 규칙(`s !== 'session' || !sessions.length`)을 그대로 따른다.
  - 이렇게 하면 `speak.test.js` 는 수정 없이 통과한다.
- data-role: 목록 `session-list`, 줄 `session-row`(+`data-key`), 줄 복사 `session-copy`. (`copy` 는 큰 복사 버튼 전용 — 겹치면 `querySelector('[data-role="copy"]')` 를 쓰는 기존 테스트가 줄 버튼을 잡을 수 있다.)

### 2-4. 범위 설명 카드 (어려웠던 표현·랜덤 복습 탭일 때 세션 목록 자리)
- 카드 padding `18px 20px`, 13px, line-height 1.6, `--mut`.
- 어려웠던 표현: `최근 14일 안에 어려움으로 판정했거나 마지막 판정이 어려움인 표현을, 최근 순으로 최대 5개 모읍니다.` — `pickHard()` 규칙 그대로다(14일 안의 `resultHistory` X, 또는 날짜와 관계없이 `lastResult === 'X'`). 14·5 는 `HARD_WINDOW_DAYS`·`SPEAK_MAX` 로 조립한다.
- 랜덤 복습: `복습 카드에서 무작위로 최대 5개를 뽑습니다. 탭을 다시 누르면 새로 뽑습니다.` — 현행도 탭을 누를 때마다 `load('random')` 이 다시 뽑는다.

### 2-5. 표현 카드 (오른쪽 위)
- 카드 padding `22px 26px 24px`, gap 14.
- 머리(PC 전용):
  - 라벨: 세션 탭이면 `고른 세션`, 다른 탭이면 탭 이름.
  - 제목: Outfit·Pretendard 20/700, -0.02em. 세션 탭 `9월 25일 · 표현 4개`, 다른 탭 `표현 5개`(보이는 표현 수).
  - 상황: 13px, line-height 1.5, `--mut`. 보이는 표현들의 `situation` 을 빈 값·중복을 빼고 공백으로 이은 것. `voicePrompt.js` 의 `background()` 와 같은 규칙인데 그 함수는 export 되어 있지 않으므로 `speak.js` 에 한 줄로 둔다.
- 표현 목록: `grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px`. 항목은 현행 `<label class="sp-item" data-role="item">` 유지.
  - padding `12px 14px`, 반경 12, 바탕 `#f8f6ee`, 테두리 1px `#f1ede0`. 체크박스 18(accent `--teal`).
  - 오른쪽 세 줄:
    - 표현 `.ex`: 16/700, line-height 1.35, `--ink`.
    - 문장(새, `it.sentence`): 13.5px, line-height 1.4, `--ink`. **표현과 같으면 숨긴다** — `it.expr === it.sentence` 이거나 `it.expr === it.sentence.replace(/[.?!]$/, '')` 일 때(`voicePrompt.js` `patternBlock()` 의 `named` 판정과 같은 규칙). 목업의 `I'm finishing up` 이 이 경우다.
    - 뜻(새, `it.ko`): 12.5px, `--mut`.
  - 현행 `.si`(상황) 줄은 PC 에서 숨긴다. 같은 상황이 항목마다 되풀이되던 것을 머리로 올렸다. `.ex` 클래스는 테스트가 읽으므로 유지한다.
- 순서 안내 띠: 현행 `.sp-steps` 그대로, 카드 안 맨 아래.
- 빈 상태: 제목·목록·띠 없이 현행 빈 문구(`EMPTY_TEXT[scope] · 다른 범위를 골라 보세요`) 한 줄, 15px, line-height 1.5, `--ink`. 프롬프트 카드는 숨긴다(PC 만. 모바일은 현행대로).

### 2-6. 프롬프트 카드 (오른쪽 아래)
- 카드 padding `20px 26px 24px`, gap 14.
- 머리 줄(PC):
  - 왼쪽: 라벨 `프롬프트` + 설명 13px `--mut` `고른 표현 3개로 만든 프롬프트 · ChatGPT 새 대화에 붙여 넣기`(체크 0개면 `표현을 하나 이상 고르세요`).
  - 오른쪽: 현행 복사 버튼 `.sp-copy`(`data-role="copy"`, 문구·동작 그대로). 높이 46, `min-width:132px`, 15/800, 반경 12, 바탕 `--teal`, hover `oklch(39% .06 192)`(home `.vh-cta.pri:hover`). 0개면 disabled(현행과 같음, 흐림 .45).
- 프롬프트 본문: 현행 `<textarea readonly>` 유지(테스트가 `value` 를 읽는다). PC: 높이 420 고정, `resize:none`, padding `14px 16px`, 13px, line-height 1.55, 바탕 `#f8f6ee`, 테두리 1px `--line`, 반경 12.
- 모바일은 현행 순서(textarea 다음 복사 버튼) 그대로. PC 에서만 복사 버튼을 머리 줄로 옮긴다(grid-area 또는 order).

---

## 바꾸지 않는 것
- `listenAudio.js`·`speakPicks.js`·`voicePrompt.js`, 라우트, 홈 CTA, 기존 문구.
- 1023px 이하 화면. 예외는 둘: 듣기 목록을 먼저 그리기(§1-2), 듣기 오류 문구를 재생 카드 안으로(§1-3).

## 새 문구 (전부)
- 듣기: `한글 뒤 영어 · 무한 반복`(일본어면 `일본어`), `지금 나오는 문장`, `재생을 누르면 첫 문장부터`, `n / N`, `m:ss / m:ss`.
- 말하기: `세션`, `{n}개`, `{날짜} · 표현 {n}개`, `복사` / `복사됨`, `고른 세션`, `표현 {n}개`, 범위 설명 두 문장(§2-4), `프롬프트`, `고른 표현 {n}개로 만든 프롬프트 · ChatGPT 새 대화에 붙여 넣기`, `표현을 하나 이상 고르세요`.

## 테스트
- `src/pages/listen.test.js`, `src/pages/speak.test.js` 는 **수정 없이** 통과해야 한다.
- 추가할 것:
  - speak
    - 세션 줄 클릭 → select 값·표현 목록·textarea 가 그 세션으로 바뀐다.
    - 다른 세션 줄 `복사` → 클립보드에 그 세션 전체 프롬프트, 고른 세션은 그대로.
    - 고른 세션 줄 `복사` → textarea 값과 같다(체크 해제 반영).
    - 체크 0개 → `[data-role="copy"]` disabled.
    - 표현과 문장이 같은 카드는 문장 줄이 없다.
  - listen
    - 목록이 합성 전에 그려지고 줄이 disabled, 합성 뒤 enabled.
    - `timeupdate` 로 `n / N` 이 바뀐다.
    - 합성 실패 시 `다시 시도` 가 재생 카드 안에 있다.
- jsdom 은 레이아웃을 계산하지 않으므로 배치는 단위 테스트로 보지 않는다. 화면은 아래 확인으로 본다.
- 실행: `pnpm exec vitest run src/pages/listen.test.js src/pages/speak.test.js`, 전체 `pnpm test`. (`pnpm vitest` 단독은 watch 로 멈춘다.)

## 화면 확인
- `pnpm dev` 뒤 `mocks/listen.html?demo=1&amp=0`, `mocks/speak.html?demo=1` 을 1440×900, 1024, 1023, 390 폭에서 열어 스크린샷을 남긴다. 1024·1440 은 `screens/` 와 비교하고, 1023·390 은 현행과 달라진 게 없는지 본다(§1-2·§1-3 예외 제외).
- 두 데모는 `seeds/en-core100-2026-08-26.json`(카드 6장)을 쓰므로 문장은 목업과 다르다. 배치·상태만 비교한다.
- 듣기 데모는 6문장이라 재생 카드 sticky 와 긴 목록 스크롤이 확인되지 않는다. 확인할 때만 데모에 시드를 여러 개 임시로 합쳐 보고, 그 변경은 커밋하지 않는다.
- 배포 전 `pnpm test` → `pnpm build` → `pnpm preview` (apps `CLAUDE.md`).

## Acceptance Criteria
1. 1024px 이상에서 두 화면이 `screens/01~06` 과 같은 배치·색·글자 크기로 보인다.
2. 1023px 이하 화면은 현행과 같다(§1-2·§1-3 예외).
3. 말하기 PC 에서 세션을 목록에서 고를 수 있고, 줄마다 그 세션 프롬프트를 바로 복사할 수 있다. 고른 세션의 복사는 체크 해제를 반영한다.
4. 듣기 PC 에서 재생 카드가 스크롤을 따라오고, 진행 막대·`n / N`·지금 나오는 문장이 재생 위치를 따른다.
5. 기존 테스트는 수정 없이 통과, 새 테스트 추가, `pnpm build` 통과.

## Files
- `README.md` — 이 문서(작업지시서)
- `mockups/Listen.dc.html` — 연속 듣기 PC 목업(정본)
- `mockups/Speak.dc.html` — 말하기 연습 PC 목업(정본). 하단 `<script data-dc-script>` 에 `buildVoicePrompt` 사본·카드 8장·상태 분기가 있다.
- `mockups/support.js` — 목업 런타임
- `screens/01~06-*.png` — 상태별 렌더(1440 폭)
