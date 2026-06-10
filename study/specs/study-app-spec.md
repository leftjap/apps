# Study App 설계 명세 (Claude Code용)

> 최종 확정: 2026-04-14
> 개인 맞춤형 어학 학습 PWA. 영어/일본어 2트랙.
> 사용자: 지오(메인), 소연(파트너). 비개발자 바이브코딩 환경.

---

## 1. 프로젝트 개요

매일 AI가 학습자 약점 기반으로 맞춤 콘텐츠를 생성하고, Azure Speech SDK로 음소 단위 발음 분석을 수행하는 개인 어학 앱. 간격 반복(SRS) 복습 시스템 내장.

### 핵심 차별점 (기존 앱/서비스 대비)
- 학습 콘텐츠가 미리 코딩되어 있지 않음 → Claude Code(Max 플랜)로 학습자 데이터 기반 맞춤 생성 (추가 비용 $0)
- 발음 분석이 유사도 점수가 아닌 **음소 단위 채점** → 약점 음소 추적·맞춤 연습
- 한국인 전용 해설 (연음/생략 한국어 표기, 한국어 어순 비교, 자주 하는 실수)

### 기술 스택
- 프론트엔드: 바닐라 HTML/CSS/JS (프레임워크 없음)
- 로컬 저장: **IndexedDB (Dexie.js)**
- 클라우드: **Supabase** (무료 티어, Auth + DB + Edge Functions)
- 발음: **Azure Speech SDK** (Pronunciation Assessment)
- 콘텐츠 생성: **Claude Code** (Max 플랜 내 수동 트리거, 추가 API 비용 $0)
- 배포: GitHub Pages (leftjap.github.io/study)
- PWA: 서비스워커, 매니페스트, 오프라인 동작

### 디자인 참조
- `DESIGN.md` — 전 앱 공통 디자인 토큰 (유일한 디자인 권위 문서)
- 폰트: Poppins (display/UI) + Noto Sans KR (body/본문)
- 색상: `--bg: #faf9f5`, `--accent: #d97757`, `--sage: #788c5d`
- **Inter, Roboto, Arial 사용 금지**
- **좌측 색상 보더 카드 금지**
- **보라/파랑 그라디언트 금지**
- **이모지 사용 안 함**

---

## 2. 화면 구조

```
[홈]           — 학습 요약, 주간 캘린더, 최근 학습 카드, 세션 시작 버튼
[학습 세션]    — 복습 카드 → 신규 레슨 → 세션 완료 요약
[통계/기록]    — 월간 캘린더, 문장 목록, 발화 차트
[설정]         — 프로필, 학습 설정, 동기화 상태
```

---

## 3. 인증

### Supabase Auth (Google OAuth)
- Supabase 내장 Google OAuth 사용
- 허용 이메일: `leftjap@gmail.com`, `soyoun312@gmail.com`
- Supabase RLS(Row Level Security)로 사용자별 데이터 격리
- 로그인 상태 유지 (Supabase session)
- 비인가 접근 시 잠금 화면 표시

---

## 4. 데이터 저장

### 로컬: IndexedDB + Dexie.js

```javascript
const db = new Dexie('study_사용자해시');
db.version(1).stores({
  reviewQueue:    'id, lang, nextReview, interval',
  todayLessons:   'id, lang, date',
  sessionLogs:    'id, lang, date',
  dailyStats:     'date, lang',
  pronunciationLog: 'id, date, lang',
  meta:           'key'
});
```

- `navigator.storage.persist()` 요청
- 사용자별 별도 DB → 멀티유저 격리

### 클라우드: Supabase (무료 티어)

**테이블 구조** (단일 Supabase 프로젝트, `study_` 접두사):

```sql
-- 복습 큐
study_review_queue (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users,
  lang TEXT NOT NULL,           -- 'en' | 'ja'
  sentence TEXT NOT NULL,
  meaning TEXT NOT NULL,
  reading TEXT,                  -- 일본어 읽기
  explanation JSONB,             -- 해설 데이터
  interval INTEGER DEFAULT 1,   -- 현재 간격 (일)
  next_review DATE NOT NULL,
  consecutive_pass INTEGER DEFAULT 0,
  last_result TEXT,              -- 'O' | '△' | 'X'
  category TEXT,                 -- 레슨 카테고리/주제
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 오늘의 레슨 (배치 생성된 콘텐츠)
study_today_lessons (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users,
  lang TEXT NOT NULL,
  date DATE NOT NULL,
  sentence TEXT NOT NULL,
  meaning TEXT NOT NULL,
  reading TEXT,
  explanation JSONB NOT NULL,    -- 해설 전체 (아래 구조 참조)
  phonetic_kr TEXT,              -- 한국어 표기 발음
  audio_url TEXT,                -- TTS 캐시 URL (선택)
  completed BOOLEAN DEFAULT false,
  order_index INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 세션 로그
study_session_logs (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users,
  lang TEXT NOT NULL,
  date DATE NOT NULL,
  category TEXT,
  duration_sec INTEGER,
  new_count INTEGER DEFAULT 0,
  review_results JSONB,          -- { O: n, triangle: n, X: n }
  utterance_count INTEGER DEFAULT 0,
  pass_count INTEGER DEFAULT 0,  -- 70점 이상 발화 수 (§9-4 통과 발화)
  sentence_ids TEXT[],           -- 해당 세션에서 학습한 reviewQueue.id 배열 (home·stats 바텀시트 문장 목록)
  session_type TEXT,             -- 'normal' | 'free_review'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 일별 통계
study_daily_stats (
  id TEXT PRIMARY KEY,           -- 'date_lang_userId'
  user_id UUID REFERENCES auth.users,
  lang TEXT NOT NULL,
  date DATE NOT NULL,
  utterance_count INTEGER DEFAULT 0,
  study_time_sec INTEGER DEFAULT 0,
  new_sentences INTEGER DEFAULT 0,
  review_count INTEGER DEFAULT 0
);

-- 발음 분석 로그
study_pronunciation_log (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users,
  lang TEXT NOT NULL,
  sentence_id TEXT,
  date DATE NOT NULL,
  overall_score REAL,            -- 0-100
  phoneme_scores JSONB,          -- 음소별 점수 배열
  weak_phonemes JSONB,           -- 약점 음소 목록
  recognized_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 사용자 메타
study_user_meta (
  user_id UUID PRIMARY KEY REFERENCES auth.users,
  lang_en JSONB,                 -- 아래 LANG_META 스키마 (Wave 11.67 보강)
  lang_ja JSONB,
  weak_phonemes_en JSONB,        -- 누적 약점 음소 (음소 → 가중치 map)
  weak_phonemes_ja JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**LANG_META JSONB 스키마 (Wave 11.67 신규):**

```json
{
  "totalDays": 0,            // 누적 학습 일수
  "totalTime": 0,            // 누적 학습 시간 (초)
  "streak": 0,               // 연속 학습 일수
  "currentCategory": "",     // 현재 학습 카테고리 (free-form)

  "currentStage": 1,         // 1~4 (Wave 11.67 신규). 콘텐츠 가이드 docs/lesson-explanation-guide-{en|ja}.md 참조
  "userKnown": [],           // 학습 완료 sentence id / 어휘 / 구 / 문법 구조 배열 (Wave 11.67 신규)
                             //   원소 형식: { type: 'sentence'|'word'|'phrase'|'grammar', value: string, learnedAt: ISO }
                             //   Claude Code 자연어 트리거 (§5-0 단계 5 i+1 알고리즘) 가 참조
  "goal": ""                 // 학습 목표 자유 텍스트 (Wave 11.67 신규)
                             //   예: "미드 자막 없이 보기" / "여행 회화 자유" / "JLPT N3"
}
```

**Stage 1~4 정의 (콘텐츠 가이드 정본):**
- 영어: `~/apps/study/docs/lesson-explanation-guide-en.md` §3 (Stage 1=50~80 / Stage 2=80~150 / Stage 3=150~300 / Stage 4=300+)
- 일본어: `~/apps/study/docs/lesson-explanation-guide-ja.md` §3 (가나만 → 기본 문형 → 짧은 회화/감정 → 여행/시청 실전)

**Stage 진급 조건 (Wave 11.67 신규):**

| 진급 | 조건 (모두 충족) |
|---|---|
| 1 → 2 | `userKnown` 의 sentence 원소 ≥50건 + 정답률 (최근 30일 O 비율) ≥80% + 약점 음소 (`weak_phonemes_<lang>` 중 가중치 ≥3) 카드 정답률 ≥70% |
| 2 → 3 | `userKnown` 의 sentence 원소 ≥150건 + 정답률 ≥80% + Stage 2 카테고리 ≥10종 (`currentCategory` 누적) |
| 3 → 4 | `userKnown` 의 sentence 원소 ≥300건 + 정답률 ≥85% + variations (Stage 3+ 변형 연습) 정답률 ≥75% |

**Stage 진급 트리거:** Wave 11.13.2 PUSH 시 `study_session_logs` INSERT 직후 클라이언트가 위 조건 검사 → 충족 시 `lang_<lang>.currentStage` UPDATE + 사용자 알림 ("Stage 2 진입! 새 패턴 도입됩니다"). 강등 X — 진급만 일방향.

**userKnown 자동 갱신:** 카드 `consecutivePass ≥ 2` 도달 시 (SRS 기준 익힘 처리) `userKnown` 에 `{ type: 'sentence', value: <sentence>, learnedAt: now }` push. newElements / knownElements 의 `word` / `phrase` / `grammar` 도 같이 push (중복 dedupe). 자연어 트리거 §5-0 단계 5 의 `i` (현재 stage 의 user_known) 가 이 배열을 직접 참조.

### RLS 정책 (필수)

```sql
-- 모든 study_ 테이블에 동일 패턴 적용
ALTER TABLE study_review_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access own data"
  ON study_review_queue
  FOR ALL
  USING (auth.uid() = user_id);
