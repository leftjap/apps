---
name: study-content
description: ~/apps/study 의 일본어/영어 학습 카드 생성·수정 + 자연어 트리거("공부하자"·"오늘 영어/일본어") 자동화 진입점. 1차 정본 = seeds/README.md (payload 형식 + en drift 결정 박제). 2차 = docs/lesson-explanation-guide-{ja,en}.md + explanation-schema.md. 자동화 박제: study-read-user-context.yml (단계 3-4 SELECT) + study-seed-supabase.yml (단계 7 INSERT) + seeds/.user-defaults.json (default user_id). 트리거 — src/db/seed.js·mocks/session.html 카드 수정, study_today_lessons INSERT, "공부 만들어"·"오늘 영어"·"오늘 일본어"·"N문장 만들어"·"학습 카드 생성"·"explanation 채워". 비트리거 — UI/CSS, sync.js/auth.js, 텍스트 라벨. 거짓말 방지: 본 스킬 없이 카드 작성 = §10/§11 체크리스트 통과 거짓 단정 위험.
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

자연어 트리거 표준 흐름: 발화 파싱 → user_id 로드 → read-user-context 실행 → JSON 회수 → i+1 + 약점 음소 가중 카드 생성 → seeds/<lang>-<date>.json 작성 → seed-supabase 실행 → 검증.

## 강제 Read (작업 시작 전 — 세션당 1회)

**1차 정본:**
- `~/apps/study/seeds/README.md` — payload 형식 + en drift 결정 (8필드 채택, multi-wave 정정 예정)
- `~/apps/study/specs/study-app-spec.md` §5-0 — 자연어 트리거 8단계 정본

**2차 (콘텐츠 세부):**
- `~/apps/study/docs/lesson-explanation-guide-ja.md` — ja 4필드, 4패턴 발음, Stage 1~4, §10 체크리스트
- `~/apps/study/docs/lesson-explanation-guide-en.md` — en 8필드, IPA weak_focus, chunks, §11 체크리스트
- `~/apps/study/docs/explanation-schema.md` — 메타 5필드 + drift 박제

## 카드 작성 §10·§11 자체 체크리스트 (요약 — 정본은 위 docs)

### ja (§10, 11항)
- [ ] `newElements` length === 1
- [ ] `knownElements` 가 이전 stage 카드 newElements 합집합에 포함
- [ ] `phonetic_kr` 4패턴 (장음 `-` / 촉음 받침 / 묵음 약 / 조사 와·오·에) 정확
- [ ] `frequency` (1~10) · `category` 박힘
- [ ] Stage 1 sentence + reading 한자 0개
- [ ] `grammar` 한 줄 형태소 분해 (분석 깊이 X)
- [ ] `pronPoints` 가 4패턴 중 1개 (또는 명시적 "특이 패턴 X")
- [ ] 보통체/정중체 구분 가르치지 않음 (Stage 1~2 — "이런 것도 있다" 노출만 OK)
- [ ] 동사 활용 학습이 핵심인 문장 아님 (Stage 2 이전)
- [ ] `variations` / `varData` 미포함 (Stage 1~2)
- [ ] explanation 9키 정확 일치 (whenToUse/grammar/pronPoints/similar + stage/newElements/knownElements/frequency/category)

### en (§11, 13항)
- [ ] `newElements` length === 1
- [ ] `knownElements` 가 이전 stage 카드 newElements 합집합에 포함
- [ ] `phonetic_kr` 연음/flap/약음 반영 (사전 표기 X)
- [ ] `pronunciation.chunks` 가 모든 단어 빠짐없이 포함
- [ ] `phonetic_kr` = chunks 의 kr 이어붙인 것과 일치
- [ ] `weak_focus` IPA 기호 배열 (한글 X, 2~4개)
- [ ] `frequency` · `category` 박힘
- [ ] Stage 1 = 구어 축약/리액션 위주
- [ ] Stage 1~2 `variations` 미포함
- [ ] Stage 3+ `variations` 정확 3개 (subject/tense/expression)
- [ ] 각 variation `answers` 비어있지 않음
- [ ] `commonMistakes` 한국인 학습자 관점

## 거짓말 방지 메커니즘

- 본 스킬은 [spec-compliance.test.js](~/apps/study/src/db/spec-compliance.test.js) (ja 14 axis 자동) 와 짝. **en 측 spec-compliance 자동 테스트는 없음** → en 카드 §11 체크는 콘텐츠 작성 시 수동으로 짚을 것
- 작성 직후 `pnpm vitest run src/db/spec-compliance.test.js src/db/seed.test.js --reporter=dot` 1회
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

- en 시드 카드는 정본 형식 (`keyPoint`/`grammar:{structure,explanation}`/`pronunciation:{chunks,tips,weak_focus}`/`commonMistakes`) 이 아닌 mocks fixture 형식 (`key`/`grammar:[{struct,body}]`/`chunks:[[en,kr]]`/`phonemes:[[ipa,word]]`/`mistake`) 사용 중 — `renderExplain()` 호환
- en 시드 카드 메타 5필드 (stage/newElements/knownElements/frequency/category) **현재 미박힘** — multi-wave fix 영역
- 작업 진입 시 위 drift 인지 후 — 새 카드는 "정본 추가" 인지 "drift 형식 유지" 인지 사용자에 결정 위임

## 관련 스킬

- `design-guide`: 카드 *표시* CSS·레이아웃 작업
- `supabase-pattern`: `study_today_lessons` PULL/INSERT 동기화 작업
- `verify-spec`: spec.md 인용 시 출처 검증
