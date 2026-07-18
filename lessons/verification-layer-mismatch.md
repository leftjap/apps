<!-- trigger: layer,검증,단정,통과,화면,사용자 입장,evidence,acceptance,vitest 통과,e2e 통과,사각,실기기,네이티브,배포,반영,Xcode,무선설치,실기기 반영 | match-paths: - -->
# verification-layer-mismatch

발생: 2026-05-04 ground truth 보강 라운드 / Study Wave 11.70~11.71 / Today devSeed cleanup
환경: Claude_Preview MCP (localhost:5173~5175 별 Chrome profile) · Bash head/tail · Edit·Read 시간 순서 · vitest unit test · Supabase service_role
요약: 단일 layer 검증으로 다른 layer "정합/해소/동작/사용자 입장 검증" 단정 = 거짓. 글로벌 `~/.claude/CLAUDE.md` axis I 본문.

## Why

거짓말 6건 (스터디 4 + Today 2) 본질이 모두 같은 패턴 — "한 layer 통과 → 다른 layer 단정". 메커니즘은 4가지로 분산되지만 의미는 단일.

| # | 발화 | 통과 layer | 단정 layer | mechanism |
|---|---|---|---|---|
| #2 | "Wave 11.70 자동 해소" | preview localhost mocks fixture | 사용자 iPhone PWA 실기 | preview Chrome ≠ 사용자 OAuth 세션 |
| #3 | "사용자 입장 user flow" | preview_eval `.click()` JS dispatch | 사용자 손가락 click 이벤트 | handler 트리거 안 되는 케이스 있음 |
| #4 | "ja 4 ex-section spec 정합" | spec-compliance.test 통과 | spec §10 §6 직접 인용 점검 | 테스트 자체 결함 가능성 미배제 |
| #A | "soyoun 5월 합계 190,586원" | Bash stdout count 3 + 첫 3건 amount | totalKrw 전체 (head 잘림) | 수동 합산 = stdout 직접 인용 X |
| #B | "expenses.js:362-389" | Edit 전 line 361 기억 | Edit 후 정확한 라인 | 신규 함수 추가로 줄 밀림 → 재 Read 안 함 |
| #C | "gym 실기기 반영됨" (2026-07-18) | PWA 웹 번들 grep + GH Pages 배포 성공 | 사용자 폰 **네이티브 앱** | 실기기는 네이티브인데 웹만 고침 — 층위 자체가 다름 (#2 재발) |

**#C 상세 (2026-07-18, gym 네이티브 전환 후 실사고 — 표 #2 와 같은 뿌리):**
gym 은 2026-07-07 iOS 네이티브 전환(`ea98b97`). 실기기 = 네이티브(`Gym.xcodeproj`+`GymKit`),
`src/`+`mocks/` PWA 는 잔존. 작업지시서가 "PWA" 라 적혀 있어 웹만 고치고 "실기기 반영됨" 단정.
이어 "서비스워커 캐시" 로 오진단(네이티브엔 SW 없음) → 틀린 전제 위에 추론을 쌓음.
근본: **① 작업지시서 전제("PWA")를 층위 확인 없이 수용** — "실기기가 뭘 도는가" 를 안 물음.
**② 틀린 전제 위 추론 지속** — "반영 안 됨" 재확인 요청에도 웹 프레임 안에서만 원인 탐색.
교훈: 디자인/화면 작업 전 **"이 앱은 실기기에서 무엇이 도는가"** 를 먼저 확정. 저장소에 두
구현이 공존할 수 있다(gym: 네이티브 실기 + PWA 잔존). 지시서·spec 이 한쪽만 말해도 다른 쪽 존재를 의심.

**#D — 도구 "능력" 오단정 (통과/불가 양방향, 2026-07-18):**
layer 착각의 쌍둥이 — 검증뿐 아니라 **도구 가능/불가능도 확인 없이 단정**함.
- "Xcode 없음 → 실기기 빌드 불가" ← `xcode-select` 가 CLT 라 `xcodebuild` 1회 실패. 실제론 Xcode.app 설치돼
  `DEVELOPER_DIR` 지정으로 동작. **한 명령 실패 = 도구 부재 단정 금지.**
- "폰 설치는 사용자가 Xcode 로 직접" ← 확인 안 하고 위임. 실제론 폰이 WiFi 페어링돼 `devicectl` 로
  Claude 가 직접 무선 설치 가능. **불가/위임 단정 전 `list devices`·`list_granted_applications` 등으로 실제 확인.**
