# best — 커뮤니티 인기글 아카이브 · 앱 스펙

> 2026-07-10 확정. 측정 근거·검증 이력은 `best/handoff/best-design-2026-07-10.md`(로컬 전용) 참조.
> 이 문서는 spec 1(수집 파이프라인)만 확정 상태이며, spec 2(정제 엔진)·spec 3(리더 앱)은 자리만 잡아 둠.

## 0. 개요

온라인 커뮤니티 인기글을 하루 1회 수집해 영구 보관하고, Opus 가 같은 이슈끼리 묶어 일/주/월/연 단위로 보여주는 개인용 PWA. 기존 서비스(AAGAG 24시간, 이슈링크 14일)의 시간창 한계를 넘는 것이 목적.

| 항목 | 결정 |
|---|---|
| 실행 | `~/.claude/scheduled-tasks/best-daily/SKILL.md` (cron, 로컬 머신, 하루 1회) |
| 모델 | Opus 단독 (정제 단계). 수집은 모델 불필요 |
| 저장 | 별도 Supabase 무료 프로젝트. 자격증명 `~/.config/best/.env` (chmod 600) |
| 비용 | 0원 (구독 Claude Code, Anthropic API 유료 호출 없음) |
| 필터 | 수집은 전부 저장(`is_ad` 플래그 포함), **리더는 광고 행을 항상 제외** (2026-07-10 사용자 결정) |
| repo | `leftjap/apps` 는 PUBLIC — 스크랩 데이터(픽스처 포함) 커밋 금지. `best/fixtures/` gitignore |

**앱 성격 (2026-07-10 사용자 확정)**: 목록 메타(제목·조회수·댓글·시각·원문링크)만 수집하는 **링크 애그리게이터**. 본문 콘텐츠는 긁지도 저장하지도 않는다. 행 클릭 = 원문 사이트로 이동. **카테고리/태깅 없음**(시안의 카테고리 UI 는 폐기). 접근은 **구글 로그인 게이트**(기존 앱들과 동일 방식) — 비로그인 열람 불가.

## 1. 데이터 소스 — B′ 전략 (2026-07-10 사용자 확정)

**이슈링크 주(主) + 직접 크롤 2곳(디시 dcbest·보배 best) 패치.** 디시 포함은 사용자 결정
(디시 robots 가 `User-agent:*` 에는 dcbest 허용이나 ClaudeBot·anthropic-ai·Claude-Web 를 명시 차단함을 고지한 상태에서 승인).

### 1-1. 이슈링크

```
URL   https://www.issuelink.co.kr/community/listview/<site>/<hours>/<sort>/_self/blank/[blank/blank/<page>]
      robots: User-agent:* / Allow:/  (전문 2줄)
수집  8사이트 × 24h × read(조회순) 상위 2페이지 = 사이트당 최대 200건
필드  순위·제목(class="title")·댓글수(<small>)·조회수(class="hit")·초단위 게시시각·go 링크
원문  /community/go/<site>/<id> → HTTP 307 → 원문 URL. 수집 시 리다이렉트 실행 금지(go URL 저장)
```

**수집 범위 (2026-07-11 사용자 확정 — 시안의 9개 커뮤만)**: 디시(직접) + 보배(직접+이슈링크) + 이슈링크 8곳(bobae·clien·humoruniv·ppomppu·ruliweb·slr·theqoo·todayhumor). **제외 7곳**: 82cook·etoland·fmkorea(에펨코리아)·instiz(인스티즈)·inven·mlbpark(엠팍)·ygosu — 복구는 `collect.mjs` 의 `IL_SITES` 배열에 슬러그 추가면 끝(아래 표의 측정값은 보존). 하루 볼륨 ≈ 2,050건 (2026-07-10 실측 사이트별 합산 기준).

사이트별 미러 판 (리다이렉트 표본 실측, 2026-07-10):