-- 나머지 테이블도 동일
```

### 동기화 전략
- IndexedDB가 주 저장소 (오프라인 동작 보장)
- 온라인 시 Supabase와 양방향 동기화
- 충돌 해결: "No"(실패) 상태 우선, 가장 먼 nextReview 우선
- 세션 완료 시 즉시 동기화
- 디바운스 저장 (3초 배치)
- 급감 감지 차단 (안전장치): 로컬 N>0, 서버 0일 때 업로드 차단

---

## 5. 학습 콘텐츠 생성 (Claude Code 자연어 트리거 + 자동 시퀀스)

### 5-0. 자연어 트리거 + 단계 시퀀스 (Wave 11.66)

**자연어 트리거 (사용자 발화 → Claude Code 동작):**

| 발화 패턴 | lang | 생성 분량 | 비고 |
|---|---|---|---|
| "오늘 공부하자" / "공부 만들어줘" | 양쪽 (en + ja) | 각 lang 콩트 1편 | 분량은 콩트가 결정. Stage 별 가이드 범위 (en §3 / ja §4 콩트 분량 컬럼) |
| "영어공부" / "오늘 영어" / "오늘 영어 N편" | en | 콩트 N편 (default 1) | "N편" 명시 시 그 수만큼 |
| "일본어공부" / "오늘 일본어" / "오늘 일본어 N편" | ja | 콩트 N편 (default 1) | 동일 |
| "이번 주 5일치 영어" | en | 일자별 콩트 1편 × 5일 | 5일치 batch |
| "오늘 콘텐츠 비워줘" | 양쪽 | 0 (DELETE) | 잘못 생성 시 reset |

**⭐ en/ja 모델 분기 (2026-06-08 — en 콩트 모델 폐기, `seeds/en-parks-s1e1.json` `_note` 박제):**
- **en = RealClass-mining 1장면** (위 표의 "콩트 N편" 은 en 에서 "장면 N개" 로 읽음). 1세션 = scene 카드 1장 (`order_index: 0`, 전체 다이얼로그 — 세션 첫 페이지) + 표현 카드 5~7장 (drills 응용). **생성 정본 = en 가이드 §6.3** (소스 스크립트·발췌 기준 3종·중복 방지·ID 규칙·체크리스트). 아래 단계 5·7·8 의 콩트 단위 본문은 en 에 비적용
- **ja = 콩트 1편** (아래 콩트 단위 본문 = ja 정본, 변경 없음)

**분량 룰 (Wave 11.7x — 시트콤/콩트 호흡 정본):**
- 한 콩트 = 셋업 → 전개 → 펀치라인. 카드 N개의 묶음 (skitId 메타로 식별)
- Stage 별 분량 (en/ja 가이드 §3·§4 정본):
  - en S1: 4~7문장 / S2: 6~10 / S3~S4: 8~14
  - ja S1: 3~4문장 (한자 0개 특수성, 예외 보존) / S2: 4~7 / S3: 6~10 / S4~S5: 8~14
- 분량 강제 (예: 정확히 5문장) 금지 — 콩트 호흡상 자연스러운 길이를 콩트가 결정. 위 범위는 가드만

**기본 절차 (단일 lang · 단일 일자 기준 · trigger 1회당):**

1. **lang / 일자 / 콩트 편수 결정**
   - 사용자 발화에서 추출 (없으면 default: lang=양쪽, date=오늘 ISO, skitCount=1)
   - 양쪽 lang 요청 시 lang 별로 본 절차 2회 반복
   - 콩트 분량은 단계 5 에서 콩트 호흡상 결정 (Stage 별 분량 가드 범위)

2. **사용자 식별** — `auth.users.email` 가 `ALLOWED_EMAILS` (3명) 중 하나 → `user_id` 확정. RLS 정합 위해 모든 후속 SELECT/INSERT 는 `user_id` 명시.

3. **학습자 메타 조회** (`study_user_meta` SELECT)
   - `lang_<lang>.currentStage` (1~4, Wave 11.67 신규 — LANG_META 스키마 §4 참조)
   - `weak_phonemes_<lang>` (누적 약점 음소 → 가중치 map)
   - `lang_<lang>.userKnown` (이미 학습한 문장·구·단어·문법 배열, Wave 11.67)
   - `lang_<lang>.goal` (학습 목표 free text — 콘텐츠 카테고리 선택 hint)

4. **최근 학습 이력 조회** (`study_today_lessons` + `study_session_logs` SELECT)
   - 최근 30일 `sentence` 목록 → **중복 방지** (Levenshtein 또는 정확 일치 reject)
   - 최근 7일 `review_results` 비율 (O / △ / X) → 정답률 < 70% 시 newElements 난이도 한 단계 다운
   - 미완료 (`completed = false`) 카드 카운트 → 5건 초과 시 신규 생성 보류 + 사용자에게 안내

5. **i+1 + 약점 음소 가중 알고리즘 (콩트 단위 — ja 정본. en 은 RealClass 장면 발췌가 대체: en 가이드 §6.3)**
   - `i` = 현재 stage 의 `lang_<lang>.userKnown` 단어/구/문법 모음 (학습자가 이미 아는 것)
   - `+1` = **콩트 1편 전체에 newElements 1개** (문법 구조 1개 OR 새 어휘 1개 OR 발음 패턴 1개). 펀치라인 문장에 메타 박음 (skitOrder === skitTotal). 콩트 안 다른 카드는 newElements length=0
   - 콩트 호흡 = 셋업 → 전개 → 펀치라인. 분량은 Stage 별 가이드 범위에서 콩트가 결정
   - 약점 음소 가중: `weak_phonemes_<lang>` 상위 3개 음소가 콩트 안 카드에 포함되도록 우선 (콩트 카드 수의 ≥50% 권장)
   - frequency (1~10) 분포: 7~10 (고빈도) ≥60%, 4~6 (중빈도) ~30%, 1~3 (저빈도) ≤10% — 학습 효율 최대화
   - stage 가드: 콩트 안 모든 카드의 `stage` 메타가 `lang_<lang>.currentStage` 또는 (currentStage + 1) 만 허용. 점프 (Stage 1 → Stage 3) 금지

6. **콘텐츠 작성 가이드 준수**
   - en: `~/apps/study/docs/lesson-explanation-guide-en.md`
   - ja: `~/apps/study/docs/lesson-explanation-guide-ja.md`
   - explanation 스키마: `~/apps/study/docs/explanation-schema.md` (en/ja 공통 메타 5필드)
   - 한자 병기 한글 표기 (Wave 11.65): ja sentence 가 한자 포함 시 `phonetic_kr` 의무

7. **`study_today_lessons` INSERT** (ja: 콩트 1편 = skitTotal 건 / en: 1장면 = scene 카드 1 + 표현 카드 5~7 건)
   - 필수 컬럼: `id` (결정적 ID — ja `<lang>-<date>-skit<N>-<order>` / en `en-parks-<se>-<slug>`), `user_id`, `lang`, `date`, `sentence`, `meaning`, `reading` (ja 만), `phonetic_kr`, `explanation` (JSONB), `completed=false`, `order_index`
   - explanation JSONB nested 메타:
     - ja: 5필드 (stage / newElements / knownElements / frequency / category) + **콩트 메타 4필드** (skitId / skitTitle / skitOrder / skitTotal) — explanation-schema.md §"콩트 메타" 참조
     - en: **en 가이드 §6.3 유일 정본** (scene 카드 + 표현 카드 한국인 해설 8필드 — 필드 열거 재서술 금지, SSOT 2026-06-10)
   - bulkInsert (lang × date 단일 트랜잭션, 묶음 카드 동시 INSERT)

8. **검증 + 사용자 보고**
   - INSERT 직후 동일 user_id + lang + date 로 SELECT count → 카드 수 일치 확인 (ja: 콩트 skitTotal 합산 / en: scene 1 + 표현 카드 수)
   - en 검증 (RealClass — en 가이드 §6.3 체크리스트 정본): **기계 게이트 = `scripts/validate-seed.mjs`** (seed-supabase.mjs 가 INSERT 전 자동 호출 — 구조·발음 정합·매칭 계약·drills·ID/`_source` 겹침·화자 등록 + 서버 1일 1장면·completed 게이트). 판단형 (발췌 기준·드릴 분포) 만 수동
   - ja 콩트 메타 검증: 같은 skitId 카드 묶음 안 정확히 1장만 `newElements.length === 1` (펀치라인 권장)
   - **시트콤 작법 자체 점검** (ja 전용 — ja 가이드 §5.2. en §6.2 는 archive):
     - Show-don't-tell 위반 여부 (scene_intro 에 캐릭터 설명 박혔으면 reject)
     - 1번 카드 = Hook (캐릭터 voice 즉시), 마지막 카드 = Punchline (newElement 박힘)
     - Punchline type 1개 선택 (Self-trapping 1순위, 시나리오 동작상 자연 선택 — 강제 X)
     - 우희+여빈 페어 (활성) 사용 시 우희 voice 5 패턴 + 여빈 voice 5 패턴 일관성 + Vitriolic Best Buds 쌍방향 디스 검증
     - newElement = 시나리오 풀 idiom 1개 또는 친구 톤 affectionate threat 1개 (시나리오별 풀 참조)
   - 사용자에게 보고: ja = lang / date / skitId / skitTotal / skitTitle / 펀치라인 sentence 1건 인용 + Punchline type. en = date / 장면 제목 / 출처 문장 범위 / 표현 카드 목록 (sentence + key)
   - 차단 시 (분량 가드 위반 / RLS reject / 중복 reject / 소스 스크립트 부재 (en) / newElements 룰 위반 (ja) / show-don't-tell 위반 (ja)) 즉시 사용자 알림 + 원인 보고

**클라이언트 동기화:**
- 사용자가 PWA 진입 → `Sync.startSync()` 가 `study_today_lessons` PULL → Dexie `todayLessons` 갱신 (Wave 11.13.1)
- 자연어 트리거 직후 사용자가 PWA 진입 시 자동 반영 — 사용자 손 0

**비용:** Claude Code (Max 플랜) 사용자 직접 트리거 → 추가 API 비용 $0. Supabase 는 free tier 내 SELECT/INSERT.

---

### 5-1. 생성 방식 요약
- **Claude Code(Max 플랜)에서 사용자가 자연어 트리거** → 추가 API 비용 $0
- 트리거 발화 패턴 + 단계 시퀀스 = 위 §5-0 정본
- 매일 트리거하면 전날 학습 결과를 바로 반영 가능 (맞춤도 최대)
- 일주일치를 한 번에 만들어도 됨 (사용자 재량, batch 처리는 §5-0 표 참조)

### 폴백
- 콘텐츠 미생성 상태에서 앱 진입 시 → 복습 카드만으로 세션 구성 (신규 없이)
- "콘텐츠가 아직 없어요" 안내 (텍스트만)

### 5-2. home 콘텐츠 상태 안내 (Wave 11.29 + Wave 11.68 정정)

**Wave 11.68 정정:** 마스코트(Clawd) 말풍선·격려 메시지 시스템 제거. summary-row 의 텍스트 라벨 + 학습 요약 영역 (§7-1) 의 큰 숫자 (스트릭/발화/대기) 가 정보·동기부여 정본.

- **데이터 source**: `todayLessons` 의 today (`date === TODAY_ISO`) + 활성 lang 분 → `total` (전체) 와 `remaining` (`completed !== true` 분) 산출
- **summary-row 분기 (`#summary-row`)**:
  - `total === 0` → `<span class="summary-item summary-item-empty">신규 준비 중</span>` (콘텐츠 미생성)
  - `remaining > 0` → `<span class="summary-item"><span class="summary-val">${remaining}</span> new</span>` (진행 가능)
  - `total > 0 && remaining === 0` → `<span class="summary-item summary-item-done">오늘 학습 완료</span>` (모두 완료)
