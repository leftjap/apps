<!-- trigger: chrome-devtools,MCP,autoConnect,attach,OAuth 세션,별 chrome,debugging chrome,통합 검증 | match-paths: - -->
# chrome-devtools MCP autoConnect 모드

> 도입: 2026-05-02 (Today Wave 11.10 통합 검증)
> 환경: Chrome 146+ (M144~145 는 `--channel=beta` 필요) + chrome-devtools-mcp@latest
> 한 줄 요약: 별 chrome 인스턴스 띄우는 대신 사용자 chrome (또는 별 profile) 에 attach → OAuth 세션 공유 → PWA 통합 검증 자동화

## Why

기본 모드 (`npx chrome-devtools-mcp@latest`) 는 별 chrome profile (`/Users/gio_c/.cache/chrome-devtools-mcp/chrome-profile`) 에 chrome 새로 띄움. 단점:
- OAuth 세션 미공유 → 통합 검증마다 Google 로그인 부담
- 사용자 chrome 의 dev 환경 (확장프로그램, devtools 설정) 무관

autoConnect 는 이미 띄워진 chrome 에 attach. OAuth 로그인된 PWA 그대로 Claude 가 클릭/저장/수정/삭제 자동 검증.

## When to use (결정 trigger)

다음 중 하나라도 해당 시 chrome-devtools attach 우선:
- **단위/e2e 통과 + 사용자 환경 재현** — happy-dom 사각지대 (`~/apps/lessons/happy-dom-image-api-limits.md` 참조). 가설 N건 폐기 누적 시 (Study Wave 11.56-11.58 패턴) 즉시 전환
- **OAuth 세션 의존** — 실 Supabase 인증, 실 RLS, 파트너 데이터 검증
- **SW 캐시 / 옛 dist 의심** — 사용자 chrome 의 캐시 상태 진단 (Today Wave 11.10 hotfix 검증 사례 — sb__avatar-img 미존재 → SW reload 후 정상)
- **통합 클릭 흐름** — 자동저장 (debounce), 모달 confirm, 라우팅 (hash router 와 mocks UI 분리 확인)
- **신규 사용자 환경** — 신규 OAuth 계정에서만 노출되는 결함 (Today Defect-002 fixture 노출 사례)
- **Performance / network / console** — DevTools 직접 사용

Playwright 와 분담:
- **Playwright** = "user flow worked end-to-end" (driving)
- **chrome-devtools** = "왜 안 되는지 브라우저 내부 분석" (debugging)
- 본 프로젝트 `wave-build-verify` 7-step 의 e2e = Playwright. chrome-devtools = e2e 가 못 잡는 결함의 마지막 진단 단계

## How

### 1. Chrome 측 remote debugging 활성화 (사용자, 1회)
- `chrome://inspect/#remote-debugging` 진입
- "Enable remote debugging" 토글 ON
- 첫 attach 시 권한 dialog → "Allow"

### 2. MCP config 갱신 (`~/.claude.json`)
```json
"chrome-devtools": {
  "command": "npx",
  "args": ["-y", "chrome-devtools-mcp@latest", "--autoConnect"]
}
```
Chrome 144~145 면 args 끝에 `"--channel=beta"` 추가. Chrome 146+ 면 불필요.

### 3. Claude Code 재시작
MCP config 변경 반영. 재시작 후 `mcp__chrome-devtools__list_pages` 호출하면 사용자 chrome 의 실제 탭 목록 노출.

### 4. 작업 종료 시 (사용자)
`chrome://inspect/#remote-debugging` 토글 OFF (다음 세션이 임의로 attach 못 하도록).

## 격리 권장 (필수에 가까움)

**별 chrome profile** (예: "apps 검증") 만들어서 attach. 메인 profile attach 시:
- 모든 열린 탭의 cookie/localStorage/IndexedDB 노출 (Gmail/Notion/은행 등)
- Claude 가 page 헷갈리면 엉뚱한 탭에 입력 위험

profile 생성: chrome 우상단 프로필 아이콘 → "추가" → 빈 profile → 검증 대상 PWA 만 로그인. 메인 profile 은 무영향.

## 보안

- Claude 정책상 결제·금융·메일 발송 prohibited (자동 회피). 안전망으로 attach 동안 민감 탭은 닫거나 별 profile 사용
- chrome 상단 "Chrome is being controlled by automated test software" 배너 항시 표시 — attach 활성 사인
- evaluate_script 로 임의 JS 실행 가능 → 모든 page 의 cookie 접근 가능. 격리가 유일한 안전장치

## 한계

- **Chrome 143 이하 미지원** → 업데이트 필요
- 사용자가 chrome 먼저 띄워야 attach 가능 (MCP 가 chrome 자동 시작 X)
- 첫 attach 시 chrome 권한 dialog 1회 (사용자 클릭 필요)

## 토큰 효율 패턴 (chrome-devtools-mcp issue #726)

`click`, `hover`, `fill`, `fill_form`, `press_key`, `drag`, `upload_file` = 매 호출마다 페이지 a11y tree (snapshot) 자동 반환. 단순 페이지 5-15K 토큰, 거대 페이지 (Jupyter notebook 등) 200K+ → 1회로 컨텍스트 폭발. 끌 옵션 미구현 (issue #726 OPEN).

**권장 패턴:**
- `evaluate_script` 우선 — return JSON 만 반환 (0.5-3K). 1 호출 안에 click + 검증 + return batch
- `take_snapshot` / `take_screenshot` 명시적 호출만, 시각 검증 정말 필요할 때
- 자동 snapshot 도구 (click/fill/hover 등) 최소화
- 60% 컨텍스트 도달 시 `/compact` 또는 새 세션 (`~/.claude/CLAUDE.md` `## 둠 루프 자동 탈출` 정합)

**1 evaluate_script 호출 안에 batch 예시:**
```js
async () => {
  document.getElementById('newDocBtn').click();
  await new Promise(r => setTimeout(r, 100));
  const h1 = document.querySelector('main h1');
  h1.textContent = 'X';
  h1.dispatchEvent(new InputEvent('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 1500)); // debounce
  return { saveText: document.querySelector('.save')?.textContent };
}
```

이 패턴 = chrome-devtools 의 click 자동 snapshot 회피 + 다단계 검증 1 호출.

## 검증 (재사용 시 사인)

- `mcp__chrome-devtools__list_pages` 응답에 사용자 chrome 의 실제 탭 (URL · title) 노출
- chrome 상단 자동화 배너 표시
- 별 chrome 인스턴스 안 띄움 (`pgrep -f chrome-devtools-mcp/chrome-profile` = 0)

## 적용 대상 (재사용 시나리오)

- OAuth 로그인 필요 PWA 통합 검증 (Today, Study, Gym)
- Supabase Realtime 양방향 검증 (2 profile / 2 탭)
- 사용자 환경 의존 일반 클릭 (push · Web Share Target 외) Claude 가 직접 점검
- 다른 프로젝트 (cowork 포함) PWA · web app 통합 검증

## 참고

- [Chrome for Developers — Let your Coding Agent debug your browser session](https://developer.chrome.com/blog/chrome-devtools-mcp-debug-your-browser-session)
- [chrome-devtools-mcp GitHub Issue #140 — Automatic connection to existing Chrome session](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/140)
- [chrome-devtools-mcp Issue #726 — Disable automatic snapshot return (OPEN)](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/726)
- [Playwright vs Chrome DevTools MCP: Driving vs Debugging — Steve Kinney](https://stevekinney.com/writing/driving-vs-debugging-the-browser)
