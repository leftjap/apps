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
- 소스 스크립트: `~/apps/study/seeds/sources/realclass-parks-s1e1.txt` (로컬 전용·gitignored — 전문 커밋 금지). **부재 시 생성 중단 + 사용자에게 요청** (기억으로 대사 재구성 금지)
- 형식 정본 시드: `~/apps/study/seeds/en-parks-s1e1.json`
- 사용 이력: 기존 `seeds/en-*.json` 의 Parks 출처 시드 (`_note`) 와 장면·표현 중복 금지

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

### en — ⭐ RealClass-mining (가이드 §6.3, 9항. 구 콩트 체크 13항은 §6.2 archive 와 함께 폐기)
- [ ] 소스 스크립트 (`seeds/sources/realclass-parks-s1e1.txt`) 에서 발췌 — 부재 시 생성 중단 + 사용자 요청
- [ ] scene 카드 1장 — `order_index: 0` + `explanation.dialogue` 배열 (6~10줄, speaker/en/ko 완비) + `sceneTitle`/`sceneSummary`
- [ ] 표현 카드 5~7장 — 각 `explanation` = `key/situation/drills/mistake/similar/category/frequency`
- [ ] `drills` 카드당 3~8개 (`[{en,ko}]` — en 필수, ko 동반)
- [ ] 발췌 기준 3종: 단순 인사·리액션 단독 0 / 미국 지방정부 행정 디테일 0 / 일상 전이 가능 표현 (구동사·관용구·기본동사 chunk) 우선
- [ ] 기존 Parks 시드 (`seeds/en-*.json` `_note` 출처 확인) 와 dialogue·표현 중복 0
- [ ] 카드 id `en-parks-<se>-<slug>` 전 시드 고유 / 파일명 `en-<date>.json` / `_note` 에 출처 장면 문장 범위
- [ ] `phonetic_kr` 연음/flap/약음 반영 (사전 표기 X — 표현 카드만, scene 카드는 null)
- [ ] INSERT 전 라이브 미완료 en 신규 ≤ 5 확인 (초과 시 보류 + 사용자 안내)

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

## 알려진 drift (explanation-schema.md 박제)

- **en 신규 시드는 drift 논의 비대상** — RealClass-mining 형식 (scene 카드 + `key/situation/drills/…` 표현 카드) 이 2026-06-08 부터 정본. 구 8필드 콩트 형식 (`grammar:[{struct,body}]`/`chunks`/`phonemes`) 은 5/29 이전 시드 잔존분만
- ja 시드 카드는 mocks fixture 형식 (`key`/`grammar:[{struct,body}]`/`chunks:[[ja,kr]]`/`phonemes`/`mistake`) 사용 중 — `renderExplain()` 호환

## 관련 스킬

- `design-guide`: 카드 *표시* CSS·레이아웃 작업
- `supabase-pattern`: `study_today_lessons` PULL/INSERT 동기화 작업
- `verify-spec`: spec.md 인용 시 출처 검증