- **세션 분기 (Wave 11.22 후속 b 와 정합)**: `setupByMode('combined')` 가 `dueToday=0 + newCards=0` 시 `mode='free'` 자동 폴백 → free pool 0 시 `#/summary?source=empty` 즉시 이동. home 안내는 진입 전 사용자 인지 강화.
- **CSS 토큰 (DESIGN.md restraint 정합)**:
  - `.summary-item-empty`: `color: var(--text-muted); font-style: italic` (미세 구분, 강조 X)
  - `.summary-item-done`: `color: var(--sage)` (긍정 신호)

### 해설 구조 (explanation JSONB)

> **콘텐츠 작성 가이드 (en, 정본):** [../docs/lesson-explanation-guide-en.md](../docs/lesson-explanation-guide-en.md) — i+1·1T·Stage 1~4·구어 축약/리액션·chunks·IPA weak_focus·variations (Stage 3+)·shadowing
> **콘텐츠 작성 가이드 (ja, 정본):** [../docs/lesson-explanation-guide-ja.md](../docs/lesson-explanation-guide-ja.md) — i+1·1T·Stage 1~4·4패턴 발음·variations 비활성 (Stage 1~2)
> **형식 메타 (en/ja 공통 스키마 정합 정리):** [../docs/explanation-schema.md](../docs/explanation-schema.md)

