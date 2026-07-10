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

### 3-0. 실행기 — launchd 주(主), Claude 루틴 백업 (2026-07-11)

Claude scheduled-task 는 앱이 열려 있어야 발화한다(study 는 17일 중 2일 결손). 그래서 OS 레벨 러너를 주로 둔다.

| | |
|---|---|
| 주 | launchd `com.gio.best-daily` → `scripts/best-daily-collect.sh` → `node src/collect.mjs --if-missing` |
| 트리거 | `StartCalendarInterval` 08:00 (슬립 시 **깨어난 직후** 실행 — launchd.plist(5) 명시) + `RunAtLoad`(로그인·부팅 직후) + `StartInterval` 3600(매시간 점검. 슬립 중 발화는 놓치나 깨어난 뒤 다음 주기에 복구) |
| 백업 | Claude `best-daily` 08:03. launchd 가 이미 했으면 가드가 즉시 건너뜀 |
| 중복 방지 | `--if-missing` → `alreadyCollected(ingest_log, kstToday())` 가 9곳 전부 `ok` 면 종료(0.4초, 요청 0건). 일부라도 결손이면 다시 돈다 |
| 로그 | `~/.local/share/best/collect-std{out,err}.log` |

설치 자산은 `best/scripts/` 에 사본이 있다 (실제 위치는 `~/.local/bin/`, `~/Library/LaunchAgents/`).

**실측 (2026-07-11)**: Claude 루틴을 `fireAt` 로 강제 발화 → 9곳 전부 `ok`, 2,073건 수집(`run_on=2026-07-11`).
그 직후 launchd `kickstart` → `이미 9곳 전부 수집됨 — 건너뜀`, exit 0. `StartInterval` 을 60초로 낮춰 자동 반복 발화 확인 후 3600 원복.

### 3-1. 크롤 예절·안전
- **호스트 라운드로빈** + 요청 간 0.5~1s. UA 는 일반 브라우저 문자열.
- **4xx(특히 430) 감지 시 그 사이트 즉시 중단, 자동 재시도 금지** (펨코 사례 — 차단은 상태로 남고 재시도가 악화).
- 파서별 수집 건수를 `best_ingest_log` 에 기록. 직전 7일 중앙값 대비 0건이면 앱 상단 배너. 조용한 실패 금지.
- 결손일 감지 시 이슈링크 `336`(14일) 창으로 소급 복구 (실측: p160 에도 100행, 날짜 전 구간 분포).

### 3-2. 중복 제거
- 사이트 내: `unique(site, post_key)` + 수집 중 페이지 겹침은 첫 등장(상위 순위) 우선.
- post_key 네임스페이스: 이슈링크 bobae = `판코드:원본No`(go ID = 5자리 판 접두사 + 7자리 No, 실측), 보배 직접 = `best:No`, 그 외 = go ID / 원문 no.
- **보배 직접 ↔ 이슈링크 크로스소스 숫자 대응은 불가** (2026-07-10 픽스처 실측: best 목록 No 는 원본판 No 와 다른 자체 채번 — ~100만대 vs ~340만대). 콘텐츠 중복은 정제 엔진(spec 2)의 클러스터링이 흡수.

### 3-3. 광고 제거 (게시판 판정 + 제목 패턴, AI 불필요)

**1차 — 게시판 판정 (뽐뿌)**: 이슈링크 뽐뿌 go ID 앞 4자리가 원문 게시판을 인코딩한다 (2026-07-11 리다이렉트 22종 전수 실측).
`3156→ppomppu`(핫딜) · `3604→ppomppu8` · `2335→coupon`(포인트) · `3478→pmarket8`(장터, robots 도 금지) = 광고.
`4684→freeboard` · `1679→humor` · `6350→car` … = 일반글. 제목 접두사(`[G마켓]`)는 무한 변주라 게시판이 더 견고하다.

**2차 — 제목 패턴**: `^\[?(AD\b|\[(쿠팡|쿠폰|네이버페이|네페|G마켓|…))` + 포인트글 `\d+원.*받으세요`.
일반 판에 올라온 포인트글(`[란123] … 59원 … 받으세요`)이 실재하므로 게시판 판정이 제목 판정을 무력화하면 안 된다.

매치 행은 `is_ad=true` 로 **저장**하고(하드 삭제 안 함) 리더가 항상 제외한다.
2026-07-11 DB 전수: 누적 5,090행 중 광고 63건(전부 뽐뿌), 표시 대상(`is_ad=false` ∩ 9곳) 잔존 **0건**.
`board` 컬럼도 이때 채운다 (뽐뿌 판 코드).

### 3-3-1. board 컬럼의 진실성

`board` 는 **실제로 판별된 행에만** 채운다: 디시(갤러리 태그) · 보배(go ID 접두사/카테고리 셀) · 뽐뿌(go ID 접두사).
**사이트만 보고 판 이름을 추측하지 않는다** — 이슈링크는 clien 의 `park` 외 `news` 판도, todayhumor 의 `sisa` 외 `lovestory` 판도 미러한다 (2026-07-11 실측). 나머지 커뮤는 리더에서 그 자리를 비운다.

