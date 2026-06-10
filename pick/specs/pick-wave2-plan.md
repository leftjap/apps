# Pick Wave 2 플랜 — 추천 엔진 + 갈래 + 홈 피드 채움 + TMDB + 배포

> **상태: 아웃라인.** 상세 TDD 스텝은 **Wave 1 완료 + TMDB key 발급 + 추천 프롬프트 설계 확정 후** 작성한다(현 시점 단정 = 추측이므로 의도적으로 outline). 참조: `pick/specs/pick-app-spec.md`(§4 루틴·R3 갈래·D5 환각방지), `book/specs/feed-curation-routine.md`(인프라 미러 정본).

**Goal:** 별점을 주 1회(+수동) Claude가 읽어 **홈 메인 추천**과 **작품별 갈래**를 이유와 함께 생성·실재 검증해 저장하고, Wave 1의 빈 자리(Featured·트랙·갈래)를 채우며 §7 "분석 중→도착" 연출을 실 비동기로 동작시킨다.

**Architecture:** 추천 *생성*은 service_role 스케줄 태스크(앱 밖), 앱은 *표시*만(book 큐레이션 철학·spec D3). 환각은 TMDB(영화)·알라딘(책) 실재 검증으로 차단(D5).

---

## 선행조건 (지오)

- [ ] **TMDB API key 발급**(무료) — 루틴 영화 검증 + 인앱 영화 검색용. `~/.config/study/.env` 또는 repo secret에 저장(클라 번들 금지 — 루틴/서버만).
- [ ] Wave 1 완료(working 평가 루프 + Supabase 동기화).

---

## 단계 (각 항목은 Wave 1 완료 후 TDD 스텝으로 전개)

### A. 마이그 0002 — recommendations 갈래 차원
`pick_recommendations`에 추가(spec §4 R3):
```sql
alter table pick_recommendations add column kind text not null default 'home' check (kind in ('home','branch'));
alter table pick_recommendations add column source_work text;   -- 갈래의 출발 작품(외부 키 아님; title|external_id 식별자)
alter table pick_recommendations add column basis jsonb not null default '[]'::jsonb;  -- 홈 추천 근거 작품 id[]
create index if not exists pick_reco_owner_kind on pick_recommendations (owner_id, kind, source_work);
```
- Dexie `recommendations` 스토어 인덱스에 `kind`, `[owner_id+kind]` 추가(schema.js version 2). **지오 적용**(destructive 사전확인).

### B. `pick-weekly-reco` 스케줄 태스크
`~/.claude/scheduled-tasks/pick-weekly-reco/SKILL.md` (book feed-curation 미러). 주 1회 cron + 수동. owner별:
1. service_role로 `pick_ratings` 읽기(deleted 제외).
2. **취향 분석** — ★3.5+ positive 패턴 / 0.5★·≤2.0 negative(회피) 패턴(spec §4). 영화↔책 교차.
3. **추천 생성** — 평가작 제외, 비추 유사 후보 배제. ① 홈(heroFilm/heroBook/films[]/books[] + reason + basis[]) ② **작품별 갈래**(고별점 작품마다 {to, reason}[]).
4. **실재 검증(D5)** — TMDB search(영화)/알라딘 ItemSearch(책), 제목+연도 매칭. 실패=폐기. poster/메타/external_id 보강. **링크는 저장하되 앱은 외부 노출 안 함**(R2; link 컬럼은 메타로만).
5. `pick_recommendations` owner별 교체(새 batch_id) — kind=home + kind=branch(source_work).
6. 검증 로그 — 추천 수>0, 폐기(환각) 건수.

### C. 홈 피드 채움 (`features/home.js`)
Wave 1 빈 상태 → 저장 추천 표시. `design-ref/source/app/home.jsx` 마크업으로 **Featured**(오늘의 추천, 영역 전체 클릭 + Basis `↳`) + **트랙 2분할**(다음에 볼 영화/읽을 책, `.rec` 행) 구현. 세그먼트 필터로 Featured/트랙 종류 전환. Basis 칩 클릭→근거 작품 상세(stopPropagation).

### D. 상세 갈래 채움 + 분석 연출 (`features/detail.js`)
- `.branches` 빈 상태 → kind=branch(source_work=현재작) 인덱스 카탈로그(`design-ref/source/app/detail.jsx`: `01/02/03` 인덱스 + 포스터 48 + 제목 + 이유). 행 클릭=`branchTo(id)`(경로 push, trail).
- **§7 연출(실 비동기)**: `setRating` 시 `analyzing`(상세=작품id / 홈='home') → 갈래·Featured 자리 **스켈레톤**(`.sk`/`.branch--skel`) + 헤더 `● 평가를 반영해 다시 고르는 중…`(코랄 펄스). **백엔드 재생성 신호**(루틴 수동 트리거 또는 다음 배치 대기 안내)로 전환 — 가짜 타이머 금지(spec §4).

### E. 검색 TMDB 영화 합류 (`features/search.js`)
Wave 1 로컬+알라딘 → TMDB 영화 검색 추가(타입=전체/영화). 신규 영화도 검색→상세→평가 가능(CSV 의존 축소). 영화 메타(poster/감독/연도) TMDB 보강.

### F. 배포
`.github/workflows/deploy-pages.yml`에 pick 빌드 step 추가(study/gym/today/book 패턴). PWA 매니페스트·SW 확인. base `/apps/pick/`.

---

## Wave 2 완료 기준
1. 루틴 1회 실행 → owner별 홈 추천 + 작품별 갈래 저장, 환각 0(검증 통과분만).
2. 홈 Featured·트랙 + 상세 갈래가 이유와 함께 표시(외부 링크 0).
3. 별점 변경 → 분석 중 연출 → 재생성분 교체.
4. 검색에서 TMDB 영화 신규 평가 가능.
5. `deploy-pages.yml`로 `/apps/pick/` 배포.