en/ja 공통 ReviewCard 메타 (5필드): `stage` (1~4) · `newElements` (length=1) · `knownElements` · `frequency` (1~10) · `category` + `phonetic_kr`.

**한자 병기 + 한글 표기 정책 (Wave 11.65):** 일본어 카드의 `sentence` 가 한자 포함 시 (Stage 2+) `phonetic_kr` 의무. 학습자 (한자 미독 초보 가정) 가 sentence-phonetic 행으로 가독성 확보. UI 매핑은 review/new 모두 `phoneticKr` 통일 (이전 review = `phonetic` drift 폐기). 영어 카드는 `phonetic_kr` 빈 시 phonetic row 자체 hidden — 영어 알파벳은 학습자가 직접 읽음 가정.

en explanation 스키마 요약 (상세는 위 en 가이드):

```json
{
  "keyPoint": "1줄 핵심",
  "whenToUse": "사용 상황",
  "grammar": { "structure": "...", "explanation": "..." },
  "pronunciation": {
    "chunks": [{ "en": "...", "kr": "..." }],
    "tips": "발음 팁",
    "weak_focus": ["IPA", "..."]
  },
  "commonMistakes": "...",
  "similar": "...",
  "variations": [  /* Stage 3+ 만 */
    { "type": "subject|tense|expression", "prompt": "...", "answers": ["..."], "original": "..." }
  ]
}
```

ja explanation 스키마 요약 (상세는 위 ja 가이드):

```json
{
  "whenToUse": "사용 상황 한 줄",
  "grammar": "형태소 분해 한 줄",
  "pronPoints": "4패턴 중 해당 (장음/촉음/묵음/조사)",
  "similar": "비슷한 표현"
}
```

### 콘텐츠 생성 원칙
- **구어체 우선**: gonna, wanna, gotta, kinda, lemme 적극 포함
- **한국어 표기 발음**: 연음/생략 포함 실제 원어민 발음 기준
- **문장 구조 해설**: 풀 문장 → 왜/어떻게 이 구조가 되었는지 설명
- **품사 변형 연습**: 기본 문장 학습 후 간단한 변형 연습 포함
- **일본어**: 히라가나/카타카나 읽기, 초보 맞춤 (인사~기초 회화 수준부터)

---

## 6. 간격 반복 복습 시스템 (SRS)

### 복습 스케줄
- 간격: `[1, 3, 7, 21, 60]`일
- **판정 3단계** (언어별 표시):
  - English 탭: **"No" / "Hmm" / "Got it"**
  - 日本語 탭: **"だめ" / "微妙" / "わかった"**
  - 색상: No/だめ = `--danger`, Hmm/微妙 = `--amber`, Got it/わかった = `--sage`
- No/だめ: 간격 1로 리셋 (내일 복습)
- Hmm/微妙: 현재와 다음 간격의 중간값 (올림)
- Got it/わかった: 다음 간격으로 진행
- 60일 간격 통과 후 **졸업** → 복습 큐에서 제거

### 오늘의 복습 큐
- `next_review ≤ 오늘`인 모든 항목 자동 로딩
- 세션 내 카드 순서대로 표시
- 진행 카운터 (현재/전체)

### 카드 자동 이관
- 완료된 레슨 카드 → 복습 큐에 자동 추가 (interval=1, 내일 복습)
- 미완료 레슨은 보존
- 3일 이상 방치된 레슨 → 복습 큐로 자동 이관

---

## 7. 메인 홈 화면

### 7-1. 학습 요약 메시지
- 총 학습 표현 수, 현재 연속 학습일(스트릭), 오늘 복습 대기 수
- 세션 데이터 변경 시 동적 갱신
- Typography-driven 위계 (큰 숫자 + 단위 텍스트)

### 7-2. 언어 탭 (English / 日本語)
- 두 언어 학습 트랙 독립 운영
- 탭 전환으로 활성 언어 변경
- 각 언어 데이터 완전 분리

### 7-3. 주간 캘린더
- 월~일 7일 표시
- **Typography-driven**: 학습 강도를 font-size/weight/color 변화로 표현
- 오늘: accent 밑줄 마커
- 날짜별 발화 횟수 표시
- **컬러 박스/도트 금지** (디자인 가이드 준수)
- 날짜 탭 → 바텀시트 (`.bs-sheet`, stats 월간 캘린더와 공용 CSS): 해당 날짜의 학습 시간 · 통과/발화 · 신규 문장 목록 표시
- 바텀시트 내 문장 탭 → 해당 문장 복습 세션 진입 (`#/session?mode=review&sentenceId=...&from=home`)

### 7-4. 학습 상태 영역 (Wave 11.68 정정 — 마스코트·격려 메시지 제거)

**배경:** 이전 §7-4 는 Clawd 마스코트 + 상태별 말풍선·격려 메시지 시스템. Wave 11.68 에서 Study 한정으로 제거. 동기부여는 §7-1 학습 요약 (큰 숫자) + §11-6 발화량 위젯 (PR + 비교) + §9-7 세션 내 카운터 가 정본.

**구성:**
- 좌측: 스트릭 정보 (예: "7일 연속") + 마지막 학습 N일 전 — typography-driven (큰 숫자 + 보조 라벨)
- 우측: 상태 라벨 1개 (lang 별 텍스트, 마스코트 SVG·말풍선 없음)

**상태 라벨 (lang 별, 텍스트만):**

| 상태 | EN 라벨 | JA 라벨 |
|---|---|---|
| 최근 학습 (1~2일) | (라벨 hidden — 스트릭 숫자가 정보) | (동일) |
| 3~4일 공백 | "마지막 학습 3일 전" | "最終学習 3日前" |
| 5일+ 공백 | "마지막 학습 N일 전" | "最終学習 N日前" |
| 첫 사용 | "첫 학습 시작" | "学習開始" |

- 격려 문구 ("Nice job!" / "いいね!" 등) 사용 안 함. 정보 전달만
- accent glow / bounce 같은 마스코트 애니메이션 제거

### 7-5. 발화 통계 (양 + 질 분리)
- **총 발화**: "따라 말하기" 시도 횟수 (양)
- **통과 발화**: 임계치(70점) 이상 발화 횟수 (질)
- 홈 화면 표시: "오늘 12회 발화, 9회 통과"
- 주간 캘린더: **통과 발화 수** 기준 표시 (질 중심)

### 7-6. 최근 학습 카드
- 가장 최근 학습 세션 (또는 선택한 날짜) 표시
- 표시: 날짜, 카테고리, 신규 문장 수, 복습 결과, 소요 시간

### 7-7. 세션 시작 버튼
- "공부 시작" / "이어서 하기" / "자유 복습"
- 서버 데이터 로딩 중 버튼 비활성
- 진행 중 세션 있으면 "이어서 하기" 우선 표시

### 7-6. 내비게이션
- 캘린더 아이콘 → 통계/기록 화면
- 메뉴 아이콘 → 설정 화면

---

## 8. 학습 세션 흐름

### 8-1. 세션 시작
- 타이머 시작 (타임스탬프 기반, `Date.now()`)
- 순서: 복습 카드 먼저 → 신규 레슨 카드

### 8-2. 복습 카드 인터랙션
- 카드: 한글 의미(프롬프트) + 카운터
- "정답 보기" 탭 → 답안 표시:
  - 문장/표현, 읽기(일본어), 의미
  - 오디오 재생 (웨이브 바 애니메이션)
  - "따라 말하기" 버튼 → 발음 분석
  - 해설 (접기/펼치기)
  - **판정 버튼 3개** (언어별 텍스트):
    - English: "No" / "Hmm" / "Got it"
    - 日本語: "だめ" / "微妙" / "わかった"
    - 텍스트 레이블만 (도형/심볼 없음)
    - 각 상태 색상의 25% 보더로 구분
    - No/だめ = `--danger`, Hmm/微妙 = `--amber`, Got it/わかった = `--sage`