### 3-4. 백분위 · 기간 축
- 사이트별 수집 풀 내 조회수 백분위 (산수). 더쿠 등 추천수 없는 사이트 문제없음 — 조회수 단독 축.
- 이슈링크 조회수는 스냅샷(글별 갱신 시점 상이, 이전 세션 실측 +1,788 편차 사례) — 백분위 용도 충분성은 추론. 첫 달 데이터로 점검.
- **기간(일/주/월/연) 필터 축은 `posted_at`(게시 시각)이다.** `collected_on` 으로 자르면 결손일 14일 소급분이 전부 '오늘 수집'으로 들어와 주/월/연을 왜곡한다. 그래서 보배 직접 크롤도 목록 날짜 셀을 파싱해 `posted_at` 을 채운다 (당일 `HH:MM`, 이전일 `MM/DD` — 2026-07-10 p1·p15 실측).

## 4. 테스트 전략 (test-first)

- **파서는 픽스처 스냅샷 테스트를 먼저 쓴다.** 사이트 개편이 주된 고장 원인.
- 픽스처: `best/fixtures/2026-07-10/` (실크롤 HTML 29파일, gitignore — 공개 repo 커밋 금지).
- 테스트 러너: `pnpm vitest run` (watch 금지 — freeze).
- 파서별 최소 케이스: 행 수 일치 / 제목·조회수·시각 필드 추출 / 광고 정규식 매치·비매치 / 보배 카테고리 셀 / dcbest 공지·설문 행 제외.

## 5. 리더 앱 (구현 완료 2026-07-11)

Vite 6 + 바닐라 JS (PWA 아님 — 웹 전용, 작업지시서 §0). 배포 `/apps/best/`. 소스 `src/web/`.

| 파일 | 책임 |
|---|---|
| `main.js` | 상태·렌더·이벤트. 로그인 게이트 / 홈 / 검색 / 저장됨 |
| `logic.js` | 커뮤니티 9곳(색·짧은이름·별칭) · `boardLabel` · `rankSort` · `searchPlan` · `periodStart` · `suggestKeywords` |
| `format.js` | 숫자 만 축약 · 상대 시각 |
| `api.js` | PostgREST 질의 (posts · siteCounts · search · userState · saved) |
| `auth.js` · `supabase.js` | Google OAuth + 허용 이메일, auth-js/postgrest-js 직접 사용 (study Wave 11.19 패턴) |

- **인증**: Google OAuth. 전용 클라이언트 `best web`(geo-apps 프로젝트). 허용 이메일 외 즉시 로그아웃.
- **정렬**: 사이트 내 백분위 → 조회수 (원지표 그대로 정렬 금지, 지시서 §8).
- **행 클릭**: 원문 새 탭(`target=_blank`, `rel=noopener`) + 읽음 처리. 앱 내 상세 없음.
- **사이드바 카운트**: 사이트별 head count. 행을 받아 세면 PostgREST 1000행 상한에 잘린다 (실측).
- **검색**: 제목·board ilike + 커뮤니티 별칭 → site, 보배/뽐뿌 한글 판명 → board 코드. 한글 IME 조합 중엔 질의하지 않고, 결과 영역만 갱신한다(전체 재렌더 시 input 이 교체돼 조합이 끊김).
- **사용자 상태**: `best_user_state`(saved/read) 계정 동기화. RLS `auth.uid() = user_id`.

### 5-1. 검증 (2026-07-11, 실데이터)

- **로그인**: 로컬·프로덕션(`/apps/best/`) 양쪽에서 Google 로그인 완주 → 홈 렌더.
- **기간 탭**(posted_at 축, `is_ad=false` ∩ 9곳, DB 전수 count): 일 1,835 / 주 2,878 / 월 3,775 / 연 3,775.
  (월=연 은 아직 2주치 데이터뿐이라 같다. 소급 수집으로 6/26 게시글까지 존재.)
- **사이드바 카운트 합** = 일간 총계 1,835 (146+181+148+487+201+135+210+129+198).
- 커뮤 토글 · 전체 해제 빈 상태 · 더보기(100→200) · 저장·읽음·배지·정렬 3종 · 새로고침 후 서버 복원.
- **검색**: 제목 41건 전부 키워드 포함 / 커뮤명 100건 전부 clien / 판명 '스퀘어'·'싱갤'·'신유머' / 0건 상태.
- **광고**: 표시 대상 잔존 0건 (전수 쿼리).
- **원문 링크**: 9개 커뮤 **각 1건 표본**을 리다이렉트 추적 → 전부 HTTP 200, 원문 도메인 도달.
- **테스트**: 로컬 `vitest run` 50건 통과. CI(픽스처 없음) 40 passed / 10 skipped.

## 6. 이후 스펙

- **spec 2 — 정제 엔진 (2026-07-10 사용자 결정으로 축소)**: **태깅 폐기**(카테고리 UI 제거로 용도 소멸). **클러스터링(같은 이슈 묶기)은 보류** — 제목만으로 가능해 소급 적용 여지는 남음.
