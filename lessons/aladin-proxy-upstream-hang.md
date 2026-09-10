# 알라딘 프록시 상류 무응답 — 클라이언트가 실패를 삼키면 "검색 자체가 안 됨"으로 보인다 (readingtime, 2026-09-10 실측)

## 증상
실기기 리딩타임 책 추가 시트(13)에서 "서성이다"(장강명, 2026-08 신간) 검색 → 아무 반응 없음.
카운트·결과·에러 어느 것도 안 뜸. 사용자 보고: "검색 자체가 안 되는 듯".

## 실제 원인 (curl 계측, claude.ai/code 샌드박스)
- **Supabase Edge 런타임은 정상**: Origin 없는 호출 403 0.7s, 잘못된 경로 404 0.6s, OPTIONS 204 0.6s, REST `/rest/v1/` 401 0.5s.
- **상류(www.aladin.co.kr)를 부르는 `ItemSearch.aspx`·`ItemLookUp.aspx` 만 장애**: 13회 중 1회 성공(세션 첫 호출 —
  "서성이다" totalResults 19, 1위가 해당 책·isbn13 9791167903792 → 검색어·데이터 문제 아님),
  2회 503(본문 `서비스를 사용할 수 없습니다.` = 알라딘 자체 응답, 프록시는 상류 상태를 그대로 전달),
  10회 40~90초 무응답(0 bytes).
- **알라딘 사이트 자체 장애**였다: 사용자 브라우저에서 aladin.co.kr 이 `504 Gateway Time-out`(스크린샷). 프록시는 200 → 무응답 → 503 →
  복구 순으로 상류를 그대로 비췄다. 복구 확인 2026-09-10 15:06 UTC(00:06 KST) — 3회 연속 1초 응답, "서성이다" 1위. 장애 창은
  적어도 11:26 KST(보고) ~ 00:06 KST.
- 앱은 `try? await searchProvider(...)` 로 실패를 삼켰고 로딩·에러 표시가 없었다 → URLSession 기본 60초를
  기다린 뒤 조용히 끝남. 사용자 눈엔 "리턴을 눌러도 아무 일도 없음".
- 이 프록시(`pick/supabase/functions/aladin/index.ts`)는 Book·Pick PWA 도 같이 쓴다 → 같은 시간대엔 그쪽 검색도 같이 죽는다.

## 판정법 (재발 시 앱을 의심하기 전에)
```sh
# ① 상류 경유 호출 — 30초 안에 200 + JSON 이면 정상
curl -sS -m 30 -w "\nHTTP %{http_code} %{time_total}s\n" -H "Origin: https://leftjap.github.io" \
  "https://tcbooffrdacfatywdzcm.supabase.co/functions/v1/aladin/ItemSearch.aspx?Query=%EC%84%9C%EC%84%B1%EC%9D%B4%EB%8B%A4&QueryType=Keyword&MaxResults=3&start=1&SearchTarget=Book&output=js&Version=20131101&Cover=Big"
# ② 런타임 생존 — Origin 없이: 즉시 403 이면 런타임 정상 → ①이 죽었다면 상류만 의심
curl -sS -m 10 -o /dev/null -w "%{http_code} %{time_total}s\n" \
  "https://tcbooffrdacfatywdzcm.supabase.co/functions/v1/aladin/ItemSearch.aspx?Query=x"
```
- 샌드박스는 `www.aladin.co.kr` 직접 접속이 프록시 정책으로 막혀(CONNECT 403) **알라딘 전역 장애인지
  Supabase 발신 IP 한정인지 못 가른다**. 맥에서 ttbkey 로 직접 호출해 비교해야 한다.
- 실기기에서는 `rtapp --verify-search 서성이다` (맥 데모 셸) 가 이제 실패 사유(시간 초과/503)를 stderr 로 낸다.

## 검증 경로 (클라우드 세션 — 리눅스, Xcode·시뮬레이터 없음)
- claude.ai/code 세션은 리눅스 컨테이너다. `uname`/`which swift xcodebuild`/`ls /Applications` 로 확인 뒤(부정 전 확인 의무)
  **GitHub 호스트 macOS 러너**로 옮겼다: `.github/workflows/readingtime-ios.yml` — `swift test`(macOS) + iPhone 시뮬레이터
  XCUITest(`ReadingTimeUITests/AddBookSearchUITests.swift`, 앱 `--stub-search`·`--seq query:` 사용). 2026-09-10 실측:
  Xcode 26.3 / iPhone 16 Pro, 유닛 300건·UI 3건 통과, 라이브 케이스는 "알라딘 서버 오류 (503)" 안내로 종료(22초).
- 러너 아티팩트·잡 로그 zip 은 이 샌드박스에서 **받을 수 없다**(리다이렉트 호스트가 프록시에 막혀 CONNECT 403).
  그래서 워크플로가 축소 PNG 를 base64 로 로그에 남기고, 세션은 GitHub MCP `get_job_logs`(서버측 fetch) 로 받아
  `RTSHOT-BEGIN/END` 블록을 복원해 Read 로 본다. 런 폴링·잡 상태는 `GITHUB_TOKEN` + `api.github.com` 직접 호출이 된다.

## 대처 방안 (결정)
검색 소스가 알라딘 하나라 장애 중엔 어떤 앱도 결과를 못 낸다 → `readingtime/README.md` "알라딘 장애 대처": ① 프록시 페일오버(카카오 책 검색,
알라딘 응답 모양으로 정규화, 클라이언트 무수정) ② 리딩타임 직접 입력 + 나중 자동 승격(밀리 편입 파이프라인 재사용) ③ 센티널 헬스 게이트.

## 회피
- **클라이언트**: 요청 시간 제한 20초(`AladinClient.timeout`) + 진행·실패·0건 상태를 화면에(`RTAppModel.searching/searchError`,
  시트 13 `statusBlock`) + "다시 시도"(`retrySearch`). 늦게 온 이전 검색은 세대 카운터로 폐기.
- **프록시**: 상류 `fetch(target)` 에 시간 제한이 없다 — `AbortSignal.timeout(15_000)` + 504 JSON 으로 끊으면
  세 앱 모두 60초 대신 15초에 실패를 안다. 배포(`supabase functions deploy aladin`)는 맥에서.
- 네트워크 경로의 `try?` 는 금지에 가깝다: 실패를 삼키면 인프라 장애가 UI 버그로 보고된다.