- **스와이프 제스처**: 좌=No/だめ, 상=Hmm/微妙, 우=Got it/わかった

### 8-2-1. autoTTS 자동 재생 (Wave 11.23)
- `settings.autoTTS=true` (default true) 시 "정답 보기" → answer stage 진입 후 300ms 자동 TTS 재생
- 신규 카드 진입 시 동일 (renderNewCard 끝에서 자동 트리거)
- mocks 모드 (`window.studyDB` 미설정) 는 default 유지
- settings.html 에서 사용자가 토글 가능 (Wave 11.9B 의 Dexie meta `studySettings.autoTTS`)

### 8-3. 신규 레슨 카드
- 카드 표시: 문장, 읽기(일본어), 의미
- 카운터: "신규 N / total"
- 오디오 재생 버튼 (Azure TTS)
- "따라 말하기" 발음 연습 버튼
- 해설 패널 (접기/펼치기):
  - 핵심 포인트
  - 이런 상황에서 써요
  - 문법 뜯어보기
  - 발음 팁 (한국어 표기 발음 포함)
  - 한국인이 자주 하는 실수
  - 비슷한 표현 비교
  - 품사 변형 연습
  - 애니 장면 예시 (일본어)

### 8-4. 자유 복습 모드
- 정규 복습/레슨 완료 후 추가 연습 가능
- 복습 큐에서 최대 20장 (기한 초과 우선)
- 실제 복습 스케줄에 영향

### 8-4-1. 자동 폴백 (Wave 11.22 후속 b)
- combined 모드 진입 시 `dueToday(all.review)=0 + newCards=0` (정규 완료) 이면 자동 `free` 모드 전환
- toast 안내: "오늘 정규 학습 완료 · 자유복습으로 진행합니다"
- 자유복습도 0장 (복습 큐 자체 부재) 이면 `#/summary?source=empty` 즉시 이동
- 사용자 1 클릭 흐름 보장 ("공부시작" → 정규 → 자유복습 → summary)
- review/new 모드는 사용자 명시 선택이라 폴백 미적용

### 8-5. 학습 타이머
- 헤더에 경과 시간 (MM:SS) 표시
- 타임스탬프 기반 (`Date.now() - startTime`)
- 화면 복귀 시 재계산

### 8-6. 세션 지속성
- 앱 이탈 시 세션 상태 자동 저장 (IndexedDB)
- 1시간 만료
- 복귀 시 "이어서 하기" 버튼으로 정확한 카드/인덱스 복원

### 8-7. 세션 종료
- "학습 종료" 탭 → 확인 모달 (실수 방지)
- 완료 시:
  - 신규 카드 → 복습 큐 추가 (interval=1)
  - 세션 로그 생성
  - 메타데이터 갱신: 총 학습일, 총 시간, 스트릭
  - 통계 갱신: 총 문장, 복습 대기, 성공률
  - 발화 통계 증가
  - 발음 분석 결과 → 약점 음소 누적 업데이트
  - IndexedDB 저장 + Supabase 동기화
  - 학습 완료 요약 화면 표시

---

## 9. 발음 연습 (Azure Speech SDK)

### 9-1. 아키텍처

```
[브라우저] → Supabase Edge Function → Azure Token 발급
[브라우저] → Azure Speech SDK (직접 통신, DB 미경유)
[브라우저] → 분석 결과를 IndexedDB + Supabase에 저장
```

- **Azure 키는 절대 클라이언트에 노출하지 않음**
- Supabase Edge Function이 단기 토큰(10분) 발급
- 브라우저는 토큰으로 Azure와 직접 통신

### 9-2. Pronunciation Assessment (음소 분석)
- "따라 말하기" 탭 → 마이크 오픈, 녹음 표시
- Azure SDK가 반환하는 데이터:
  - 전체 정확도 점수 (0-100)
  - 단어별 점수
  - **음소별 점수** (핵심: 어떤 음소가 약한지 파악)
  - 유창성, 완전성 점수
  - 운율(prosody) 점수 (en-US만 지원)

### 9-2-1. Azure analyze 통합 (Wave 11.24)
- mocks/session.html toggleRec analyzing 단계 → `await window.studySpeech.analyze(expected, { lang: 'en-US' })` 호출
- 결과 `{ score, wordScores, phonemeScores, weakPhonemes, fluencyScore, completenessScore, prosodyScore }` → `state.lastAnalyze` 저장
- `showScore(result.score)` → 점수 팝업 4단계 분기 (§9-3)
- `applyWordHighlight` → `wordScores[i].score` 활용 (Azure 실 데이터)
- `openWordSheet` → `phonemeScores.filter(p => p.word === clean)` → 평균/약점 음소 표시
- 폴백: studySpeech 부재 (mocks 모드) 또는 analyze 실패 → mock random 점수 (회귀 0 보장)

### 9-3. 점수 피드백 (RPG 데미지 스타일)
사용자 발화 완료 → 1~2초 후 **점수 팝업 애니메이션**:

- **90점+**: 큰 숫자(48px+), `--sage` 색상, 위로 떠오르며 페이드아웃, accent glow 효과
- **70~89점**: 중간 숫자(36px), `--accent` 색상, 위로 떠오르며 페이드아웃
- **50~69점**: 작은 숫자(28px), `--amber` 색상, 약하게 떠오르며 페이드아웃
- **50점 미만**: 작은 숫자(24px), `--danger` 색상, 약하게 떠오르며 페이드아웃

**통과 임계치(70점) 이상** → 점수 팝업에 accent glow + 통과 발화 카운트 +1

(마스코트 격려 메시지 제거 — 점수 팝업 자체와 §9-7 카운터 변화가 피드백 정본. Wave 11.68 정정.)

**단어별 색상 하이라이트** (점수 팝업 후 표시):
- 각 단어를 점수에 따라 색상 표시: sage(좋음) / amber(보통) / danger(나쁨)
- 나쁜 단어 탭 → 바텀시트: 음소별 상세 점수 + "ɛ 대신 ə로 발음했어요" 구체적 피드백

### 9-4. 발화 카운트 (양 + 질 분리)
- **총 발화 수**: "따라 말하기" 시도할 때마다 +1 (양)
- **통과 발화 수**: 70점 이상일 때만 +1 (질)
- 두 수치 모두 일별 통계에 저장
- 홈 화면·세션 요약에서 둘 다 표시

### 9-5. 약점 음소 추적
- 세션 완료 시 발음 로그에서 약점 음소 집계
- `study_user_meta.weak_phonemes_en/ja`에 누적
- 다음 콘텐츠 생성 시 Claude Code에 약점 음소 데이터 제공 → 해당 음소 포함 문장 우선 생성

### 9-6. TTS (텍스트 → 음성)
- Azure Speech SDK의 TTS 사용 (동일 토큰으로)
- 재생 중 웨이브 바 애니메이션
- 오프라인 폴백: 브라우저 Web Speech Synthesis

### 9-6-1. Azure Neural voice 매핑 (Wave 11.32)
- **lang 별 default**: `VOICE_DEFAULTS` (speech.js export)
  - `en-US`: `en-US-AriaNeural` + `style="whispering"` (사용자 선택, mstts:express-as)
  - `ja-JP`: `ja-JP-AoiNeural` + style 미적용 (호기심 child voice)
