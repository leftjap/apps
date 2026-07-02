---
name: study-content
description: ~/apps/study 의 일본어/영어 학습 카드 생성·수정 + 자연어 트리거("공부하자"·"오늘 영어/일본어") 자동화 진입점. ⭐ en 활성 모델 = RealClass-mining (2026-06-08 콩트 폐기) — 1세션 = 1장면 (scene 카드 다이얼로그 + 표현 카드 drills), 정본 = en 가이드 §6.3. ja = 콩트 유지. 1차 정본 = seeds/README.md (payload 형식). 2차 = docs/lesson-explanation-guide-{ja,en}.md + explanation-schema.md. 자동화 박제: study-read-user-context.yml (단계 3-4 SELECT) + study-seed-supabase.yml (단계 7 INSERT) + seeds/.user-defaults.json (default user_id). 트리거 — src/db/seed.js·mocks/session.html 카드 수정, study_today_lessons INSERT, "공부 만들어"·"오늘 영어"·"오늘 일본어"·"N문장 만들어"·"학습 카드 생성"·"explanation 채워". 비트리거 — UI/CSS, sync.js/auth.js, 텍스트 라벨. 거짓말 방지: 본 스킬 없이 카드 작성 = 체크리스트 통과 거짓 단정 위험.
paths:
  - "**/study/src/db/seed*"
  - "**/study/mocks/session.html"
  - "**/study/seeds/**"
---

# Study 학습 콘텐츠 작성 가이드

`~/apps/study` 의 학습 카드 (en/ja) 생성·수정 + 자연어 트리거 자동화 진입점.

## 자동화 박제 (spec §5-0 8단계)

| 단계 | 도구 | 명령 |
|---|---|---|
| 2 user_id | `seeds/.user-defaults.json` | `jq -r .default.user_id seeds/.user-defaults.json` (default = leftjap) |
| 3-4 SELECT | `study-read-user-context.yml` | `gh workflow run study-read-user-context.yml -f user_id=<UUID> -f lang=both -f days=30` → `gh run view --log` |
| 7 INSERT | `study-seed-supabase.yml` | `gh workflow run study-seed-supabase.yml -f payload=seeds/<lang>-<date>.json -f user_id=<UUID>` |
| 8 검증 | seed-supabase.mjs 내장 SELECT count | (자동) |

Repo Secrets `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` 의존. 로컬 .env 불필요.

자연어 트리거 표준 흐름: 발화 파싱 → user_id 로드 → read-user-context 실행 → JSON 회수 → 카드 생성 (**en = RealClass 장면 발췌** / ja = i+1 + 약점 음소 가중 콩트) → seeds/<lang>-<date>.json 작성 → seed-supabase 실행 → 검증.

## 강제 Read (작업 시작 전 — 세션당 1회)

**1차 정본:**
- `~/apps/study/seeds/README.md` — payload 형식 (en = RealClass scene+표현 카드 / ja = 콩트)
- `~/apps/study/specs/study-app-spec.md` §5-0 — 자연어 트리거 8단계 + en/ja 모델 분기 정본

**2차 (콘텐츠 세부):**
- `~/apps/study/docs/lesson-explanation-guide-ja.md` — ja 4필드, 4패턴 발음, Stage 1~4, §10 체크리스트
- `~/apps/study/docs/lesson-explanation-guide-en.md` — ⭐ **§6.3 RealClass-mining (활성 정본)**: 소스·발췌 기준 3종·scene/표현 카드 형식·체크리스트. (§6.2 콩트 = archive)
- `~/apps/study/docs/explanation-schema.md` — §scene 카드 + §drills + 메타 박제

**en 전용 (RealClass-mining):**
- 소스 스크립트: `~/apps/study/seeds/sources/realclass-{parks,office}-s1e{1..6}.txt` (12파일, 로컬 전용·gitignored — 전문 커밋 금지). **부재 시 생성 중단 + 사용자에게 요청** (기억으로 대사 재구성 금지)
- **소스 순서 = finish-parks-first (2026-07-01)**: Parks s1e1→s1e6 을 화별 가장 이른 미사용 구간부터 완주 후에만 Office s1e1→s1e6. 커서 정본 = `seeds/en-*.json` 의 `_source`. validate-seed 가 순서 이탈 경고·구간 겹침 차단
- 형식 정본 시드: `~/apps/study/seeds/en-2026-06-10.json` (가이드 §6.3 "형식 정본")
- 사용 이력: 기존 `seeds/en-*.json` 의 `_source:{episode,lines}` 와 구간 겹침 0 (validate-seed 기계 차단 — `_note` 산문은 사람용 보조)

## 카드 작성 자체 체크리스트 (요약 — 정본은 위 docs)

### ja (§10, 11항)
- [ ] `newElements` 콩트 단위 length===1 (콩트 1편 안 펀치라인 카드만 length=1, 나머지 length=0)
- [ ] `knownElements` 가 이전 콩트 newElements 합집합 + 본 콩트 newElements 에 포함 (콩트 사슬 단위)
- [ ] `phonetic_kr` 4패턴 (장음 `-` / 촉음 받침 / 묵음 약 / 조사 와·오·에) 정확
- [ ] `frequency` (1~10) · `category` 박힘
- [ ] Stage 1 sentence + reading 한자 0개
- [ ] `grammar` 한 줄 형태소 분해 (분석 깊이 X)
- [ ] `pronPoints` 가 4패턴 중 1개 (또는 명시적 "특이 패턴 X")
- [ ] 보통체/정중체 구분 가르치지 않음 (Stage 1~2 — "이런 것도 있다" 노출만 OK)
- [ ] 동사 활용 학습이 핵심인 문장 아님 (Stage 2 이전)
- [ ] `variations` / `varData` 미포함 (Stage 1~2)
- [ ] explanation 9키 정확 일치 (whenToUse/grammar/pronPoints/similar + stage/newElements/knownElements/frequency/category)

