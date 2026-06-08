# 작업 지시서 — Study 앱 "다이얼로그-우선" 학습 흐름 (Claude Design 인계)

> 작성: Claude Code (로컬 세션) → Claude Design (GitHub만 참조, 로컬 접근 불가).
> **모든 경로는 repo `github.com/leftjap/apps` 기준.** Study 앱 = `study/` 디렉토리.

---

## 0. 환경 / 참조 (GitHub 중심)

- **Repo**: `github.com/leftjap/apps` (모노레포). 작업 대상 = `study/`.
- **배포**: `main` 브랜치 푸시 → `.github/workflows/deploy-pages.yml` (GitHub Pages). 라이브 = `https://leftjap.github.io/study`.
- **데이터**: Supabase `study_today_lessons` 테이블. 카드별 `explanation` 컬럼(JSONB)에 학습 메타가 들어감.
- **시드(콘텐츠 적재)**: `study/scripts/seed-supabase.mjs` (payload JSON → study_today_lessons upsert). 워크플로 `.github/workflows/study-seed-supabase.yml` (수동 dispatch, repo secret `SUPABASE_SERVICE_ROLE_KEY` 사용).
- **user_id**: `study/seeds/.user-defaults.json` (default = leftjap@gmail.com).
- **디자인 정본**: `study/DESIGN.md` + `study/src/styles/tokens.css`. **토큰만 사용. 이모지 금지. 좌측 색보더/파랑·보라 그라디언트 금지.**
- **테스트**: `study/` 에서 `pnpm vitest run` (watch 금지 — 반드시 `run`). 빌드 `pnpm build`.

---

## 1. 목표 (합의된 설계)

RealClass(미드 스크립트) **개인 학습 발췌** 기반. 한 레슨 구조 =

1. **세션 첫 페이지 = 전체 다이얼로그** (8줄 내외, 줄마다 [듣기]) → **[시작하기]**
2. **그다음 문장별 페이지** — 각 핵심 표현마다: 뜻/핵심 + **변주(drills)** = *같은 핵심어를 레벨맞춤으로 바꾼 여러 문장*, **문장마다 [듣기]/[녹음]**
3. **핵심 표현은 색으로 강조** (눈에 띄게)

샘플 콘텐츠 = Parks and Recreation S1E1 "토론회" 장면 (정의: `study/seeds/en-parks-s1e1.json`).

---

## 2. 이미 repo 에 구현됨 (재작업 금지 — 이어서/검증만)

| 파일 | 내용 |
|---|---|
| `study/src/components/session/scenePage.js` | **다이얼로그 페이지** 컴포넌트 `buildScenePage(ex, {onListen,onNext})`. `ex.dialogue:[{speaker,en,ko}]` 렌더 + 줄마다 듣기 + [시작하기]. 테스트 `scenePage.test.js` |
| `study/src/pages/session-new.js` | `render()` 진입부에서 `state.sentence.explanation.dialogue` 감지 시 **scenePage 분기** → host 에 마운트하고 early return |
| `study/src/components/session/explanationPanel.js` | `drillsSection(drills,{onListen,onRecord})` = **변주 연습**. 듣기=`window.studySpeech.speak`, 녹음=`study/src/services/sessionAnalyze.js` |
| `study/src/services/sessionFinish.js` | scene 카드(=`explanation.dialogue` 보유)는 **복습 큐 이관 제외**(완료 표시만). 테스트 `sessionFinish.integration.test.js` |
| `study/src/styles/session.css` | `.scene-*` (다이얼로그 페이지) · `.drill-*` (변주) 스타일 |
| `study/docs/explanation-schema.md` | `drills` 필드 정의 |
| 데이터(Supabase) | `study_today_lessons` 에 7행 적재됨: `en-park-s1e1-scene`(order 0, `explanation.dialogue` 8줄) + 문장 6개(`explanation.drills` 3~4개) |
| 라우팅 | `study/src/pages/home.js:524` — 신규 있으면 `#/session-new` → `mountSessionNew`(위 분기). 복습은 `#/session-review` |

---

## 3. 할 일

### A. (최우선) 라이브에서 다이얼로그 페이지가 안 뜨는 원인 진단·수정
- 코드+데이터는 배포 완료(커밋 `4f4afd8`). 그래도 안 보이면 **유력 원인 = PWA 서비스워커 캐시**(구 번들).
- 검증: incognito / 강력 새로고침에서 `#/session-new` 진입 → 다이얼로그 페이지(제목 "토론회 — 구덩이 신고" + 8줄 + [시작하기])가 뜨는가?
- 안 뜨면 점검 순서:
  1. **SW 캐시** — `study/vite.config.*` 의 vite-plugin-pwa 설정. `registerType:'autoUpdate'` / `skipWaiting`+`clientsClaim` 으로 즉시 갱신되게. 캐시 버전 bump.
  2. **동기화** — `study/src/db/sync.js` 가 `study_today_lessons.explanation`(dialogue 포함)을 Dexie `todayLessons` 로 온전히 PULL 하는지. JSONB 필드 누락 여부.
  3. **로더/정렬** — `study/src/pages/cardLoader.js` `loadNewCards` 가 order_index 0(scene) 을 첫 카드로 주는지.

### B. 핵심 표현 색 강조 (미구현 — 합의된 사항)
- 다이얼로그 줄(scenePage) + 문장 카드에서 **핵심 표현을 `--accent` 색 + bold**.
- 핵심 표현 예: `fire away` · `care for` · `do something about it` · `move on` · `hitting on` · `bottom line` · `get this fixed`.
- 권장 구현: scene `explanation` 에 `highlights:[...]`(또는 줄별 `key`) 추가 → `scenePage.js` 가 매칭 구간을 `<span class="hl">` 래핑. CSS `.scene-line-en .hl{color:var(--accent);font-weight:700}` (이미 `.hl` 패턴 존재 — `session.css:205`).
- 시드 `study/seeds/en-parks-s1e1.json` 의 scene `explanation` 에 `highlights` 추가 후 **재시드 필요**.

### C. 디자인 폴리시 (재량)
- 다이얼로그 페이지/카드 간격·타이포·버튼 정합을 `study/DESIGN.md` 토큰으로 다듬기. 기존 컴포넌트 재사용(새 디자인 발명 X).

---

## 4. 규칙 (필수)
- **test-first**: 새 로직은 실패 테스트 먼저(`pnpm vitest run`). 배포 전 **전체 테스트 + `pnpm build` 통과**.
- **배포** = `main` 푸시(자동). **시드 재적재** = `study-seed-supabase.yml` 워크플로 dispatch (payload=`seeds/en-parks-s1e1.json`, user_id=defaults). 기존 영어는 사용자 승인 하에 비워도 됨.
- 변경 시 `study/docs/explanation-schema.md` 동기화.

## 5. 수용 기준
1. 라이브 English "공부 시작" → **1페이지 전체 다이얼로그**(줄마다 듣기) → [시작하기] → **문장별 카드**(변주 + 듣기/녹음).
2. **핵심 표현 색 강조** 적용.
3. 전체 테스트 + 빌드 통과, 배포 반영.