교훈: 능력을 부정(불가·없음·위임)하기 전에 **확인 명령 1회 시도 의무**. 부정이 위임보다 쉬워서 새는 지점.

## How to avoid

**1. 검증 발화 시 layer 명시**

vague 라벨 ("정합", "해소", "동작", "검증 통과") 단독 발화 금지. 통과 layer + 미검증 layer 동시 명시:

```
✗ "spec 정합 확인"
✓ "vitest 통과 (spec §10 §6 직접 인용 점검 안 함, 테스트 결함 가능성 잔류)"

✗ "사용자 입장 검증"
✓ "preview_eval `.click()` 디스패치 후 panelHTML 확인 — 사용자 손가락 클릭 ≠ JS dispatch"

✗ "Wave 자동 해소"
✓ "preview localhost mocks fixture 표시 OK — 사용자 iPhone PWA OAuth 세션 검증 안 함"
```

**2. Bash stdout 잘림 가드**

`head -N` / `tail -N` / `| head` 등 잘림 명령 사용 시 그 응답에서 잘린 영역 단정 금지. 예:

```bash
node verify-import.js | head -80
# 출력 80줄 안에 totalKrw: 190586 부분 없음
```

응답:
```
✗ "soyoun 5월 합계 190,586원" (stdout 직접 인용 함의)
✓ "soyoun 5월 count: 3 + 첫 3건 amount stdout 직접 인용 (12000+91000+87586=190586 수동 합산, totalKrw stdout 부분은 head 잘려서 미확인)"
```

해결: 잘림 의심 시 같은 명령 `| grep totalKrw` / `| tail` / 잘림 없이 재실행.

**3. Edit 후 라인 번호 인용은 재 Read 의무**

신규 함수 추가·라인 삭제·헤더 이동 시 줄 번호 밀림. Edit 직후 Read 없이 라인 번호 인용 금지:

```
✗ "expenses.js:362-389 handleCategoryActive 변경"  (Edit 전 기억 line 361)
✓ Edit 후 Read → "expenses.js:374-401 handleCategoryActive 변경 (clearExpensesFixture 신규로 +13 밀림)"
```

해결: Edit 직후 같은 turn 에서 그 파일 Read (offset 명시) → 라인 번호 stdout 직접 인용. Read 안 함 시 "라인 번호 추정 — Edit 후 재 Read 안 함" 라벨.

**4. preview MCP `.click()` vs preview_click vs 사용자 손가락**

| 방식 | handler 트리거 | OAuth 세션 |
|---|---|---|
| `preview_eval` 안 `btn.click()` | 일부 케이스 미트리거 (state 미변경) | preview Chrome 별 profile = 미공유 |
| `preview_click` (좌표) | 진짜 click 이벤트 dispatch | preview Chrome 별 profile = 미공유 |
| 사용자 손가락 (iPhone PWA) | 진짜 click + touch | 사용자 OAuth 세션 |

preview MCP 어느 방식이든 사용자 iPhone 실기 검증 ≠ . preview 통과 → "사용자 입장" 라벨 금지.

**5. preview Chrome OAuth 세션 미공유**

Claude_Preview MCP 의 Chrome 인스턴스는 별 profile. allowed emails (leftjap/soyoun312) 외 차단 확인용으로 OAuth 시도해도 재인증 화면. **로그인 상태 의존 검증 (사용자 카드 화면 / Supabase Realtime / RLS user_id 격리) 은 도구 우회 불가** — 사용자 1회 안내 ("X 화면 캡처 공유") 가 정합.

대안: chrome-devtools MCP autoConnect 모드 — 사용자 chrome 또는 별 profile 에 attach → OAuth 세션 공유. 셋업: `~/apps/lessons/chrome-devtools-mcp-autoconnect.md`

## 검증 (재발 시 사인)

- 응답 본문 패턴: `정합 (확인|검증)|자동 해소|사용자 (입장|체감|환경) (검증|확인|테스트)|테스트 통과 ?(=|→) ?spec`
- Bash stdout: `head|tail` 사용 + 응답 본문에 stdout 잘린 영역 숫자 단정
- Edit + 그 파일 라인 번호 (`\.\w+:\d+`) 인용 + 그 후 Read 부재

## 관련

- 글로벌 `~/.claude/CLAUDE.md` "거짓말 방지 출력 규칙"
- `~/apps/lessons/chrome-devtools-mcp-autoconnect.md` (OAuth 세션 우회 대안)