- **SSML 구조** (`buildAzureSSML(text, lang, rate, voice, style)`):
  - style 있으면 `xmlns:mstts` namespace + `<mstts:express-as style="...">` 래핑
  - style null 시 mstts 생략 (단순 `<voice><prosody>`)
  - voice null 시 `<voice>` 태그 생략 (lang default voice)
- **opts override**: `Speech.speak(text, { voice, style, lang, rate })` — 카드별/사용자 settings 시 default 덮어쓰기
- **Web Speech 폴백** (Azure 미인증 / SDK 실패): voice 매핑 무관 — pickVoice (Wave 11.31) 의 시스템 voice 우선순위 사용. AriaNeural / AoiNeural 은 Azure 한정 — 사용자 OAuth 인증 + Edge Function azure-token 정상 발급 시에만 적용.
- **trade-off (UX)**: whispering = 분위기 voice, audibility 일반 voice 보다 약함. 학습 audibility 우선 시 사용자 settings 에서 style="" 또는 다른 style ('cheerful' / 'newscast' 등) 선택 가능 (별 wave).

### 9-7. 세션 내 발화 카운터 + 비교 (Wave 11.68-d, 정본)

**배경:** "공부 시작" 버튼 누른 후 세션 화면에서 발화 1건마다 카운트 +1 + 직전 동일 모드 세션의 같은 시점 누적 발화량과 실시간 비교 → 동기부여 차원의 progressive overload 시각화. 마스코트 격려 메시지 없음 — 숫자 변화 자체가 동기부여원.

**위치:** 학습/복습 세션 화면 (§8 정합) — `mocks/session.html` + SPA `#/session` 의 헤더/하단 영역 (정확한 위치는 디자인 wave). §8-5 학습 타이머 옆이 자연.

**카운터 동작 (4가지 표시):**

| 표시 | 산출 | 갱신 시점 |
|---|---|---|
| **이번 세션 발화 N회** | 큰 숫자 (typography-driven) | "따라 말하기" 발화 1건마다 +1 |
| **이번 세션 통과 N회** | 작은 숫자 (`/` 구분) | PronScore ≥70 일 때만 +1 |
| **vs 직전 세션** | 부호 + 숫자 (`+3` / `-2` / `=`) | 직전 동일 모드 세션의 동일 시점 누적과 차이. 직전 세션 시작 후 (현재 세션 경과 초) 까지의 발화 수와 비교. 직전 세션이 더 짧으면 "직전 세션 종료 시점 N회 vs 지금 M회" 표시 |
| **PR 까지 N회** | 작은 라벨 ("PR 까지 5회") | 일 발화 PR 값 - (오늘 누적 + 이번 세션 누적). PR 달성 시 라벨 → "PR 달성!" + accent glow 1회. 0 이하면 hidden |

**비교 대상 결정 규칙 ("직전 세션"):**
- 동일 lang + 동일 모드 (review / new / combined / free) 의 가장 최근 sessionLogs entry 1건
- 없으면 (첫 세션이거나 모드 첫 사용) — vs 직전 세션 라벨 자체 hidden
- 같은 lang 다른 모드는 비교 대상 X (review 와 new 는 발화 패턴 자체 다름)

**데이터 source:**
- 이번 세션: in-memory `state.utteranceCount` / `state.passCount` (기존 §9-4 발화 카운트 재사용)
- 직전 세션: 세션 시작 시 1회 SELECT — `study_session_logs WHERE user_id=? AND lang=? AND session_type=? ORDER BY created_at DESC LIMIT 1`. mocks 모드는 fixture
- 직전 세션 시점 누적: 직전 세션의 `utteranceCount` (단일 값) + `durationSec` 만 알면 충분 — 시점별 누적은 미저장. **단순화**: 직전 세션의 분당 평균 (`utteranceCount / (durationSec/60)`) × 현재 세션 경과 분 → 비교 기준선. 전체 종료 시 `직전 세션 합계 vs 이번 세션 합계` 도 함께 표시
- 일 PR: §11-5 의 `daily_utterance.value`

**디자인 토큰 (DESIGN.md restraint):**
- 큰 숫자: `--text-primary` typography-driven (font-size scale)
- 부호 라벨: `--text-muted` (긍정·부정 컬러 차이 없음 — 평가 톤 회피)
- PR 임박 라벨: `--accent` (단 PR 달성 시 1회 glow)
- 컬러 박스/도트 금지

**0 케이스:**
- 첫 세션 (직전 동일 모드 세션 없음): vs 라벨 hidden, 카운터만 표시
- 직전 세션 utteranceCount=0: vs 라벨 hidden
- 일 PR 0 (첫 세션): "PR 까지" 라벨 hidden — 이번 세션 종료 후 첫 PR 자동 등록 (§11-5 트리거)

**갱신 throttle:** 발화 1건당 카운터·비교 라벨 즉시 갱신 (지연 없음). PR 달성 glow 는 `transition: 1s ease` 1회.

**구현 단계 (Wave 11.68-d sub-task 내부):**
1. `state.utteranceCount` / `state.passCount` 는 §9-4 기존 — 신규 `state.prevSessionAvgPerMin` (직전 세션 시작 시 1회 산출)
2. `renderInSessionStats(state)` 신규 — DOM `#session-stats` 갱신 (큰 숫자 + 부호 + PR 라벨)
3. session 진입 시 `prev = await fetchPrevSession({ lang, mode })` → state 채움 → `renderInSessionStats(state)` 첫 표시
4. "따라 말하기" `analyzeWavRest` 결과 처리 끝에서 `renderInSessionStats(state)` 호출 (utterance/pass 증가 후)
5. 단위 테스트 — `computeDeltaVsPrevSession(prev, currentSec, currentCount)` 순수 함수 검증 + `computePRRemaining(dailyPR, todayCount, sessionCount)` 검증

---

## 10. 학습 완료 요약

### 세션 요약 표시
- 제목: "학습 완료" 또는 "자유 복습 완료"
- 카드: 학습 시간, 복습 결과 (Got it/Hmm/No 각 N건), 신규 표현 수, 총 발화 수, 통과 발화 수
- 발음 분석 요약: 평균 점수, 이번 세션 약점 음소 Top 3
- "확인" → 홈으로 복귀

### 10-1. 발음 집계 산출 (Wave 11.28)
- **데이터 source**: `pronunciationLog` 테이블 (Azure analyze 결과 또는 mock 폴백 시 `logPronunciation(score)` 호출 시점에 add)
- **이번 세션 필터**: `date === TODAY_ISO && createdAt >= session.startMs` (인덱스 'date' 활용 + in-memory createdAt 필터)
- **평균 점수 (`pronAvg`)**: 필터된 entry 의 `overallScore` 산술 평균 → `Math.round`. 0건 시 `null`.
- **약점 음소 Top 3 (`weakTop3`)**: 필터된 entry 의 `weakPhonemes` (overallScore < 70 음소) 빈도 집계 → 상위 3개 symbol. 0건 시 `[]`.
- **finish() → sessionStorage**: `data.pronAvg` + `data.weakTop3` 추가 후 `studySummary` 직렬화.
- **summary.html 렌더 우선순위**:
  - `data.tryCount === 0` → 점수 "—" + 모든 weak-tag 제거 (발화 0 시 표시 의미 없음)
  - `data.tryCount > 0`:
    - 점수: `data.pronAvg` (number) 우선, 부재 시 `(passCount / tryCount) * 80 + 20` fallback (mocks 단독 진입 시안용)
    - 약점: `data.weakTop3` (array) 우선, 부재 시 mocks 하드코딩 weak-tag 유지 (시안용)
- **mocks vs SPA 분기**: `data.pronAvg` / `data.weakTop3` 의 존재 여부로 자연 분기. SPA 모드 finish() 가 항상 채움. mocks 단독 진입 (iframe 허브) 은 fallback.

---

