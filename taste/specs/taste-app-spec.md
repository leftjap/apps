# taste — 별점 기반 영화·책 추천 PWA 설계서

> 작성일 2026-06-03. 상태: **설계 합의 완료, 구현 전.**
> 대상: 구현 세션 Claude (로컬).
> 스택 근거: study/gym/today/book 4앱 실측 패턴 (`book/specs/book-port-spec.md` §0 동일 확인분).
> 한 줄 요약: 내가 별점 평가한 영화(왓챠피디아)·책(앱 입력)을 Claude가 주 1회 읽고, 다음에 볼/읽을 작품을 이유와 함께 추천하는 개인용 PWA.

---

## 0. 확정 결정 (Decided — 재논의·위임 없음)

브레인스토밍에서 사용자가 직접 선택한 결정들. 구현 세션은 그대로 실행한다.

- **D1 — 새 독립 PWA.** 경로 `~/apps/taste/`, 배포 `/apps/taste/`, dev `5177` / preview `4177` (strictPort). 4앱과 동일 스택: 바닐라 JS(ES Modules) + Vite 6 + vite-plugin-pwa(autoUpdate) + @supabase/supabase-js + Dexie + Vitest + Playwright. (React 아님 — 4앱 모두 바닐라.)
- **D2 — 입력 두 축.** 영화 = **왓챠피디아 CSV import**, 책 = **앱에서 직접 별점**. 별점 척도는 **0.5~5.0 (0.5 단위)** 로 통일(왓챠와 동일 척도 → 변환 불필요).
- **D3 — 추천 엔진 = Claude Code scheduled task** (주 1회 + 수동 실행). `book/specs/feed-curation-routine.md` 인프라를 미러. service_role 로 `taste_ratings` 를 읽어 Claude 가 추천을 생성·저장하고, **앱은 저장된 추천만 빠르게 표시**(생성 로직을 앱에 두지 않음).
- **D4 — 데이터 개인 격리.** geo-apps Supabase 재사용, 테이블 prefix `taste_`. RLS = **owner 본인 row 만**. (book/today 의 "부부 공유" 와 다름 — 추천은 개인 취향이라 안 섞는다.) 인증은 기존 Google OAuth + `ALLOWED_EMAILS`(지오·소연) 재사용, 각자 자기 데이터·자기 추천.
- **D5 — 환각 방지 필수.** Claude 가 생성한 추천작은 **TMDB(영화)·알라딘(책) 조회로 실재 검증을 통과한 것만 채택**. 포스터·연도·감독/저자 등 메타도 검증 소스에서 보강. 매칭 실패작은 폐기.

---

## 1. 데이터 흐름

```
[입력]                          [엔진 — 주 1회 Claude 루틴]                 [출력]
영화: 왓챠 CSV 업로드  ─┐
                        ├─→ taste_ratings ─→ ① Claude 가 별점 전체 읽기
책: 앱에서 ★ 매기기   ─┘                     ② 취향 분석 + 추천+이유 생성(교차 추천 포함)
                                             ③ TMDB/알라딘 실재 검증·메타 보강
                                             ④ taste_recommendations 교체 ─→ 추천 화면
```

추천 **생성**은 무거우니 루틴이 미리 만들어 저장하고, 앱은 표시만 한다 (book 큐레이션과 동일 철학).

---

## 2. 데이터 모델

### 2.1 Supabase (마이그레이션 `0001_taste_init.sql`)

**`taste_ratings`** — 내 별점 (영화+책)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | uuid pk | |
| owner_id | uuid | `auth.uid()` |
| media_type | text | `'movie'` \| `'book'` |
| title | text | |
| year | int null | |
| external_id | text null | TMDB id(영화) / ISBN13(책) — 검증 후 채움 |
| rating | numeric(2,1) | 0.5~5.0 |
| source | text | `'watcha'` \| `'app'` |
| rated_at | timestamptz null | 왓챠 "본 날짜" 보존 |
| meta | jsonb | poster_url, director/author, genres[], original_title |
| created_at / updated_at / deleted_at | timestamptz | soft delete |

유니크: `(owner_id, media_type, title, year)` — import 중복·재평가 upsert 키.

**`taste_recommendations`** — Claude 추천 스냅샷 (루틴이 교체)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | uuid pk | |
| owner_id | uuid | |
| media_type | text | `'movie'` \| `'book'` |
| title | text | |
| year | int null | |
| external_id | text null | 검증된 TMDB id/ISBN |
| reason | text | 추천 이유(자연어) |
| poster_url | text null | |
| link | text null | 왓챠피디아/알라딘 상세 URL |
| batch_id | text | 생성 회차(`YYYY-MM-DD`) |
| generated_at | timestamptz | |

RLS(두 테이블 공통): `owner_id = auth.uid()` 인 row 만 select/insert/update/delete.

### 2.2 Dexie 오프라인 미러 (`createTasteDB`)

스토어 `ratings`, `recommendations`. 사용자별 DB 이름 격리(`taste_<hash>`), `pending_sync` 큐 + `sync.js` reconcile — 4앱 패턴 답습.