| site | 미러 판 | 비고 |
|---|---|---|
| bobae | strange·freeb·politic·accident | **humor(신유머/이슈/움짤) 결손 → 직접 크롤로 패치** (§1-2). go ID 접두사 = 판: 1000→accident, 3000→freeb, 4000→politic, 695x→strange |
| ruliweb | 300148(정치유게) 편중 + 300143(유게잡담) | 게임·서브컬처 결손 수용 (표본 26건 기준) |
| theqoo | square 원판 | hot 큐레이션 아님 — 백분위로 근사 |
| instiz | pt(이슈) | 직접 크롤 대상과 동일 판 |
| clien | park(모두의공원) | 직접 크롤은 robots `Disallow: /*?*` 로 불가 — 이슈링크가 유일 경로 |
| mlbpark | bullpen(불펜) | 직접 크롤 robots 금지 — 이슈링크가 유일 경로 |
| humoruniv | pds(웃긴자료) | 직접 크롤 기술적 불가(목록이 정적 HTML 에 없음) |
| slr | free(자유) | 직접 크롤 robots 금지 |
| inven | webzine/2097(오픈이슈갤) | |
| etoland | etohumor07(유머) | |
| 82cook | entiz bn=15(자유) | |
| ppomppu | freeboard·humor·tour | 핫딜·포인트글 섞임 → 광고 정규식 (§3-3) |
| todayhumor | sisa 편중 + humordata | 시사 4/5 표본. 유머 보강 원하면 humorbest 직접 크롤 추가 가능(하루 1p, robots Allow) — 미결 |
| fmkorea | 판 미상 (원문 URL 이 bare ID) | 직접 확인 불가(이 집 IP 430 차단) — board=null 로 수집 |
| ygosu | food·yeobgi 등 커뮤판 | 표본 2건뿐 — 저볼륨 |

### 1-2. 직접 크롤 2곳

| | URL | robots (실측 2026-07-10) | 분량 |
|---|---|---|---|
| 디시 실베 | `gall.dcinside.com/board/lists/?id=dcbest&page=N` | `User-agent:*` Allow, 차단 갤러리 목록에 dcbest 없음. AI 봇(ClaudeBot 등) 명시 차단 — 사용자 고지 후 포함 결정 | p1~3, 51행/p(공지·설문 포함, 파서에서 제외 — 픽스처 `dc_p1.html` 실측), 정적 HTML |
| 보배 베스트 | `bobaedream.co.kr/board/bulletin/list.php?code=best&page=N` | `User-agent:*` `Allow: /` | p1~15, 30행/p, `<td class="category">` 에 원본 게시판 |

보배 직접 크롤과 이슈링크 bobae 는 겹친다(strange·freeb 등) → 중복 제거는 §3-2.

### 1-3. 배제·보류

- **AAGAG(애객)**: Cloudflare 챌린지로 자동화 불가 + robots `/mirror`·`/deal` Disallow + AI 봇 명시 차단. 배제.
- **오유 humorbest·루리웹 humor_only 직접 크롤**: 결손 보강용 선택지로 보류 (스코프 확장은 사용자 지시 시).

## 2. 스키마 (Supabase, 별도 무료 프로젝트)

```sql
create table best_posts (
  id           bigint generated always as identity primary key,
  collected_on date not null,              -- 수집일 (KST)
  source       text not null,              -- 'issuelink' | 'dcbest' | 'bobae'
  site         text not null,              -- 커뮤니티 슬러그. 디시='dcinside', 보배 직접='bobae'
  board        text,                       -- 판별 가능 시 (보배 접두사·직접 크롤 카테고리). 불명이면 null
  post_key     text not null,              -- 원문 식별자: 이슈링크 go ID / dcbest no / 보배 No
  title        text not null,
  url          text not null,              -- 이슈링크 go URL 또는 원문 URL
  views        int,
  comments     int,
  posted_at    timestamptz,                -- 이슈링크 초단위 / 직접 크롤 파싱값
  percentile   numeric,                    -- 사이트 내 조회수 백분위 (수집 풀 기준, 산수)
  is_ad        boolean not null default false,
  unique (site, post_key)
);

create table best_ingest_log (
  id       bigint generated always as identity primary key,
  run_on   date not null,
  source   text not null,
  site     text not null,
  pages    int,
  rows     int,
  status   text not null,                  -- 'ok' | 'http_4xx' | 'parse_zero' | 'error'
  detail   text
);
```