## 11. 통계/기록 화면

### 11-1. 월간 캘린더
- ← → 버튼으로 월 이동 (미래 불가)
- Typography-driven: 날짜별 발화 수를 font-size/weight 변화로 표현
- 언어 태그 (en/ja 또는 both)
- 날짜 탭 → 해당 날짜 세션 상세 바텀시트

### 11-1-1. 월 이동 cursor (Wave 11.25)
- `cursor = { year, month }` state — 사용자가 prev/next 클릭 시 갱신
- 미래 차단: `btnNextMonth.disabled = isFutureFromCursor(1)` (현재 month 면 next 비활성)
- cursor 변경 → `rerenderMonth()` (renderMonthNav + renderCal + renderChart)
- `today` 마커: `isCurrentMonth() && d === TODAY` 일 때만 표시
- 마지막 날: `getCursorDaysInMonth()` (Date 기반 — 2월=28/29, 4월=30, 5월=31 정합)
- 첫 요일 offset: `getCursorFirstDOW()` (월요일=0 기준 변환)
- chart range: `isCurrentMonth() ? TODAY : getCursorDaysInMonth()` (과거 month 는 전체)
- 문장 목록 (`fetchSentencesWithLastLearned`): cursor 무관 — 모든 month 의 학습 기록 표시 (iso month 사용)
- mocks 모드 fallback (APRIL_DATA): 4월에만 적용 (다른 month = 빈 캘린더, 시안 한계)

### 11-2. 월간 요약
- 총 활동 일수, 월간 총 발화 수

### 11-3. 문장 목록 보기
- 탭 토글: "캘린더" / "문장 목록"
- 학습 날짜순 (최신순) 전체 문장 리스트
- 문장 탭 → 해당 문장 복습 세션 진입 (`#/session?mode=review&sentenceId=...&from=stats`). 상세 열람(문장·읽기·TTS·해설)은 세션 카드 내 해설 패널에서 제공
- 월간 캘린더 날짜 탭 → 바텀시트의 문장 목록에서도 동일 경로 (`.bs-sent` 탭 시 복습 진입)

### 11-4. 발화 차트
- 발화 활동 시각화 (X축: 일, Y축: 발화 수)
- 월간 표시

### 11-5. 발화량 PR (Personal Record) + 동기부여 (Wave 11.68)

**배경:** Gym 앱의 PR (1RM) 시스템과 동일 패턴으로 학습 발화량의 progressive overload 가시화 → 동기부여. 발화 활동 자체를 운동량처럼 다루는 멘탈 모델 (Wave 11.68 신규).

**PR 정의 (4종 동시 추적):**

| PR 종류 | 단위 | 산출 |
|---|---|---|
| 일 발화 PR | utterance/day | 단일 일자 최대 `utteranceCount` (sessionLogs 합산) |
| 일 학습 시간 PR | sec/day | 단일 일자 최대 `studyTimeSec` |
| 주 발화 PR | utterance/week | 7일 sliding window 최대 `utteranceCount` 합 |
| 주 통과 발화 PR | passCount/week | 7일 sliding window 최대 `passCount` 합 (PronScore ≥70) |

**DB 스키마 (Supabase 신규 — Wave 11.68):**

```sql
study_pr_records (
  user_id UUID PRIMARY KEY REFERENCES auth.users,
  daily_utterance JSONB,        -- { value: int, achieved_at: DATE, lang: 'en'|'ja'|'both' }
  daily_study_time JSONB,       -- 동일 형식
  weekly_utterance JSONB,       -- { value: int, week_start: DATE, lang }
  weekly_pass JSONB,            -- 동일
  history JSONB,                -- 직전 PR 5건 [{ type, value, achieved_at, lang }]
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**PR 갱신 트리거:** `study_session_logs` INSERT 직후 클라이언트가 4종 PR 검사 → 신규 갱신 시 `study_pr_records` UPSERT + `history` 에 직전 값 push (max 5건). RLS user_id 격리.

**일별·주별 비교 (홈 위젯 데이터):**
- 오늘 vs 어제: `today.utterance / yesterday.utterance` 비율 → "+30%" / "-12%" 라벨
- 이번 주 vs 지난 주: 7일 합산 비교
- 30일 평균 대비: `today.utterance / avg30d.utterance` → "평균보다 1.5배" 멘탈 앵커

**동기부여 표시 정책 (마스코트 / 격려 메시지 사용 안 함):**

PR 갱신 / streak / 평균 비교 등은 **숫자 + 짧은 라벨** 로 정보 전달. 마스코트 말풍선·격려 문장 (cheering text) 없음. 사용자 동기부여는 "수치의 변화 자체가 보이는 것" 이 본질.

- PR 갱신 시: 위젯 (§11-6) + 세션 내 카운터 (§9-7) 의 라벨에 "PR" 뱃지 (텍스트), accent glow 1회
- streak: §7-1 학습 요약 메시지 영역의 큰 숫자 (예: "7일 연속")
- 평균 대비: 위젯 비교 라벨의 부호 (`+30%` / `-12%`) 만. 평가 문구 (e.g. "Crushing it") 안 씀

**구현 우선순위 (Wave 11.68 sub-task):**
1. **Wave 11.68-a**: `study_pr_records` 테이블 생성 + RLS + sync.js TABLE_MAP 추가
2. **Wave 11.68-b**: `pr.js` 모듈 신규 — 4종 PR 검사 + history push 로직 + 단위 테스트
3. **Wave 11.68-c**: 홈 위젯 (`#pr-widget`) — 일별·주별 비교 카드 (typography-driven, 컬러 박스 X)
4. **Wave 11.68-d**: 세션 내 발화 카운터 + 비교 (§9-7 정본) — 학습·복습 화면에서 실시간 동기부여

### 11-6. 발화량 위젯 (홈) — Wave 11.68

홈 화면 §7 의 신규 위젯. 위치: §7-3 주간 캘린더 직하단.

**구조:**
- 좌: 오늘 발화 수 (큰 숫자) + "vs 어제" 비교 (`+N` / `-N`)
- 우: 이번 주 합산 (큰 숫자) + "vs 지난주" 비교
- 하단: 가장 최근 PR 갱신 ("일 발화 PR · 5월 1일 · 47회") — 7일 이내만 표시

**디자인 토큰:** `--text-primary` / `--text-muted` / `--accent` (PR 갱신 시 1회 glow). 컬러 박스·도트 금지 (DESIGN.md restraint).

**0 케이스:**
- PR 미존재 (첫 사용자): 위젯 hidden — 안내 문구 없음 (첫 세션 후 자연 표시)
- 7일 비활성: 비교 라벨 "—" 표시 (별도 메시지 X)

---

## 12. Supabase Edge Functions

### 12-1. Azure 토큰 발급 (유일한 Edge Function)

```
POST /functions/v1/azure-token
Authorization: Bearer <supabase_session_token>
→ { token, region, expiresAt }
```

- Azure Speech 리소스 키를 Edge Function 환경변수에 저장
- 10분 만료 토큰 발급
- Supabase Auth로 인증된 사용자만 호출 가능

### 12-2. 환경변수 (Supabase Dashboard에서 설정)

```
AZURE_SPEECH_KEY=...
AZURE_SPEECH_REGION=eastus
```

> 참고: 학습 콘텐츠 생성은 Claude Code(Max 플랜)에서 수동 트리거하므로
> ANTHROPIC_API_KEY는 불필요. Edge Function도 Azure 토큰 발급 1개만 운영.

---

## 13. PWA

- 홈 화면 설치 가능 (iOS/Android)
- 독립 실행 모드 (standalone)
- **오프라인 완전 동작** (IndexedDB 기반)
  - 배치 생성된 레슨은 IndexedDB에 캐시
  - 발음 분석은 온라인 필요 (Azure 의존)
  - 복습은 오프라인 가능