---

## 3. 화면 (hash 라우터, `app.js`)

1. **`#/` 추천 (홈)** — 영화/책 추천 카드 그리드. 카드 = 포스터/표지 + 제목 + **추천 이유** + "왓챠/알라딘에서 보기" 링크. 상단 필터(전체/영화/책). 추천 비었을 때 빈 상태 안내(별점부터 입력 유도).
2. **`#/ratings` 내 평점** — 탭(영화/책). 영화 = 왓챠 import 목록(읽기·삭제), 책 = **알라딘 검색**(book `aladin.js` 재사용)으로 작품 찾아 ★ 매기기·수정·삭제.
3. **`#/import` 가져오기** — 왓챠 CSV 파일 선택 또는 붙여넣기 → 파싱 미리보기(건수·중복) → 저장.

---

## 4. 추천 루틴 (`taste-weekly-reco`)

- Claude Code scheduled task, **주 1회** (cron). `~/.claude/scheduled-tasks/taste-weekly-reco/SKILL.md`.
- 단계:
  1. service_role(`~/.config/study/.env`)로 owner별 `taste_ratings` 읽기 (deleted 제외).
  2. **취향 분석** — 고별점 작품의 장르·주제·톤 패턴 추출. 영화 취향 → 책 교차 추천, 책 취향 → 영화 교차 추천 포함.
  3. **추천 후보 생성** — 이미 평점 있는 작품 제외. 영화/책 각 N개(제목+연도+이유).
  4. **실재 검증** — TMDB search(영화)/알라딘 ItemSearch(책). 제목+연도 매칭 실패 = 폐기. 매칭분에 poster/메타/link 부착.
  5. `taste_recommendations` owner별 **교체**(새 batch_id).
  6. 검증 — 추천 수 > 0, 폐기(환각) 건수 로그.
- **수동 실행** — 별점을 많이 바꾼 직후 로컬에서 같은 스크립트 실행.

---

## 5. 왓챠 CSV 수급

- 사용자가 [erinyskim/watchapedia-export](https://github.com/erinyskim/watchapedia-export) 북마클릿으로 CSV 추출(평가 **전체공개** 필요).
- CSV 컬럼: content id, 영/한 제목, 타입(MOVIE/TV), 연도, 감독, 본 날짜, 평점(5점 척도), 리뷰.
- 매핑: 한국어 제목·연도·평점 → `taste_ratings`(media_type=`movie`, source=`watcha`). **1차는 CSV 의 `MOVIE` 행만 가져오고 `TV`(드라마/시리즈) 행은 제외**(범위 단순화 — 후순위에서 `tv` 타입 추가 가능). 평점은 그대로(이미 0.5~5). TMDB external_id 는 import 시 미보강 → 루틴 4단계에서 매칭.
- **리스크**: 비공식 스크립트라 왓챠 구조 변경에 취약. fallback = 동일 컬럼의 CSV 수동 작성 양식 제공(import 파서는 양식만 의존).

---

## 6. 환각 방지 (실재 검증)

- 루틴 4단계가 핵심. 외부 키: **TMDB API key**(신규 발급 필요 — 무료), **알라딘 TTBKey**(book 앱이 이미 보유 → 재사용).
- 제목 정규화 후 매칭, 연도 일치 우선. 동명 다수면 인기도/연도로 1건 확정. 미매칭은 추천에서 제외(앱에 환각 노출 0).

---

## 7. 앱 메타·배포

- `vite.config.js`: base `/apps/taste/`(GH_PAGES 시), strictPort dev 5177/preview 4177, PWA.
- `.github/workflows/deploy-pages.yml` 에 taste 빌드 step 추가.
- `.env.local`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. (TMDB key 는 클라가 아니라 **루틴에서만** 사용 → 번들 불포함. 알라딘 TTBKey 는 책 검색에 필요 → book 의 호출 방식 그대로 따름, 구현 시 `book/src/db/aladin.js` 확인.)
- **W0 선행 액션**: geo-apps Google OAuth 클라이언트 redirect URI 에 `http://localhost:5177` 등록(미등록 시 redirect_uri_mismatch — today 5175 교훈).

---

## 8. 의도적 제외 (YAGNI — 1차 범위 밖)

OTT 실시간 가용성(넷플릭스/티빙 등), 예상 별점 수치, 통계 대시보드, 부부 취향 비교, 추천 dismiss/히스토리. 핵심 가치(별점→추천)부터 완성.

---

## 9. 리스크·구현 시 확인 사항

- 왓챠 export 스크립트 실제 동작 여부 — 구현 시 사용자 계정으로 실측.
- TMDB API key 발급 — 사용자 확인 후 진행(외부 서비스).
- 알라딘 검색을 taste 에서 호출하는 정확한 방법 — `book/src/db/aladin.js` 읽고 재사용 패턴 확정.
- **콜드 스타트**: 책 별점이 처음엔 0 → 책 추천은 영화 취향 교차로 시작, 책 별점이 쌓이면 정밀화.
