<!-- trigger: chrome-debug,디버그 chrome,9333,화면시간,screentime_daily,chrome-site-poll,사이트 귀속,AppleScript 트윈,osascript chrome | match-paths: - -->
# 디버그 Chrome 트윈이 화면시간 사이트 귀속을 오염

> 도입: 2026-07-17 (cue 화면시간 사이트 붕괴 진단)
> 환경: macOS + `chrome-debug.sh`(포트 9333, `~/.chrome-debug-profile`) + `~/.local/bin/chrome-site-poll.py`
> 한 줄 요약: 같은 번들 ID(com.google.Chrome)의 디버그 인스턴스가 상주하면 `tell application "Google Chrome"` AppleScript 가 어느 인스턴스에 응답할지 비결정적 → 폴 데몬의 사이트 귀속이 디버그 탭 URL 로 전부 뒤집힘

## 증상

- `screentime_daily` kind='site' 다양성이 하루아침에 붕괴 — 특정일부터 도메인이 1개(디버그 Chrome 이 띄워둔 페이지, 예: leftjap.github.io)로만 수렴하고 초가 Chrome 앱 시간에 근접.
- 실제 사례: 2026-07-13 17:10 디버그 Chrome 기동 → 7/14 사이트 행이 leftjap.github.io 20,730초 단 1개 (실 Chrome 은 그날 유튜브 등 정상 브라우징 — History 953 방문).

## 원인 (검증됨)

1. `chrome-debug.sh` 가 띄운 Chrome 은 별도 프로필이지만 **번들 ID 가 동일** — lsappinfo/knowledgeC/AppleScript 모두 같은 "Google Chrome" 으로 취급.
2. `osascript -e 'tell application "Google Chrome" ...'` 는 트윈 중 하나에 임의 응답 (실측: 같은 날 밤 name-타겟팅은 디버그 탭을, 수 분 뒤 JXA 는 실 탭을 반환 — 비결정). JXA `Application(pid)` 도 번들로 뭉개져 **PID 타겟팅 불가**. 시스템 python3 엔 PyObjC/ScriptingBridge 없음.
3. 결과: 사용자가 실 Chrome 을 쓰는 매 틱마다 데몬이 디버그 인스턴스의 활성 탭 URL 을 받아 그 도메인에 30초씩 누적.

## 방어 (chrome-site-poll.py 2026-07-17)

- **frontmost pid 판별**: `lsappinfo info -only bundleID -only pid` → Chrome 이면 `ps -p PID -o command=` 에 `--remote-debugging-port`/`--user-data-dir` 존재 시 자동화 인스턴스로 간주, **그 틱 전체 스킵** (앱 시간도 미계상).
- **CDP 교차검증**: `ps -axo command=` 에서 `--remote-debugging-port=<port>` 전수 스캔 → 각 포트의 `/json/list` 탭 URL 집합과 osascript 응답을 대조, 일치하면 오귀속으로 판정하고 site 틱 폐기.

## 한계

- 디버그 Chrome 이 상주하는 동안 osascript 가 디버그 인스턴스에 응답하면 실 Chrome 의 site 틱은 **결측**(폐기)된다 — 오염은 막지만 복원은 불가. **검증 세션 종료 시 디버그 Chrome 을 종료할 것** (`kill <pid>`; chrome-debug.sh 가 필요 시 재기동).
- 실 Chrome 활성 탭이 디버그 Chrome 의 탭과 동일 URL 이면 legit 틱도 폐기 (드묾, 무해).
- knowledgeC(`/app/usage`) 기반 지표(예: millie-sync)는 번들 단위라 트윈 구분 자체가 불가 — 디버그 Chrome 을 frontmost 로 띄우는 자동화는 앱 시간도 오염시킴 (CDP 원격 제어는 포커스 안 뺏으므로 통상 무해).

## 오염 이력·정정

- 2026-07-13~17 leftjap.github.io site 행 5개 삭제 (백업: 세션 스크래치 `deleted-site-rows-backup*.json`, 2026-07-17). 7/13 은 처음 혼합으로 보고 보존했다가, 정량 확인 후 삭제로 정정: leftjap 행 7,530초 ≈ 17:10(디버그 Chrome 기동) 이후 Chrome 사용 7,691초의 98%, 실 브라우저 히스토리의 leftjap 방문은 28회뿐 — 그날 저녁 유튜브 등 실사용이 통째로 빨려간 것.
- 삭제 후 7/13 저녁~7/17 오전의 site 데이터 결측이 정상 상태 — cue '내 도구'(leftjap 사이트 성분)·사이트 랭킹도 그 기간 과소 표시가 맞다. 결측분은 복원 불가(/app/webUsage 는 Safari 전용, visit_duration 은 백그라운드 탭 중복 계상으로 사용 불가 — 둘 다 실측 확인).

## 검증 (재사용 시 사인)

- **회귀 테스트**: `/usr/bin/python3 ~/.local/bin/test-chrome-site-poll.py` (repo 밖 — 데몬과 동거).
  순수 판별 함수 + `main()` 1틱 통합 경로(자동화 전면→앱·사이트 미계상 / 오귀속→site 만 폐기하고 앱은 계상 /
  디버그 부재→정상 귀속 / SKIP_BUNDLES 회귀)를 커버. push·pull_today 스텁 + 임시 STATE 라 DB·실 state 무접촉.
  더미 프로세스(`python3 -c sleep … --remote-debugging-port=9999`)로 자동화 pid 를 실제로 만들어 판별을 실증.
- `ps -axo command= | grep remote-debugging-port` 로 트윈 존재 확인.
- 사이트 다양성 회복: 디버그 Chrome 종료 후 실 브라우징 도메인이 다시 누적되는지 state/DB 확인
  (2026-07-17 실측: 종료 직후 틱에서 `hongss.liveklass.com` 정상 귀속 → 이후 youtube·drive 등 다양성 회복).

## 남은 구멍 (자동화 안 됨)

디버그 Chrome 이 **상주하는 동안 실 Chrome 의 site 틱은 폐기(결측)** 된다 — 조작은 막지만 기록은 빈다.
현재 방어는 "사용 후 사람이 종료"에 의존하므로, 세션이 또 안 끄면 **결측은 재발**한다(오염은 재발 안 함).
데몬은 Chrome 이 전면인 틱에만 CDP 스캔을 하므로 "유휴 디버그 Chrome 자동 종료"는 별도 구현이 필요.