- Safe area 대응 (노치, 홈 인디케이터)
- `navigator.storage.persist()` 요청
- 서비스워커: 앱 셸 캐싱 (HTML/CSS/JS)
- 사용 환경: Mac / iPad / iPhone

---

## 14. 디자인 원칙 (DESIGN.md 준수)

### 컬러 팔레트
| 토큰 | 값 | 용도 |
|---|---|---|
| `--bg` | `#faf9f5` | 앱 배경 |
| `--surface` | `#ffffff` | 카드/모달 |
| `--bg-warm` | `#f5f0ea` | 강조 배경 |
| `--text` | `#3d3929` | 본문 |
| `--text-strong` | `#141413` | 제목/강조 |
| `--text-muted` | `#8a8475` | 보조 텍스트 |
| `--text-faint` | `#b5ad9e` | placeholder |
| `--accent` | `#d97757` | Primary CTA |
| `--sage` | `#788c5d` | 성공/Pass(O) |
| `--amber` | `#c4973b` | 보통(△) |
| `--danger` | `#b44d3b` | 실패(X) |
| `--blue` | `#6a9bcc` | 정보 |
| `--border` | `#e8e4dc` | 보더 |

### 색상 규칙
- **하드코딩 금지**: 반드시 `var(--*)` 토큰 참조
- **차가운 색 금지**: clinical blue, 순수 검정, sterile white 금지
- **그림자 웜 톤**: `rgba(20,20,19,...)` 사용
- 성공=sage / 경고=amber / 에러=danger / 정보=blue

### 타이포그래피
| 토큰 | 값 | 용도 |
|---|---|---|
| `--font-display` | `'Poppins', system-ui, sans-serif` | 제목/UI/버튼/숫자 |
| `--font-body` | `'Noto Sans KR', system-ui, sans-serif` | 본문/설명/카드 |
| `--font-mono` | `'SF Mono', 'Fira Code', monospace` | 코드/ID |

- Poppins = 제목/UI 전용, 본문 금지
- Noto Sans KR = 본문 전용, 제목 금지
- Line height: 본문 1.65, 제목 1.25

### 레이아웃
- Spacing: 4px 기반 (`--s-4` = 16px, `--s-6` = 24px)
- Radius: `--r-sm` 6px, `--r-md` 10px, `--r-lg` 16px
- Shadow: 웜 톤 (`rgba(20,20,19,...)`)
- Transition: `cubic-bezier(0.4, 0, 0.2, 1)`, 기본 150ms

### 배경 텍스처
모든 `body`에 SVG fractalNoise 텍스처 적용 (1.5% opacity)

### 컴포넌트 패턴
- **Primary 버튼**: accent 배경 + 흰 텍스트
- **Secondary 버튼**: 투명 + accent 텍스트 + accent 20% 보더
- **Ghost 버튼**: 배경/보더 없음
- **판정 버튼 (No/Hmm/Got it)**: 텍스트 레이블만, 각 상태 색상의 25% 보더, 언어별 텍스트 전환
- **카드**: surface 배경, border, r-lg, shadow sm. 좌측 색상 보더 금지
- **구분선**: 여백으로 시각 분리 우선, 불가피 시 `--border-light` 1px
- **캘린더**: Typography-driven, 컬러 박스/도트 금지

### 진입 애니메이션 (Staggered Reveal)
```css
.reveal { opacity: 0; transform: translateY(12px);
  animation: revealUp 0.5s var(--ease) forwards; }
.reveal-1 { animation-delay: 0ms; }
.reveal-2 { animation-delay: 50ms; }
/* ... 50ms 간격 */
```

---

## 15. 개발 순서 (권장)

### Phase 1: 코어 인프라
1. Supabase 프로젝트 세팅 + 테이블 생성 + RLS 정책
2. IndexedDB(Dexie) 세팅 + 데이터 스키마
3. Supabase Auth (Google OAuth) + 잠금 화면
4. 홈 화면 정적 UI (디자인 가이드 적용)

### Phase 2: 학습 세션 코어
5. 복습 카드 UI + 판정 (No/Hmm/Got it, 언어별) + SRS 로직
6. 신규 레슨 카드 UI + 해설 패널
7. 세션 흐름 (복습 → 레슨 → 완료 요약)
8. 세션 지속성 (자동 저장, 이어서 하기)
9. 학습 상태 영역 (스트릭 큰 숫자 + 마지막 학습 N일 전 텍스트 라벨, §7-4)

### Phase 3: 발음 분석
10. Supabase Edge Function: Azure 토큰 발급
11. Azure Speech SDK 연동: TTS + Pronunciation Assessment
12. 점수 팝업 애니메이션 (RPG 데미지 스타일)
13. 단어별 색상 하이라이트 + 음소 상세 피드백
14. (빈 슬롯 — Wave 11.68 마스코트 리액션 제거 정정)
15. 발화 카운트 분리 (총 발화 / 통과 발화)
16. 약점 음소 추적

### Phase 4: 콘텐츠 연동
17. Claude Code → Supabase INSERT 워크플로우 확립
18. 콘텐츠 미생성 시 폴백 (복습 전용 + 텍스트 안내, §5-2)

### Phase 5: 통계 + 부가기능
19. 주간 캘린더 (Typography-driven, 통과 발화 기준)
20. 월간 캘린더 + 발화 차트 (총 발화 / 통과 발화 이중 표시)
21. 문장 목록 보기
22. 자유 복습 모드
23. 스와이프 제스처

### Phase 6: 배포 + 동기화
24. IndexedDB ↔ Supabase 양방향 동기화
25. PWA (서비스워커, 매니페스트, 오프라인)
26. GitHub Pages 배포

---

## 16. 하지 않는 것 (명시적 제외)

- React/Vue 등 프레임워크 (바닐라 JS만)
- 학습 콘텐츠 하드코딩 (전량 Claude Code 생성)
- Web Speech API 발음 분석 (Azure SDK만 사용)
- UI 전체 다국어 전환 (UI는 한국어 고정, 학습 콘텐츠만 해당 언어)
- Claude API 자동 배치 생성 (Max 플랜 내 수동 트리거로 추가 비용 $0)
- Sentry 에러 모니터링 (console.error로 충분)
- 소셜/공유 기능
- 뱃지, 레벨, 경험치 (발음 점수 팝업 + §11-5 PR + §9-7 세션 카운터가 게이미피케이션 역할)
- **마스코트 (Clawd) 캐릭터 + 격려 메시지** (Wave 11.68 정정 — 동기부여는 숫자 변화 자체가 정본)
- 이모지
- 다크 모드 (v2 이후 검토)

---

## 17. 비용 요약

| 항목 | 월 비용 |
|---|---|
| Supabase (무료 티어) | $0 |
| Azure Speech (무료 5시간/월) | $0 (초과 시 STT 요금) |
| Claude Code (Max 플랜 내) | $0 (기존 구독) |
| GitHub Pages | $0 |
| **합계** | **$0** (Azure 무료 범위 내) |

> Azure Speech 무료 티어: 월 5시간 STT + 50만 문자 TTS.
> 하루 10문장 × 평균 3회 발화 × 30일 = 약 900회 ≈ 1~2시간. 충분.

---

## 18. 향후 확장 (v2+)

- 클로드 음성 모드 대화 연습 (일정 수준 도달 후)
- Cowork 연동 (안정화 후 전환)
- 다크 모드
- 소연 전용 학습 트랙 커스텀
- 문장 카드 내보내기 (Anki 호환)
- 콘텐츠 자동 생성 (Claude API 비용이 충분히 저렴해지면 Edge Function 크론 복원)