- raw(`best_posts`)는 롤링(보관 기간은 첫 달 증가 속도 보고 결정), digest(spec 2)는 영구.
- `unique(site, post_key)` upsert 로 소급 수집·재실행 시 중복 방지.

## 3. 수집 파이프라인 규칙

### 3-1. 크롤 예절·안전
- **호스트 라운드로빈** + 요청 간 0.5~1s. UA 는 일반 브라우저 문자열.
- **4xx(특히 430) 감지 시 그 사이트 즉시 중단, 자동 재시도 금지** (펨코 사례 — 차단은 상태로 남고 재시도가 악화).
- 파서별 수집 건수를 `best_ingest_log` 에 기록. 직전 7일 중앙값 대비 0건이면 앱 상단 배너. 조용한 실패 금지.
- 결손일 감지 시 이슈링크 `336`(14일) 창으로 소급 복구 (실측: p160 에도 100행, 날짜 전 구간 분포).

### 3-2. 중복 제거
- 사이트 내: `unique(site, post_key)` + 수집 중 페이지 겹침은 첫 등장(상위 순위) 우선.
- post_key 네임스페이스: 이슈링크 bobae = `판코드:원본No`(go ID = 5자리 판 접두사 + 7자리 No, 실측), 보배 직접 = `best:No`, 그 외 = go ID / 원문 no.
- **보배 직접 ↔ 이슈링크 크로스소스 숫자 대응은 불가** (2026-07-10 픽스처 실측: best 목록 No 는 원본판 No 와 다른 자체 채번 — ~100만대 vs ~340만대). 콘텐츠 중복은 정제 엔진(spec 2)의 클러스터링이 흡수.

### 3-3. 광고 제거 (정규식, AI 불필요)
초안: `^\[?(AD\b|쿠폰|쿠팡|핫딜|네이버페이|네페|무료나눔|아직 엄카)` — 여는 대괄호 옵션 필수
(2026-07-10 실측: 구 정규식은 `[네이버페이]…` 3/4 미스). **완전성 미검증 — 픽스처 테스트로 확정하고 수집 데이터로 튜닝.**
매치 행은 `is_ad=true` 로 저장(하드 삭제 안 함).

### 3-4. 백분위
- 사이트별 수집 풀 내 조회수 백분위 (산수). 더쿠 등 추천수 없는 사이트 문제없음 — 조회수 단독 축.
- 이슈링크 조회수는 스냅샷(글별 갱신 시점 상이, 이전 세션 실측 +1,788 편차 사례) — 백분위 용도 충분성은 추론. 첫 달 데이터로 점검.

## 4. 테스트 전략 (test-first)

- **파서는 픽스처 스냅샷 테스트를 먼저 쓴다.** 사이트 개편이 주된 고장 원인.
- 픽스처: `best/fixtures/2026-07-10/` (실크롤 HTML 29파일, gitignore — 공개 repo 커밋 금지).
- 테스트 러너: `pnpm vitest run` (watch 금지 — freeze).
- 파서별 최소 케이스: 행 수 일치 / 제목·조회수·시각 필드 추출 / 광고 정규식 매치·비매치 / 보배 카테고리 셀 / dcbest 공지·설문 행 제외.

## 5. 이후 스펙

- **spec 2 — 정제 엔진 (2026-07-10 사용자 결정으로 축소)**: **태깅 폐기**(카테고리 UI 제거로 용도 소멸). **클러스터링(같은 이슈 묶기)은 보류** — 제목만으로 가능해 소급 적용 여지는 남음. 일/주/월/연은 기간 필터 + 백분위 상위(산수)로 리더가 직접 처리.
- **spec 3 — 리더 앱 (다음 작업)**: Vite 6 + 바닐라 JS + vite-plugin-pwa, 배포 `/apps/best/`. 구글 로그인 게이트(Supabase Auth, 기존 앱 패턴) → 한 줄 리스트(행 클릭 = 원문 새 탭) + 일/주/월/연 탭 + 커뮤 토글 + 검색 + 저장(북마크). 광고(`is_ad`) 행 항상 제외. 판 이름은 디시·보배 실측값 + 이슈링크 사이트별 고정 매핑으로 근사 표시.