### en — ⭐ RealClass-mining (가이드 §6.3 활성 정본. 구 콩트 체크는 §6.2 archive 와 함께 폐기)
- [ ] 소스 스크립트 (`seeds/sources/realclass-{parks,office}-s1e{1..6}.txt`) 에서 발췌 — 부재 시 생성 중단 + 사용자 요청
- [ ] **소스 순서 finish-parks-first**: Parks 완주 전 Office 금지 + 화 건너뜀 금지 (validate-seed 순서 가드 경고 — 정당한 스킵은 `_note` 사유 기록)
- [ ] scene 카드 1장 — `order_index: 0` + `explanation.dialogue` 배열 (6~10줄, speaker/en/ko 완비) + `sceneTitle`/`sceneSummary`
- [ ] 표현 카드 **1~2장** (PPP 집중 추출 — 구 5~7장 폐기 2026-06-29) — 한국인 해설 8필드 (`key/situation/drills/grammar/chunks/phonemes/mistake/similar` + `category/frequency`)
- [ ] `drills` 카드당 3~8개 (`{en,ko,kr}` — **kr 음차 의무**. 핵심 6~8 / 쉬움 3, 하한 일괄 깔기 금지)
- [ ] `phonetic_kr` = chunks kr 이어붙임 일치 + chunks 본문 전단어 커버 (연음/flap, 사전 표기 X — 표현 카드만, scene 카드는 null)
- [ ] 표현 카드 순서 = dialogue 등장 순서 (deriveDialogue 매칭 계약)
- [ ] `_source: {episode, lines}` 의무 — 기존 시드 구간 겹침 0 (validate-seed 기계 차단)
- [ ] dialogue 화자 전원 `SPEAKER_VOICES` (src/services/speech.js) 등록 + **화자 귀속 불확실 시 외부 transcript 웹 대조** (2026-07-01 Michael 오귀속 사고)
- [ ] 발췌 기준 통과 (인사 단독 0 / 행정 디테일 0 / 일상 전이성 / 화자 교차 / 기본동사 청크 — 추출 전 `scan-source-chunks` 로 후보 확인)
- [ ] 카드 id `en-<show>-<se>-<slug>` (show=parks|office) 전 시드 고유 / 파일명 `en-<date>.json`
- [ ] **항상 생성** (hold 게이트 폐지 2026-07-01 — 미완료 카운트로 보류 금지. seed-supabase 가 14일+ 방치 미완료를 코드로 강제 정리)

## 거짓말 방지 메커니즘

- 본 스킬은 [spec-compliance.test.js](~/apps/study/src/db/spec-compliance.test.js) (ja 14 axis 자동) 와 짝. **en 콘텐츠 게이트 = `scripts/validate-seed.mjs`** (seed-supabase.mjs 가 INSERT 전 자동 차단 — 구조·발음 정합·매칭 계약·충실성(소스 대조)·기본동사·`_source` 겹침·소스 순서·화자 등록. 판단형(발췌 기준·드릴 분포)만 수동)
- 작성 직후 `pnpm vitest run src/db/spec-compliance.test.js src/db/seed.test.js scripts/validate-seed.test.mjs --reporter=dot` 1회 + `node scripts/validate-seed.mjs --payload seeds/<f>.json`
- "spec 정합" 단정 발화 전 — 본 docs 인용 라인 명시 (글로벌 거짓말 방지 axis A)

## 트리거 / 비트리거

**트리거:**
- `src/db/seed.js` 의 `REVIEW_CARDS` / `TODAY_LESSONS` 배열 수정
- `mocks/session.html` 의 `CARDS.en` / `CARDS.ja` 정적 fixture 수정
- Supabase `study_today_lessons` 또는 `study_review_queue` INSERT 작업
- 자연어: "공부 만들어"·"오늘 일본어"·"오늘 영어"·"N문장 만들어"·"학습 카드 생성"·"explanation 채워"·"기존 더미 삭제 후 신규"

**비트리거:**
- Study 의 UI/CSS 작업 (`design-guide` 스킬 영역)
- `sync.js`·`auth.js`·`schema.js` 수정 (`supabase-pattern` 스킬 영역)
- 단순 텍스트 라벨 변경, 버그 수정

## 알려진 drift (explanation-schema.md §4 박제)

- en 표현 카드 현행 형식 = `key`/`grammar:[{struct,body}]`/`chunks:[[en,kr]]`/`phonemes:[[ipa,word]]`/`mistake` 등 8필드 (`renderExplain()` 호환 — validate-seed EXPL_REQUIRED 가 기계 강제). 메타 5필드 (stage/newElements/knownElements/frequency/category 중 stage·Elements) 는 en **현재 미박힘** — multi-wave fix 영역
- ja 시드 카드는 mocks fixture 형식 (`key`/`grammar:[{struct,body}]`/`chunks:[[ja,kr]]`/`phonemes`/`mistake`) 사용 중 — `renderExplain()` 호환

## 관련 스킬

- `design-guide`: 카드 *표시* CSS·레이아웃 작업
- `supabase-pattern`: `study_today_lessons` PULL/INSERT 동기화 작업
- `verify-spec`: spec.md 인용 시 출처 검증
