# pick — 별점 기반 영화·책 추천 PWA 설계서

> 작성일 2026-06-03. 갱신 2026-06-05 (디자인 핸드오프 반영). 상태: **하이파이 디자인 확정, 구현 전.**
> 대상: 구현 세션 Claude (로컬).
> 스택 근거: study/gym/today/book 4앱 실측 패턴 (`book/specs/book-port-spec.md` §0 동일 확인분).
> 한 줄 요약: 내가 별점 평가한 영화(왓챠피디아)·책(앱 입력)을 Claude가 주 1회 읽고, 다음에 볼/읽을 작품을 이유와 함께 추천하는 개인용 PWA.
> 디자인 **정본**: `pick/design-ref/` (Claude Design 하이파이 핸드오프) — `README.md`(작업지시서) + `source/`(pick.html 토큰·CSS, app/*.jsx 컴포넌트). `pick-design-brief.md`는 입력 브리프(역사적). UI·토큰·클래스 수치는 design-ref가 정본.

---

## 0. 확정 결정 (Decided — 재논의·위임 없음)

브레인스토밍에서 사용자가 직접 선택한 결정들. 구현 세션은 그대로 실행한다.

- **D1 — 새 독립 PWA.** 경로 `~/apps/pick/`, 배포 `/apps/pick/`, dev `5177` / preview `4177` (strictPort). 4앱과 동일 스택: 바닐라 JS(ES Modules) + Vite 6 + vite-plugin-pwa(autoUpdate) + @supabase/supabase-js + Dexie + Vitest + Playwright. (React 아님 — 4앱 모두 바닐라.)
- **D2 — 입력 두 축 + 별점 척도.** 영화 = **왓챠피디아 CSV import**, 책 = **앱에서 직접 별점**. 척도는 **0.5~5.0 (0.5 단위, 10단계)** 로 영화·책 통일(왓챠와 동일 → 변환 0, StoryGraph급 세밀도로 강도 포착). 별점에 **의미 앵커 라벨**을 표시해 "중간값이 호인지 불호인지 모호" 문제를 제거한다:

  | 별점 | 라벨 |
  |---|---|
  | ★0.5 | **비추** (다시·남에게 권하지 않음) |
  | ★1.0~2.0 | 별로 |
  | ★2.5~3.0 | 보통 |
  | ★3.5~4.0 | 추천 |
  | ★4.5~5.0 | 최애 (인생작) |

  **최저 = 비추**는 UX(0.5★ 라벨)와 알고리즘(부정 신호 — §4) 양쪽에서 확정한다. 근거: 넷플릭스/HBR 연구상 5점 별점은 평균 뭉침·중간값 모호 문제가 있으나, pick 는 *행동 데이터 없는 단일 사용자* 라 별점이 유일 신호 → 강도를 담는 별점 유지가 타당하고, 모호성은 앵커 라벨로 해소. (이진 좋아요/싫어요는 강도를 못 담아 제외.)

  > **표시 갱신 (2026-06-05, §3 R5)**: 위 중간 라벨(별로/보통/추천/최애)은 디자인 핸드오프 UI가 표시하지 않음 — 숫자값(0.5단위) + 0.5★ "비추"만 노출(디자인 §3·`design-ref/source/app/ui.jsx` StarRating). **척도·비추=최저 정체성은 유지**, 중간 라벨만 미표시. `ratingLabel()`은 보조 유틸로만 보존.
- **D3 — 추천 엔진 = Claude Code scheduled task** (주 1회 + 수동 실행). `book/specs/feed-curation-routine.md` 인프라를 미러. service_role 로 `pick_ratings` 를 읽어 Claude 가 추천을 생성·저장하고, **앱은 저장된 추천만 빠르게 표시**(생성 로직을 앱에 두지 않음).
- **D4 — 데이터 개인 격리.** geo-apps Supabase 재사용, 테이블 prefix `pick_`. RLS = **owner 본인 row 만**. (book/today 의 "부부 공유" 와 다름 — 추천은 개인 취향이라 안 섞는다.) 인증은 기존 Google OAuth + `ALLOWED_EMAILS`(지오·소연) 재사용, 각자 자기 데이터·자기 추천.
- **D5 — 환각 방지 필수.** Claude 가 생성한 추천작은 **TMDB(영화)·알라딘(책) 조회로 실재 검증을 통과한 것만 채택**. 포스터·연도·감독/저자 등 메타도 검증 소스에서 보강. 매칭 실패작은 폐기.

---

## 1. 데이터 흐름

```
[입력]                          [엔진 — 주 1회 Claude 루틴]                 [출력]
영화: 왓챠 CSV 업로드  ─┐
                        ├─→ pick_ratings ─→ ① Claude 가 별점 전체 읽기
책: 앱에서 ★ 매기기   ─┘                     ② 취향 분석 + 추천+이유 생성(교차 추천 포함)
                                             ③ TMDB/알라딘 실재 검증·메타 보강
                                             ④ pick_recommendations 교체 ─→ 추천 화면
```

추천 **생성**은 무거우니 루틴이 미리 만들어 저장하고, 앱은 표시만 한다 (book 큐레이션과 동일 철학).

---

## 2. 데이터 모델

### 2.1 Supabase (마이그레이션 `0001_pick_init.sql`)

**`pick_ratings`** — 내 별점 (영화+책)

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

**`pick_recommendations`** — Claude 추천 스냅샷 (루틴이 교체)

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

### 2.2 Dexie 오프라인 미러 (`createPickDB`)

스토어 `ratings`, `recommendations`. 사용자별 DB 이름 격리(`pick_<hash>`), `pending_sync` 큐 + `sync.js` reconcile — 4앱 패턴 답습.

---

## 3. 화면 (hash 라우터, `app.js`) — 디자인 핸드오프 정본

전역 셸: 상단바(브랜드 + 검색 큐 + 계정 아바타) + `.stage` 컨테이너 (디자인 §4). **핵심 화면 둘**(홈·작품 상세) + 검색 오버레이(1급).

1. **`#/` 홈 (메인 추천 피드)** — 디자인 §5. 중앙 인트로(인사 + "평가한 N편 취합") + 세그먼트 필터(전체/영화/책) → 오늘의 추천 Featured → 영화/책 **트랙 2분할** → 최근 평가 스트립. 추천이 비면(콜드스타트·엔진 전) 빈 상태로 평가 유도. **추천 생성은 Wave 2 엔진**, 홈은 저장된 추천만 표시.
2. **`#/w/:id` 작품 상세 (허브) ★최우선** — 디자인 §6. 2열 그리드(좌 사이드바: 포스터 + 정보 dl + **내 평가 ratebox** / 우 본문: 헤더 + **줄거리**(앱 내 소비) + **갈래**). 갈래 = 이 작품에서 이어지는 다른 작품(작품별 추천, Wave 2 엔진). 갈래 클릭 = 가지치며 이동(경로 스택 + 브레드크럼 `.trail`). **별점은 여기 ratebox에서 매긴다.**
3. **검색 오버레이 (1급, 라우트 아님)** — 디자인 §8. ⌘K/`/`/검색 큐로 열기, Esc 닫기. 타입 필터(전체/영화/책). 결과 = 내가 평가한 작품 + **알라딘 책 검색**(신규 책 추가용; **영화 검색은 Wave 2 TMDB**). 클릭 = 상세로 이동(평가 입구).
4. **`#/import` 가져오기 (유틸)** — 왓챠 CSV 파일 선택/붙여넣기 → 파싱 미리보기(건수·중복) → 저장. 디자인에 화면은 없으나 **영화 벌크 입력 경로로 유지**(계정 메뉴 "평가 가져오기" 진입). 영화는 TMDB(Wave 2) 전까지 CSV가 유일 입력.

> **R2 외부 링크 없음**: 추천·상세에서 왓챠·알라딘·OTT로 내보내는 링크 없음. 줄거리·메타를 앱 안에서 소비(디자인 §9). — 구 §3의 "왓챠/알라딘에서 보기" 링크 폐기.
> **R5 별점 표시**: ratebox·검색·최근은 디자인 StarRating(0.5단위 clip-path, 값 `4.5` + 0.5★=**비추** danger 칩)을 따른다(§0 D2 표시 갱신 참조).

---

## 4. 추천 루틴 (`pick-weekly-reco`)

- Claude Code scheduled task, **주 1회** (cron). `~/.claude/scheduled-tasks/pick-weekly-reco/SKILL.md`.
- 단계:
  1. service_role(`~/.config/study/.env`)로 owner별 `pick_ratings` 읽기 (deleted 제외).
  2. **취향 분석** — 고별점(★3.5+) 작품의 장르·주제·톤 패턴 추출(**positive 신호**). **비추(0.5★)·저별점(★2.0 이하)은 부정 신호** — 그 작품의 패턴을 회피 대상으로 추출(**negative 신호**). 영화↔책 양방향 교차 추천 포함.
  3. **추천 후보 생성** — 이미 평점 있는 작품 제외. **비추·저별점 작품과 유사한 후보는 배제·감점.** 영화/책 각 N개(제목+연도+이유). (왓챠 import 영화도 최저점 ≤1.0 을 비추로 해석해 동일 적용.)
  4. **실재 검증** — TMDB search(영화)/알라딘 ItemSearch(책). 제목+연도 매칭 실패 = 폐기. 매칭분에 poster/메타/link 부착.
  5. `pick_recommendations` owner별 **교체**(새 batch_id).
  6. 검증 — 추천 수 > 0, 폐기(환각) 건수 로그.
- **수동 실행** — 별점을 많이 바꾼 직후 로컬에서 같은 스크립트 실행.

> **R3 갈래(branches) 추가 (2026-06-05)**: 엔진은 홈 메인 추천뿐 아니라 **작품별 갈래**(상세 §6 "이 작품에서 이어지는 갈래")도 생성한다. 홈 reco = `{heroFilm, heroBook, films[], books[]}`(각 `{to, reason, basis[]}`), 갈래 = source_work별 `{to, reason}[]`. 같은 `pick_recommendations`에 `kind`(`home`|`branch`) + `source_work`(갈래 출발 작품) + `basis`(jsonb, 홈 근거 작품 id) 차원을 추가 — **마이그 0002(Wave 2)**. Wave 1의 0001은 ratings 중심, recommendations는 미사용.
> **분석 연출 (디자인 §7)**: 별점 변경 시 추천은 즉시 아님 — 앱은 "분석 중 → 곧 도착"(스켈레톤 + 코랄 펄스)을 보이고, 다음 배치(또는 수동 실행) 재생성분으로 교체. **가짜 타이머가 아니라 실제 비동기 재생성 상태를 정직하게 연출**(낙관적 즉시 반영 금지).

---

## 5. 왓챠 CSV 수급

- 사용자가 [erinyskim/watchapedia-export](https://github.com/erinyskim/watchapedia-export) 북마클릿으로 CSV 추출(평가 **전체공개** 필요).
- CSV 컬럼: content id, 영/한 제목, 타입(MOVIE/TV), 연도, 감독, 본 날짜, 평점(5점 척도), 리뷰.
- 매핑: 한국어 제목·연도·평점 → `pick_ratings`(media_type=`movie`, source=`watcha`). **1차는 CSV 의 `MOVIE` 행만 가져오고 `TV`(드라마/시리즈) 행은 제외**(범위 단순화 — 후순위에서 `tv` 타입 추가 가능). 평점은 그대로(이미 0.5~5). TMDB external_id 는 import 시 미보강 → 루틴 4단계에서 매칭.
- **리스크**: 비공식 스크립트라 왓챠 구조 변경에 취약. fallback = 동일 컬럼의 CSV 수동 작성 양식 제공(import 파서는 양식만 의존).

---

## 6. 환각 방지 (실재 검증)

- 루틴 4단계가 핵심. 외부 키: **TMDB API key**(신규 발급 필요 — 무료), **알라딘 TTBKey**(book 앱이 이미 보유 → 재사용).
- 제목 정규화 후 매칭, 연도 일치 우선. 동명 다수면 인기도/연도로 1건 확정. 미매칭은 추천에서 제외(앱에 환각 노출 0).

---

## 7. 앱 메타·배포

- `vite.config.js`: base `/apps/pick/`(GH_PAGES 시), strictPort dev 5177/preview 4177, PWA.
- `.github/workflows/deploy-pages.yml` 에 pick 빌드 step 추가.
- `.env.local`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. (TMDB key 는 클라가 아니라 **루틴에서만** 사용 → 번들 불포함. 알라딘 TTBKey 는 책 검색에 필요 → book 의 호출 방식 그대로 따름, 구현 시 `book/src/db/aladin.js` 확인.)
- **W0 선행 액션**: geo-apps Google OAuth 클라이언트 redirect URI 에 `http://localhost:5177` 등록(미등록 시 redirect_uri_mismatch — today 5175 교훈).

---

## 8. 의도적 제외 (YAGNI — 1차 범위 밖)

OTT 실시간 가용성(넷플릭스/티빙 등), 예상 별점 수치, 통계 대시보드, 부부 취향 비교, 추천 dismiss/히스토리. 핵심 가치(별점→추천)부터 완성.

---

## 9. 리스크·구현 시 확인 사항

- 왓챠 export 스크립트 실제 동작 여부 — 구현 시 사용자 계정으로 실측.
- TMDB API key 발급 — 사용자 확인 후 진행(외부 서비스).
- 알라딘 검색을 pick 에서 호출하는 정확한 방법 — `book/src/db/aladin.js` 읽고 재사용 패턴 확정.
- **콜드 스타트**: 책 별점이 처음엔 0 → 책 추천은 영화 취향 교차로 시작, 책 별점이 쌓이면 정밀화.
- **디자인 이식 (D1 유지)**: UI는 React 프로토타입(`design-ref/source`)을 **바닐라 JS로 포팅**. `pick.html`의 토큰·클래스 그대로(`pick.css`), `ui.jsx`/`home.jsx`/`detail.jsx`/`main.jsx` 로직을 `el` 기반으로 재구성. `tweaks-panel.jsx`는 시안 전용 → **제외**(디자인 §12 기본값만 채택: accent `#d97757`, 읽는 본문 sans, 밀도 regular, 이유 강조 regular).
- **검색 소스**: 검색 오버레이 = 로컬 평가 작품 + 알라딘 책 검색(신규 추가). 영화 인앱 검색은 TMDB(Wave 2). 디자인 `main.jsx` SearchOverlay는 `window.PICK.list`만 검색 → pick는 라이브 알라딘/TMDB를 합류.
