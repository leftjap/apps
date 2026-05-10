# Gym v2 시안 적용 — 클로드웹코드 작업지시서

> 입력: claude.ai/design 시안 v2 (다크). 출력: `~/apps/gym` (바닐라 HTML/CSS/JS PWA).
> 채택 화면 8개. 시안 JSX 는 본 문서에 인라인 — 외부 파일 추가 조회 불필요.

---

## 0. 채택 시안 (8개)

| # | 화면 | 시안 | 컴포넌트 | 출력 위치 |
|---|---|---|---|---|
| 1 | 로그인 | A · Minimal Dark | `LoginA` | `mocks/login.html` |
| 2 | 홈 (idle) | A · Action-first | `HomeA` | `mocks/home.html` (idle 분기) |
| 3 | 홈 (진행중) | C · Session Active + 옵션 ¹ | `HomeC` | `mocks/home.html` (active 분기) |
| 4 | 세션 (빈) | 0 · 빈 시작 | `SessionEmpty` | `mocks/session-empty.html` (신규) |
| 5 | 세션 | C · Receipt / Mono | `SessionC` | `mocks/session.html` (기존 `_preview-session-c.html` 통합) |
| 6 | 완료 | B · Receipt | `CompleteB` | `mocks/summary.html` |
| 7 | 통계 | 탭 3개 (캘린더/추이/부위) | `StatsA/B/C` | `mocks/stats.html` |
| 8 | 관리 | 탭 3개 (운동/체중/프로필) | `ManageA/B/C` | `mocks/admin.html` |

¹ 사용자 메시지의 "C · Calendar + Ring" 라벨은 v1 표기. v2 시안 채택이므로 화면 = v2 HomeC (진행 중 세션 카드 + 꾹 누르기 옵션).

---

## 1. 원칙

- 시안은 React+JSX 인라인 style. 본 앱은 바닐라 → JSX `style={{camelCase}}` → HTML `style="kebab-case;"` 또는 CSS class 로 변환.
- 시안 다크 톤 그대로 적용. 라이트 변형 만들지 말 것.
- 캐릭터(Clawd) 일체 추가 금지. **부수 작업**: `specs/gym-app-spec.md` §1 (Clawd 포즈 10종) · §5-3 (스트릭 영역) · §6-7 (운동별 프로그레스바) 가 캐릭터 의존이므로 v2 적용에 맞춰 별도 spec 갱신 필요 — 본 작업지시서 범위 외.
- 토큰은 §2 가 권위. 임의값 금지.
- 더미 데이터는 시안 값 그대로 (Phase A). 실 데이터 바인딩은 별도 세션.

---

## 2. 디자인 토큰 (`tokens.css`)

```css
:root {
  --bg: #faf9f5;
  --bg-warm: #f3efe6;
  --bg-deep: #ece7db;
  --surface: #ffffff;
  --surface-2: #f7f4ec;
  --ink: #1a1714;
  --ink-strong: #0c0a08;
  --ink-2: #5a544a;
  --ink-muted: #8d8678;
  --ink-faint: #c4beb1;
  --line: #e6e1d4;
  --line-soft: #efeae0;
  --accent: #d97757;
  --accent-soft: #ecb59f;
  --accent-deep: #b85a3e;
  --accent-tint: #fbe9df;
  --sage: #788c5d;
  --sage-soft: #c0c9aa;
  --night: #1f1c18;
  --r-xl: 22px; --r-lg: 16px; --r-md: 12px; --r-sm: 8px;
  --shadow-card: 0 1px 2px rgba(28,22,16,.04), 0 8px 24px -8px rgba(28,22,16,.08);
  --shadow-lift: 0 32px 64px -12px rgba(217,119,87,.22), 0 12px 28px -10px rgba(28,22,16,.18);
  --font-display: "Poppins", "SF Pro Display", -apple-system, system-ui, sans-serif;
  --font-body: "Noto Sans KR", -apple-system, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, "SF Mono", monospace;
}
* { box-sizing: border-box; -webkit-font-smoothing: antialiased; }
.num { font-family: var(--font-display); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
.kr  { font-family: var(--font-body); }
```

다크 화면은 `bg`를 `#0f0d0a` / `#15120e` / `#0c0a08` 중 하나로 지정. 텍스트 `#fff` / `rgba(255,255,255,.{55|45|35|18|08|06})` 톤.

---

## 3. 공통 셸

### 3-1. Phone 프레임 (mocks 미리보기용)

```jsx
function Phone({ children, bg = "var(--bg)", w = 360, h = 740, dark = false }) {
  const fg = dark ? "#f3efe6" : "var(--ink-strong)";
  return (
    <div style={{
      width: w, height: h, background: bg,
      borderRadius: 38, position: "relative", overflow: "hidden",
      boxShadow: "0 1px 0 rgba(0,0,0,.04), 0 30px 60px -20px rgba(28,22,16,.18), 0 0 0 1px rgba(28,22,16,.06)",
      fontFamily: "var(--font-body)", color: dark ? "#f3efe6" : "var(--ink)",
    }}>
      <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", width: 102, height: 30, borderRadius: 20, background: "#0c0a08", zIndex: 50 }} />
      <div style={{ position: "absolute", top: 16, left: 24, zIndex: 49, fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14, letterSpacing: "-0.01em", color: fg }}>9:41</div>
      <div style={{ position: "absolute", top: 16, right: 24, zIndex: 49, display: "flex", gap: 5, alignItems: "center" }}>
        <div style={{ width: 16, height: 10, borderRadius: 2, border: `1.2px solid ${fg}`, position: "relative" }}>
          <div style={{ position: "absolute", inset: 1.5, background: fg, borderRadius: 1 }}/>
        </div>
      </div>
      <div style={{ position: "absolute", inset: 0, paddingTop: 54, paddingBottom: 24 }}>{children}</div>
      <div style={{ position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)", width: 120, height: 4, borderRadius: 100, background: dark ? "rgba(255,255,255,.32)" : "rgba(0,0,0,.22)", zIndex: 60 }} />
    </div>
  );
}
```

### 3-2. SessionHeader (세션 화면 공통 — `time`/`running` props)

```jsx
function SessionHeader({ time = "18:42", running = true, dark = true }) {
  const ink = dark ? "#fff" : "var(--ink-strong)";
  const muted = dark ? "rgba(255,255,255,0.6)" : "var(--ink-2)";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", padding: "0 22px", height: 44 }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <button style={{ width: 36, height: 36, borderRadius: 10, border: 0, background: dark ? "rgba(255,255,255,0.06)" : "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M3 9l7-6 7 6v8a1 1 0 01-1 1h-3v-5h-6v5H4a1 1 0 01-1-1V9z" stroke={muted} strokeWidth="1.4" strokeLinejoin="round"/></svg>
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
        {running && <span style={{ width: 6, height: 6, borderRadius: 3, background: "var(--accent)", boxShadow: "0 0 10px var(--accent)", animation: "pulse 1.6s ease-in-out infinite" }}/>}
        <span className="num" style={{ fontSize: 28, fontWeight: 300, letterSpacing: "-0.02em", color: ink }}>{time}</span>
      </div>
      <div style={{ textAlign: "right", fontSize: 12, color: muted }} className="kr">종료</div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
    </div>
  );
}
```

### 3-3. SessionFooter (세션 화면 — 종목 nav, 현재 종목 중앙 정렬)

```jsx
function SessionFooter({ dark = true }) {
  const items = [
    { name: "스쿼트", state: "done" },
    { name: "벤치프레스", state: "current", set: "3/5" },
    { name: "인클라인 벤치", state: "pending" },
    { name: "덤벨 플라이", state: "pending" },
  ];
  const muted = dark ? "rgba(255,255,255,0.5)" : "var(--ink-muted)";
  const faint = dark ? "rgba(255,255,255,0.28)" : "var(--ink-faint)";
  return (
    <div style={{
      position: "absolute", bottom: 24, left: 0, right: 0, padding: "12px 16px 4px",
      display: "flex", alignItems: "center", gap: 14, overflow: "hidden",
      borderTop: dark ? "1px solid rgba(255,255,255,0.06)" : "1px solid var(--line-soft)",
      justifyContent: "center"
    }}>
      <div style={{ display: "flex", gap: 18, alignItems: "center", justifyContent: "center", flex: 1, overflowX: "auto" }} className="kr">
        {items.map((it, i) => {
          const isCur = it.state === "current";
          const isDone = it.state === "done";
          return (
            <div key={i} style={{ position: "relative", display: "flex", alignItems: "center", gap: 4, paddingBottom: 4, flexShrink: 0 }}>
              {isCur && <span style={{ position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)", width: 4, height: 4, borderRadius: 2, background: "var(--accent)" }}/>}
              {isDone && <span style={{ color: "var(--sage)", fontSize: 12 }}>✓</span>}
              <span style={{ fontSize: 13, fontWeight: isCur ? 600 : 400, color: isCur ? "var(--accent)" : isDone ? muted : faint }}>{it.name}</span>
              {isCur && <>
                <span style={{ fontSize: 10, color: muted }}>·{it.set}</span>
                <span style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: "var(--accent)" }}/>
              </>}
            </div>
          );
        })}
      </div>
      <button style={{ width: 36, height: 36, borderRadius: 18, border: "1.4px solid rgba(217,119,87,0.45)", background: "transparent", color: "var(--accent)", fontSize: 18, fontWeight: 300, lineHeight: 1, padding: 0, flexShrink: 0 }}>+</button>
    </div>
  );
}
```

### 3-4. HomeHeader / StatsHeader / ManageHeader

```jsx
function HomeHeader({ ink = "#fff", muted = "rgba(255,255,255,0.5)" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px" }}>
      <div className="num" style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", color: ink }}>Gym</div>
      <div style={{ display: "flex", gap: 18, fontSize: 12, color: muted }} className="kr"><span>통계</span><span>관리</span></div>
    </div>
  );
}

function StatsHeader({ active = "cal" }) {
  const tabs = [["cal","캘린더"],["trend","추이"],["body","부위"]];
  return (<>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px" }}>
      <div className="kr" style={{ fontSize: 22, fontWeight: 600, color: "#fff" }}>통계</div>
      <div style={{ display: "flex", gap: 18, fontSize: 12, color: "rgba(255,255,255,0.5)" }} className="kr"><span>홈</span><span>관리</span></div>
    </div>
    <div style={{ marginTop: 22, padding: "0 24px", display: "flex", gap: 22, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      {tabs.map(([k, l]) => {
        const a = k === active;
        return (
          <div key={k} style={{ position: "relative", padding: "8px 0 12px" }}>
            <span className="kr" style={{ fontSize: 13, fontWeight: a ? 600 : 400, color: a ? "#fff" : "rgba(255,255,255,0.45)" }}>{l}</span>
            {a && <div style={{ position: "absolute", bottom: -1, left: 0, right: 0, height: 2, background: "var(--accent)" }}/>}
          </div>
        );
      })}
    </div>
  </>);
}

// ManageHeader 동일 구조, tabs = [["ex","운동"],["weight","체중"],["profile","프로필"]], 좌측 타이틀 "관리", 우측 "홈 / 통계".
```

---

## 4. 화면별 구현

### 4-1. 로그인 — `LoginA` (Minimal Dark)

```jsx
function LoginA() {
  return (
    <Phone bg="#0f0d0a">
      <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: "0 28px", color: "#f3efe6", position: "relative" }}>
        <div style={{ position: "absolute", top: 18, left: 28, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 14, height: 1.5, background: "var(--accent)" }}/>
          <span className="num" style={{ fontSize: 10, color: "rgba(243,239,230,0.55)", letterSpacing: "0.18em", fontWeight: 500 }}>EST · 2026</span>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 36 }}>
          <div className="num" style={{ fontSize: 96, fontWeight: 200, lineHeight: 0.85, color: "#fff", letterSpacing: "-0.06em" }}>Gym</div>
          <div>
            <div className="kr" style={{ fontSize: 30, fontWeight: 300, color: "#fff", lineHeight: 1.25, letterSpacing: "-0.025em" }}>오늘<br/>한 세트만 더.</div>
            <div className="kr" style={{ marginTop: 16, fontSize: 13, color: "rgba(243,239,230,0.45)", letterSpacing: "-0.005em" }}>기록으로 이어지는 운동</div>
          </div>
        </div>
        <div style={{ paddingBottom: 12 }}>
          <button style={{
            width: "100%", height: 56, borderRadius: 16, border: 0,
            background: "#fff", color: "#0f0d0a",
            fontFamily: "var(--font-body)", fontSize: 15, fontWeight: 500,
            display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px",
          }}>
            <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <svg width="16" height="16" viewBox="0 0 16 16">
                <path d="M15.5 8.18c0-.6-.05-1.18-.15-1.73H8v3.27h4.2a3.6 3.6 0 0 1-1.56 2.36v1.96h2.52c1.47-1.36 2.34-3.36 2.34-5.86z" fill="#4285f4"/>
                <path d="M8 16c2.1 0 3.87-.7 5.16-1.9l-2.52-1.95c-.7.47-1.59.75-2.64.75-2.03 0-3.74-1.37-4.36-3.21H1.04v2.02A8 8 0 0 0 8 16z" fill="#34a853"/>
                <path d="M3.64 9.69A4.78 4.78 0 0 1 3.4 8c0-.59.1-1.16.24-1.69V4.29H1.04A8 8 0 0 0 0 8c0 1.29.31 2.5.86 3.58l2.78-1.89z" fill="#fbbc04"/>
                <path d="M8 3.18c1.14 0 2.16.39 2.97 1.16l2.23-2.23A8 8 0 0 0 8 0 8 8 0 0 0 1.04 4.29l2.6 2.02C4.26 4.55 5.97 3.18 8 3.18z" fill="#ea4335"/>
              </svg>
              Google로 계속하기
            </span>
            <span style={{ fontSize: 16, color: "rgba(15,13,10,0.4)" }}>→</span>
          </button>
          <div className="kr" style={{ marginTop: 16, textAlign: "center", fontSize: 11, color: "rgba(243,239,230,0.35)" }}>허용된 계정만 접근할 수 있어요</div>
        </div>
      </div>
    </Phone>
  );
}
```

### 4-2. 홈 idle — `HomeA` (Action-first, bg `#0f0d0a`)

```jsx
function HomeA() {
  const days = ["월","화","수","목","금","토","일"];
  const dates = [4,5,6,7,8,9,10];
  const worked = { 4: "가슴", 6: "등" };
  const today = 6;
  return (
    <Phone bg="#0f0d0a" dark>
      <div style={{ height: "100%", display: "flex", flexDirection: "column", color: "#f3efe6", padding: "8px 0" }}>
        <HomeHeader/>
        <div style={{ marginTop: 26, padding: "0 18px", display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
          {days.map((d, i) => {
            const date = dates[i]; const isToday = date === today; const w = worked[date];
            return (
              <div key={d} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div className="kr" style={{ fontSize: 10, color: isToday ? "#fff" : "rgba(243,239,230,0.4)", fontWeight: isToday ? 600 : 400 }}>{d}</div>
                <div className="num" style={{ fontSize: w ? 18 : 15, fontWeight: w ? 500 : 300, color: w ? "#fff" : (isToday ? "rgba(243,239,230,0.85)" : "rgba(243,239,230,0.3)") }}>{date}</div>
                {w && <div className="kr" style={{ fontSize: 9, color: "rgba(243,239,230,0.5)" }}>{w}</div>}
                {isToday && <div style={{ width: 10, height: 2, borderRadius: 1, background: "var(--accent)", marginTop: 2 }}/>}
              </div>
            );
          })}
        </div>
        <div style={{ flex: 1, padding: "44px 24px 0", position: "relative" }}>
          <div style={{ position: "absolute", top: 30, left: 0, width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(circle, rgba(217,119,87,0.22) 0%, rgba(217,119,87,0) 60%)" }}/>
          <div style={{ position: "relative" }}>
            <div className="kr" style={{ fontSize: 11, color: "rgba(243,239,230,0.45)", letterSpacing: "0.06em", marginBottom: 12 }}>마지막 운동</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <div className="num" style={{ fontSize: 88, fontWeight: 200, lineHeight: 0.85, letterSpacing: "-0.05em", color: "#fff" }}>1</div>
              <div className="kr" style={{ fontSize: 18, color: "rgba(243,239,230,0.6)" }}>일 전</div>
            </div>
            <div style={{ marginTop: 24, display: "flex", gap: 32 }}>
              <div>
                <div className="kr" style={{ fontSize: 10, color: "rgba(243,239,230,0.4)", letterSpacing: "0.06em" }}>마지막 부위</div>
                <div className="kr" style={{ marginTop: 6, fontSize: 16, color: "#fff", fontWeight: 500 }}>가슴</div>
              </div>
              <div style={{ width: 1, background: "rgba(243,239,230,0.1)" }}/>
              <div>
                <div className="kr" style={{ fontSize: 10, color: "rgba(243,239,230,0.4)", letterSpacing: "0.06em" }}>이번 주</div>
                <div style={{ marginTop: 4, display: "flex", alignItems: "baseline", gap: 3 }}>
                  <span className="num" style={{ fontSize: 22, fontWeight: 500, color: "#fff" }}>1</span>
                  <span className="kr" style={{ fontSize: 11, color: "rgba(243,239,230,0.5)" }}>/4회</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div style={{ padding: "0 24px 8px" }}>
          <div className="kr" style={{ fontSize: 11, color: "rgba(243,239,230,0.4)", marginBottom: 12, textAlign: "center" }}>한 세트만 더.</div>
          <button style={{ width: "100%", height: 56, borderRadius: 28, border: 0, background: "var(--accent)", color: "#fff", fontFamily: "var(--font-body)", fontSize: 15, fontWeight: 500, boxShadow: "0 14px 30px -8px rgba(217,119,87,.55)" }}>운동 시작</button>
        </div>
      </div>
    </Phone>
  );
}
```

### 4-3. 홈 active — `HomeC` (진행 중 세션 + 꾹누르기 hint, bg `#0c0a08`)

```jsx
function HomeC() {
  return (
    <Phone bg="#0c0a08" dark>
      <div style={{ height: "100%", display: "flex", flexDirection: "column", color: "#f3efe6", padding: "8px 0" }}>
        <HomeHeader/>
        <div style={{ margin: "26px 20px 0", padding: "22px", borderRadius: 22, background: "linear-gradient(155deg, #1a1612 0%, #1a1612 60%, #2a1d16 100%)", position: "relative", overflow: "hidden", border: "1px solid rgba(217,119,87,0.18)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: "var(--accent)", boxShadow: "0 0 12px var(--accent)" }}/>
            <span className="kr" style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600, letterSpacing: "0.14em" }}>진행 중</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <div className="num" style={{ fontSize: 56, fontWeight: 200, lineHeight: 0.9, color: "#fff", letterSpacing: "-0.04em" }}>18:42</div>
            <div className="kr" style={{ fontSize: 13, color: "rgba(243,239,230,0.5)" }}>경과</div>
          </div>
          <div style={{ marginTop: 18, display: "flex", gap: 24, alignItems: "baseline" }}>
            <div><div className="kr" style={{ fontSize: 10, color: "rgba(243,239,230,0.4)", letterSpacing: "0.06em" }}>부위</div><div className="kr" style={{ marginTop: 4, fontSize: 14, color: "#fff", fontWeight: 500 }}>가슴</div></div>
            <div><div className="kr" style={{ fontSize: 10, color: "rgba(243,239,230,0.4)", letterSpacing: "0.06em" }}>종목</div><div className="kr" style={{ marginTop: 4, fontSize: 14, color: "#fff", fontWeight: 500 }}>1 <span style={{ color: "rgba(243,239,230,0.4)" }}>/ 2</span></div></div>
            <div><div className="kr" style={{ fontSize: 10, color: "rgba(243,239,230,0.4)", letterSpacing: "0.06em" }}>볼륨</div><div className="num" style={{ marginTop: 4, fontSize: 14, color: "#fff", fontWeight: 500 }}>600<span className="kr" style={{ fontSize: 10, color: "rgba(243,239,230,0.5)", marginLeft: 2 }}>kg</span></div></div>
          </div>
          <div style={{ marginTop: 18, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
            <div style={{ width: "55%", height: "100%", background: "var(--accent)" }}/>
          </div>
          <button style={{ marginTop: 18, width: "100%", height: 46, borderRadius: 14, border: 0, background: "var(--accent)", color: "#fff", fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px" }}>
            <span>이어가기</span><span style={{ fontSize: 16 }}>→</span>
          </button>
        </div>
        <div style={{ margin: "16px 20px 0", padding: "12px 16px", borderRadius: 14, border: "1px dashed rgba(243,239,230,0.12)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="kr" style={{ fontSize: 11, color: "rgba(243,239,230,0.4)" }}>카드를 꾹 누르면</div>
          <div style={{ display: "flex", gap: 14 }}>
            <span className="kr" style={{ fontSize: 11, color: "rgba(243,239,230,0.65)" }}>완료</span>
            <span className="kr" style={{ fontSize: 11, color: "rgba(243,239,230,0.65)" }}>일시정지</span>
            <span className="kr" style={{ fontSize: 11, color: "var(--accent)" }}>삭제</span>
          </div>
        </div>
        <div style={{ marginTop: "auto", padding: "0 24px 12px" }}>
          <div className="kr" style={{ fontSize: 10, color: "rgba(243,239,230,0.35)", letterSpacing: "0.08em", marginBottom: 8 }}>지난 세션</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingTop: 12, borderTop: "1px solid rgba(243,239,230,0.08)" }}>
            <div>
              <div className="kr" style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>가슴 · 5월 5일</div>
              <div className="kr" style={{ marginTop: 2, fontSize: 11, color: "rgba(243,239,230,0.45)" }}>벤치프레스 60×10 · 4세트</div>
            </div>
            <div className="num" style={{ fontSize: 22, fontWeight: 200, color: "#fff" }}>2,400<span className="kr" style={{ fontSize: 11, color: "rgba(243,239,230,0.5)", marginLeft: 2 }}>kg</span></div>
          </div>
        </div>
      </div>
    </Phone>
  );
}
```

**홈 분기 룰**: 진행 중 세션 존재 → `HomeC`. 없으면 `HomeA`. (실 데이터 분기는 Phase B)

### 4-4. 세션 빈 시작 — `SessionEmpty` (bg `#0c0a08`)

```jsx
function SessionEmpty() {
  const cats = ["가슴","등","어깨","하체","팔","유산소"];
  const ex = [
    { name: "벤치프레스", meta: "60kg × 10회" },
    { name: "인클라인 벤치", meta: "45kg × 10회" },
    { name: "디클라인 벤치", meta: "50kg × 10회" },
    { name: "덤벨 플라이", meta: "18kg × 12회" },
    { name: "케이블 크로스오버", meta: "20kg × 12회" },
  ];
  return (
    <Phone bg="#0c0a08" dark>
      <SessionHeader time="00:00" running={false}/>
      <div style={{ position: "absolute", top: 130, left: 0, right: 0, textAlign: "center", padding: "0 32px" }}>
        <div className="kr" style={{ fontSize: 11, color: "rgba(243,239,230,0.4)", letterSpacing: "0.16em", fontWeight: 600 }}>NEW SESSION</div>
        <div className="kr" style={{ marginTop: 18, fontSize: 24, color: "#fff", fontWeight: 300, lineHeight: 1.4, letterSpacing: "-0.02em" }}>오늘은 어디부터<br/>시작할까요?</div>
        <div className="kr" style={{ marginTop: 14, fontSize: 12, color: "rgba(243,239,230,0.45)" }}>아래에서 종목을 추가하세요</div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "#15120e", borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: "12px 0 24px", boxShadow: "0 -16px 40px -10px rgba(0,0,0,0.35)" }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.18)", margin: "0 auto 18px" }}/>
        <div style={{ display: "flex", gap: 8, padding: "0 16px", overflowX: "auto", justifyContent: "center" }}>
          {cats.map((c, i) => (
            <div key={c} className="kr" style={{
              flexShrink: 0, padding: "8px 16px", borderRadius: 999,
              fontSize: 13, fontWeight: i === 0 ? 600 : 400,
              background: i === 0 ? "var(--accent)" : "rgba(255,255,255,0.05)",
              color: i === 0 ? "#fff" : "rgba(255,255,255,0.7)",
              border: i === 0 ? 0 : "1px solid rgba(255,255,255,0.08)",
            }}>{c}</div>
          ))}
        </div>
        <div style={{ marginTop: 14, padding: "0 8px" }}>
          {ex.map((e, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 14px", borderRadius: 12 }}>
              <div className="kr" style={{ fontSize: 14, color: "#fff", fontWeight: 500 }}>{e.name}</div>
              <div className="num" style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{e.meta}</div>
            </div>
          ))}
        </div>
      </div>
    </Phone>
  );
}
```

### 4-5. 세션 (active) — `SessionC` (Receipt / Mono, bg `#0c0a08`)

> 기존 `mocks/_preview-session-c.html` 검토 후 `mocks/session.html` 로 통합. SessionHeader/Footer 사용.

```jsx
function SessionC() {
  return (
    <Phone bg="#0c0a08" dark>
      <SessionHeader/>
      <div style={{ padding: "16px 24px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div className="kr" style={{ fontSize: 14, color: "#fff", fontWeight: 500 }}>벤치프레스</div>
          <div className="num" style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", letterSpacing: "0.1em" }}>SET 03 / 05</div>
        </div>
      </div>
      <div style={{ position: "absolute", top: 150, left: 0, right: 0, padding: "0 24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <span style={{ fontSize: 14, color: "rgba(255,255,255,0.3)" }}>←</span>
          <div className="num" style={{ fontSize: 16, color: "rgba(255,255,255,0.35)", letterSpacing: "0.04em" }}>55kg × 9</div>
        </div>
        <div style={{ marginTop: 14, textAlign: "center" }}>
          <div className="num" style={{ fontSize: 132, fontWeight: 200, lineHeight: 1, color: "#fff", letterSpacing: "-0.05em" }}>60</div>
          <div className="kr" style={{ marginTop: -2, fontSize: 13, color: "rgba(255,255,255,0.5)" }}>킬로그램</div>
        </div>
        <div style={{ marginTop: 22, display: "flex", justifyContent: "center", alignItems: "center", gap: 16 }}>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }}/>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <span className="num" style={{ fontSize: 48, fontWeight: 300, color: "#fff" }}>10</span>
            <span className="kr" style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>회</span>
          </div>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }}/>
        </div>
        <div style={{ marginTop: 26, display: "flex", justifyContent: "center", gap: 22 }} className="num">
          {[
            { s: "S1", v: "60·12", c: "muted" },
            { s: "S2", v: "60·11", c: "muted" },
            { s: "S3", v: "60·10", c: "cur" },
            { s: "S4", v: "—", c: "faint" },
            { s: "S5", v: "—", c: "faint" },
          ].map((x, i) => {
            const col = x.c === "cur" ? "var(--accent)" : x.c === "muted" ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.25)";
            return (
              <div key={i} style={{ textAlign: "center", color: col, fontWeight: x.c === "cur" ? 600 : 400 }}>
                <div style={{ fontSize: 10, letterSpacing: "0.06em" }}>{x.s}</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>{x.v}</div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 26, padding: "0 4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="kr" style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em" }}>← 이전 수정</div>
          <div className="kr" style={{ fontSize: 10, color: "var(--accent)", fontWeight: 600, letterSpacing: "0.1em" }}>완료 →</div>
        </div>
        <div style={{ marginTop: 14, height: 2, background: "rgba(255,255,255,0.08)", position: "relative" }}>
          <div style={{ width: "20%", height: "100%", background: "var(--accent)" }}/>
        </div>
        <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between" }} className="num">
          <span style={{ fontSize: 10, color: "var(--accent)" }}>600 / 3,000kg</span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>20%</span>
        </div>
      </div>
      <SessionFooter/>
    </Phone>
  );
}
```

**중요**: 시안에 보이는 "← 이전 수정 / 완료 →" 텍스트는 시안용 가이드. spec §6-3-1 "지시문·힌트 금지" 와 충돌 — 실 src 적용 시(Phase B) 제거. mocks 단계는 시안 그대로 둬도 됨 (시각 비교용).

### 4-6. 운동 완료 — `CompleteB` (Receipt, 모달)

```jsx
function CompleteShell({ children, bg = "rgba(8,6,4,0.78)" }) {
  return (
    <Phone bg={bg} dark>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{children}</div>
    </Phone>
  );
}

function CompleteB() {
  return (
    <CompleteShell>
      <div style={{ width: 280, background: "#15120e", padding: "26px 24px 18px", boxShadow: "0 30px 60px -10px rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.06)", clipPath: "polygon(0 0, 100% 0, 100% 100%, 95% 98%, 90% 100%, 85% 98%, 80% 100%, 75% 98%, 70% 100%, 65% 98%, 60% 100%, 55% 98%, 50% 100%, 45% 98%, 40% 100%, 35% 98%, 30% 100%, 25% 98%, 20% 100%, 15% 98%, 10% 100%, 5% 98%, 0 100%)" }}>
        <div style={{ textAlign: "center", paddingBottom: 16, borderBottom: "1px dashed rgba(255,255,255,0.15)" }}>
          <div className="num" style={{ fontSize: 22, fontWeight: 600, letterSpacing: "0.08em", color: "#fff" }}>GYM</div>
          <div className="kr" style={{ marginTop: 6, fontSize: 9, color: "rgba(255,255,255,0.45)", letterSpacing: "0.18em" }}>SESSION RECEIPT · #0142</div>
          <div className="num" style={{ marginTop: 6, fontSize: 10, color: "rgba(255,255,255,0.45)" }}>2026-05-06 · WED · 18:42→19:34</div>
        </div>
        <div style={{ padding: "14px 0", borderBottom: "1px dashed rgba(255,255,255,0.15)" }}>
          {[["벤치프레스","5×","600kg",true],["인클라인 벤치","4×","180kg",false],["덤벨 플라이","3×","108kg",false]].map((row,i)=>(
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "5px 0" }} className="kr">
              <span style={{ fontSize: 12, color: "#fff", display: "flex", alignItems: "center", gap: 6 }}>
                {row[0]}{row[3] && <span style={{ fontSize: 8, color: "var(--accent)", padding: "1px 5px", border: "1px solid var(--accent)", borderRadius: 3, fontWeight: 600 }}>PR</span>}
              </span>
              <span className="num" style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{row[1]}</span>
              <span className="num" style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>{row[2]}</span>
            </div>
          ))}
        </div>
        <div style={{ padding: "14px 0", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span className="kr" style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", letterSpacing: "0.1em" }}>TOTAL</span>
          <div className="num" style={{ fontSize: 36, fontWeight: 300, color: "#fff", letterSpacing: "-0.02em" }}>888<span style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginLeft: 4 }}>kg</span></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, paddingBottom: 14, borderBottom: "1px dashed rgba(255,255,255,0.15)" }} className="num">
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>52분</div>
          <div style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600, textAlign: "center" }}>1 PR ★</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textAlign: "right" }}>286 kcal</div>
        </div>
        <div className="kr" style={{ textAlign: "center", padding: "16px 0 12px", fontSize: 11, color: "rgba(255,255,255,0.5)", letterSpacing: "0.06em" }}>오늘도 한 줄, 기록 완료</div>
        <button style={{ width: "100%", height: 38, borderRadius: 0, border: "1px solid #fff", background: "transparent", color: "#fff", fontSize: 12, fontWeight: 500, letterSpacing: "0.06em" }} className="kr">홈으로</button>
      </div>
    </CompleteShell>
  );
}
```

### 4-7. 통계 — `StatsA/B/C` (탭, bg `#0c0a08`)

```jsx
function StatsA() { // 캘린더
  const dates = Array.from({length: 31}, (_, i) => i + 1);
  const worked = { 1:1, 4:2, 6:3, 8:1, 11:2, 13:1, 15:2, 18:3, 22:1, 25:2, 27:1 };
  const today = 6;
  return (
    <Phone bg="#0c0a08" dark>
      <StatsHeader active="cal"/>
      <div style={{ padding: "20px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 18 }}>‹</span>
        <div className="num" style={{ fontSize: 14, color: "#fff", fontWeight: 500, letterSpacing: "0.04em" }}>2026 · 5월</div>
        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 18 }}>›</span>
      </div>
      <div style={{ padding: "16px 18px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, color: "rgba(255,255,255,0.4)", fontSize: 10 }} className="kr">
          {["월","화","수","목","금","토","일"].map(d=><div key={d} style={{ textAlign: "center", paddingBottom: 8 }}>{d}</div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
          {Array(4).fill(0).map((_,i)=><div key={"e"+i}/>)}
          {dates.map(d => {
            const intensity = worked[d] || 0; const isToday = d === today;
            const w = 11 + intensity * 1.5; const c = intensity ? "#fff" : "rgba(255,255,255,0.3)";
            return (
              <div key={d} style={{ aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", position: "relative" }}>
                <span className="num" style={{ fontSize: w, fontWeight: intensity ? 600 : 300, color: c }}>{d}</span>
                {isToday && <div style={{ position: "absolute", bottom: 6, width: 12, height: 2, background: "var(--accent)", borderRadius: 1 }}/>}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ margin: "16px 20px 0", padding: "16px 18px", borderRadius: 16, background: "#15120e", border: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="kr" style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", letterSpacing: "0.06em" }}>이번 주</div>
        <div style={{ marginTop: 6, display: "flex", alignItems: "baseline", gap: 8 }}>
          <span className="num" style={{ fontSize: 28, fontWeight: 300, color: "#fff" }}>12,450<span className="kr" style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginLeft: 3 }}>kg</span></span>
          <span className="kr" style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600 }}>+8%</span>
        </div>
        <div className="kr" style={{ marginTop: 4, fontSize: 11, color: "rgba(255,255,255,0.45)" }}>지난 주 11,520kg 대비</div>
      </div>
    </Phone>
  );
}

function StatsB() { // 추이 (8주 라인)
  const data = [55,62,58,71,68,75,82,86];
  const max = Math.max(...data), min = Math.min(...data);
  const w = 280, h = 110;
  const pts = data.map((v,i)=>[(i/(data.length-1))*w, h - ((v-min)/(max-min))*h]);
  const path = pts.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  return (
    <Phone bg="#0c0a08" dark>
      <StatsHeader active="trend"/>
      <div style={{ padding: "26px 24px 0" }}>
        <div className="kr" style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", letterSpacing: "0.06em" }}>최근 8주 · 주간 볼륨</div>
        <div style={{ marginTop: 6, display: "flex", alignItems: "baseline", gap: 8 }}>
          <span className="num" style={{ fontSize: 44, fontWeight: 200, color: "#fff", letterSpacing: "-0.03em" }}>12.4K</span>
          <span className="kr" style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>kg / 주</span>
          <span className="kr" style={{ marginLeft: "auto", fontSize: 11, color: "var(--accent)", fontWeight: 600, padding: "3px 8px", background: "rgba(217,119,87,0.16)", borderRadius: 999 }}>↑ +8%</span>
        </div>
        <svg viewBox={`-4 -10 ${w+8} ${h+30}`} style={{ marginTop: 18, width: "100%", height: 140, overflow: "visible" }}>
          <defs>
            <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(217,119,87,0.32)"/>
              <stop offset="100%" stopColor="rgba(217,119,87,0)"/>
            </linearGradient>
          </defs>
          <path d={`${path} L${w} ${h} L0 ${h} Z`} fill="url(#grad)"/>
          <path d={path} stroke="var(--accent)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          {pts.map((p,i)=>(
            <circle key={i} cx={p[0]} cy={p[1]} r={i === pts.length-1 ? 5 : 2.5} fill={i === pts.length-1 ? "var(--accent)" : "rgba(255,255,255,0.5)"} stroke={i === pts.length-1 ? "#0c0a08" : "none"} strokeWidth={i === pts.length-1 ? 3 : 0}/>
          ))}
          <g fill="rgba(255,255,255,0.35)" fontSize="9">
            {["8주전","6주전","4주전","2주전","이번"].map((l,i)=><text key={l} x={(i/4)*w} y={h+18} textAnchor="middle" className="kr">{l}</text>)}
          </g>
        </svg>
      </div>
      <div style={{ margin: "32px 20px 0", padding: "18px 0", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
        {[["볼륨 PR","86K","kg"],["연속","3","주"],["평균","12.4K","kg/주"]].map((s,i)=>(
          <div key={i} style={{ textAlign: "center" }}>
            <div className="num" style={{ fontSize: 18, fontWeight: 500, color: i === 0 ? "var(--accent)" : "#fff" }}>{s[1]}<span className="kr" style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginLeft: 2 }}>{s[2]}</span></div>
            <div className="kr" style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>{s[0]}</div>
          </div>
        ))}
      </div>
    </Phone>
  );
}

function StatsC() { // 부위 분포
  const parts = [["가슴",32,"#d97757"],["등",26,"#788c5d"],["하체",18,"#b85a3e"],["어깨",14,"#c9a96e"],["팔",10,"#6b8a9c"]];
  const total = parts.reduce((s,p)=>s+p[1],0);
  return (
    <Phone bg="#0c0a08" dark>
      <StatsHeader active="body"/>
      <div style={{ padding: "26px 24px 0" }}>
        <div className="kr" style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", letterSpacing: "0.06em" }}>이번 달 부위 분포</div>
        <div style={{ marginTop: 6, display: "flex", alignItems: "baseline", gap: 8 }}>
          <span className="num" style={{ fontSize: 44, fontWeight: 200, color: "#fff", letterSpacing: "-0.03em" }}>14</span>
          <span className="kr" style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>회 운동</span>
        </div>
        <div style={{ marginTop: 22, height: 10, borderRadius: 5, overflow: "hidden", display: "flex", background: "rgba(255,255,255,0.06)" }}>
          {parts.map((p,i)=><div key={i} style={{ width: `${(p[1]/total)*100}%`, background: p[2] }}/>)}
        </div>
        <div style={{ marginTop: 22 }}>
          {parts.map((p,i)=>{
            const pct = ((p[1]/total)*100).toFixed(0);
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", padding: "11px 0", borderTop: i ? "1px solid rgba(255,255,255,0.04)" : 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: p[2], marginRight: 12 }}/>
                <span className="kr" style={{ fontSize: 14, color: "#fff", fontWeight: 500, flex: 1 }}>{p[0]}</span>
                <div style={{ flex: 2, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", marginRight: 14, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: p[2] }}/>
                </div>
                <span className="num" style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", minWidth: 32, textAlign: "right" }}>{p[1]}<span className="kr" style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginLeft: 2 }}>회</span></span>
                <span className="num" style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", minWidth: 36, textAlign: "right" }}>{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ position: "absolute", left: 20, right: 20, bottom: 28, padding: "14px 18px", borderRadius: 14, background: "rgba(217,119,87,0.10)", border: "1px solid rgba(217,119,87,0.25)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="kr" style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>팔이 부족해요</div>
          <div className="kr" style={{ marginTop: 2, fontSize: 11, color: "rgba(255,255,255,0.55)" }}>이번 주 팔 1회 · 권장 2회</div>
        </div>
        <span className="kr" style={{ fontSize: 12, color: "var(--accent)" }}>→</span>
      </div>
    </Phone>
  );
}
```

**통계 추가 요구 (chat 발췌)**: 캘린더 날짜 탭 → 바텀시트로 그날 운동·세트 기록. 시안에는 미반영 — Phase B 에서 구현.

### 4-8. 관리 — `ManageA/B/C` (탭, bg `#0c0a08`)

```jsx
function ManageHeader({ active = "ex" }) {
  const tabs = [["ex","운동"],["weight","체중"],["profile","프로필"]];
  return (<>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px" }}>
      <div className="kr" style={{ fontSize: 22, fontWeight: 600, color: "#fff" }}>관리</div>
      <div style={{ display: "flex", gap: 18, fontSize: 12, color: "rgba(255,255,255,0.5)" }} className="kr"><span>홈</span><span>통계</span></div>
    </div>
    <div style={{ marginTop: 22, padding: "0 24px", display: "flex", gap: 22, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      {tabs.map(([k, l]) => {
        const a = k === active;
        return (
          <div key={k} style={{ position: "relative", padding: "8px 0 12px" }}>
            <span className="kr" style={{ fontSize: 13, fontWeight: a ? 600 : 400, color: a ? "#fff" : "rgba(255,255,255,0.45)" }}>{l}</span>
            {a && <div style={{ position: "absolute", bottom: -1, left: 0, right: 0, height: 2, background: "var(--accent)" }}/>}
          </div>
        );
      })}
    </div>
  </>);
}

function ManageA() { // 운동
  const cats = ["가슴","등","어깨","하체","팔","유산소"];
  const ex = [
    { name: "벤치프레스", meta: "60kg × 10회", on: true },
    { name: "인클라인 벤치", meta: "45kg × 10회", on: true },
    { name: "디클라인 벤치", meta: "50kg × 10회", on: true },
    { name: "덤벨 플라이", meta: "18kg × 12회", on: true },
    { name: "케이블 크로스오버", meta: "20kg × 12회", on: false },
    { name: "푸시업", meta: "맨몸 · 15회", on: true },
  ];
  return (
    <Phone bg="#0c0a08" dark>
      <ManageHeader active="ex"/>
      <div style={{ padding: "16px 16px 0", display: "flex", gap: 8, overflowX: "auto" }}>
        {cats.map((c, i) => (
          <div key={c} className="kr" style={{
            flexShrink: 0, padding: "7px 14px", borderRadius: 999, fontSize: 12,
            fontWeight: i === 0 ? 600 : 400,
            background: i === 0 ? "rgba(255,255,255,0.1)" : "transparent",
            color: i === 0 ? "#fff" : "rgba(255,255,255,0.55)",
            border: i === 0 ? 0 : "1px solid rgba(255,255,255,0.08)",
          }}>{c}</div>
        ))}
      </div>
      <div style={{ marginTop: 8, padding: "0 8px" }}>
        {ex.map((e, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", padding: "13px 14px", borderTop: i ? "1px solid rgba(255,255,255,0.04)" : 0 }}>
            <span style={{ display: "flex", flexDirection: "column", gap: 2.5, marginRight: 14, opacity: 0.4 }}>
              <span style={{ width: 10, height: 1.5, background: "rgba(255,255,255,0.5)" }}/>
              <span style={{ width: 10, height: 1.5, background: "rgba(255,255,255,0.5)" }}/>
              <span style={{ width: 10, height: 1.5, background: "rgba(255,255,255,0.5)" }}/>
            </span>
            <div style={{ flex: 1 }}>
              <div className="kr" style={{ fontSize: 14, color: e.on ? "#fff" : "rgba(255,255,255,0.4)", fontWeight: 500 }}>{e.name}</div>
            </div>
            <div className="num" style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginRight: 14 }}>{e.meta}</div>
            <div style={{ width: 36, height: 22, borderRadius: 11, background: e.on ? "var(--accent)" : "rgba(255,255,255,0.12)", position: "relative" }}>
              <div style={{ position: "absolute", top: 2, left: e.on ? 16 : 2, width: 18, height: 18, borderRadius: 9, background: "#fff", transition: "left .2s" }}/>
            </div>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 20, right: 20, bottom: 28 }}>
        <button style={{ width: "100%", height: 48, borderRadius: 14, border: "1px dashed rgba(255,255,255,0.25)", background: "transparent", color: "rgba(255,255,255,0.7)", fontSize: 13 }} className="kr">+ 커스텀 운동 추가</button>
      </div>
    </Phone>
  );
}

function ManageB() { // 체중
  const w = 280, h = 100;
  const data = [72.4,72.1,71.9,71.6,71.3,71.5,71.0,70.7,70.5,70.2,70.0,69.8,69.6,69.4];
  const max = Math.max(...data) + 0.4, min = Math.min(...data) - 0.4;
  const pts = data.map((v,i)=>[(i/(data.length-1))*w, h - ((v-min)/(max-min))*h]);
  const path = pts.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const targetY = h - ((69 - min)/(max - min))*h;
  return (
    <Phone bg="#0c0a08" dark>
      <ManageHeader active="weight"/>
      <div style={{ padding: "26px 24px 0" }}>
        <div className="kr" style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", letterSpacing: "0.06em" }}>현재 체중</div>
        <div style={{ marginTop: 4, display: "flex", alignItems: "baseline", gap: 4 }}>
          <span className="num" style={{ fontSize: 64, fontWeight: 200, color: "#fff", letterSpacing: "-0.04em", lineHeight: 0.9 }}>69.4</span>
          <span className="kr" style={{ fontSize: 16, color: "rgba(255,255,255,0.5)" }}>kg</span>
          <span className="kr" style={{ marginLeft: "auto", fontSize: 11, color: "var(--accent)", fontWeight: 600, padding: "3px 8px", background: "rgba(217,119,87,0.16)", borderRadius: 999 }}>↓ -3.0</span>
        </div>
        <div className="kr" style={{ marginTop: 6, fontSize: 11, color: "rgba(255,255,255,0.45)" }}>목표 69kg · 0.4kg 남음 · 약 5일 후 도달</div>
        <svg viewBox={`-2 -10 ${w+4} ${h+30}`} style={{ marginTop: 22, width: "100%", height: 130, overflow: "visible" }}>
          <defs>
            <linearGradient id="wgrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(217,119,87,0.22)"/>
              <stop offset="100%" stopColor="rgba(217,119,87,0)"/>
            </linearGradient>
          </defs>
          <line x1="0" y1={targetY} x2={w} y2={targetY} stroke="rgba(120,140,93,0.6)" strokeWidth="1" strokeDasharray="3 3"/>
          <text x={w} y={targetY-5} textAnchor="end" fontSize="9" className="kr" fill="rgba(120,140,93,0.85)">목표 69</text>
          <path d={`${path} L${w} ${h} L0 ${h} Z`} fill="url(#wgrad)"/>
          <path d={path} stroke="var(--accent)" strokeWidth="2" fill="none" strokeLinecap="round"/>
          <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="5" fill="var(--accent)" stroke="#0c0a08" strokeWidth="2.5"/>
          <g fontSize="9" fill="rgba(255,255,255,0.35)" className="kr">
            <text x="0" y={h+18}>14일 전</text>
            <text x={w} y={h+18} textAnchor="end">오늘</text>
          </g>
        </svg>
      </div>
      <div style={{ margin: "20px 20px 0", padding: "14px 0", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {[["시작","72.4","kg"],["최저","69.4","kg"],["7일 평균","69.7","kg"]].map((s,i)=>(
          <div key={i} style={{ textAlign: "center" }}>
            <div className="num" style={{ fontSize: 16, fontWeight: 500, color: i === 1 ? "var(--accent)" : "#fff" }}>{s[1]}<span className="kr" style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginLeft: 2 }}>{s[2]}</span></div>
            <div className="kr" style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>{s[0]}</div>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 20, right: 20, bottom: 28 }}>
        <button style={{ width: "100%", height: 48, borderRadius: 14, border: 0, background: "var(--accent)", color: "#fff", fontSize: 14, fontWeight: 500 }} className="kr">+ 오늘 체중 입력</button>
      </div>
    </Phone>
  );
}

function ManageC() { // 프로필
  return (
    <Phone bg="#0c0a08" dark>
      <ManageHeader active="profile"/>
      <div style={{ padding: "8px 0 0" }}>
        {[["키","173","cm"],["생년","1990",""],["목표 체중","69","kg"],["주간 목표","4","회"]].map((row, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <span className="kr" style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>{row[0]}</span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span className="num" style={{ fontSize: 16, color: "#fff", fontWeight: 500 }}>{row[1]}</span>
              {row[2] && <span className="kr" style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{row[2]}</span>}
            </div>
          </div>
        ))}
      </div>
      <div style={{ margin: "26px 20px 0", padding: "16px 18px", borderRadius: 14, background: "rgba(120,140,93,0.10)", border: "1px solid rgba(120,140,93,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: "var(--sage)", boxShadow: "0 0 8px var(--sage)" }}/>
          <span className="kr" style={{ fontSize: 12, color: "var(--sage-soft)", fontWeight: 600, letterSpacing: "0.06em" }}>동기화 정상</span>
        </div>
        <div className="kr" style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.55)" }}>방금 · 지오c · leftjap@gmail.com</div>
      </div>
      <div style={{ margin: "16px 20px 0" }}>
        <button style={{ width: "100%", height: 46, borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "rgba(255,255,255,0.7)", fontSize: 13 }} className="kr">로그아웃</button>
      </div>
      <div className="kr" style={{ position: "absolute", left: 0, right: 0, bottom: 28, textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: "0.16em" }}>GYM · EST · 2026</div>
    </Phone>
  );
}
```

---

## 5. JSX → 바닐라 변환 규칙

| JSX | 바닐라 |
|---|---|
| `className="kr num"` | `class="kr num"` |
| `style={{ fontSize: 96, fontWeight: 200 }}` | `style="font-size:96px; font-weight:200;"` (단위 없는 숫자는 px) |
| `<>fragment</>` | div 또는 그대로 형제 노드 |
| `{worked && <X/>}` | DOM 조건 추가/제거 또는 `data-state` |
| `{arr.map(...)}` | 템플릿 문자열 + `innerHTML` 또는 동적 DOM 생성 |
| `onClick={fn}` | `addEventListener('click', fn)` |
| inline `<svg>` | 그대로 HTML |
| `<style>{`@keyframes...`}</style>` | 전역 CSS 또는 `<style>` 한 번만 |

**공통 클래스로 빼야 깔끔한 것** (반복 등장):
- 다크 텍스트 alpha 단계: `--ink-d-90` `#fff` / `--ink-d-65` `rgba(255,255,255,.65)` / `--ink-d-45` 등 → tokens.css 보강 권장 (단 본 작업지시 범위 외, 인라인 그대로도 OK).

---

## 6. 작업 순서 (Phase A — mocks 정합)

1. `mocks/login.html` ← LoginA
2. `mocks/home.html` ← HomeA + HomeC (진행 중 세션 유무로 분기. 목 데이터로 두 분기 시각 확인)
3. `mocks/session-empty.html` (신규) ← SessionEmpty
4. `mocks/session.html` ← SessionC (`mocks/_preview-session-c.html` 검토 후 통합·삭제)
5. `mocks/summary.html` ← CompleteB
6. `mocks/stats.html` ← StatsA/B/C (탭 전환 mocks 단계는 hash/data-attr 토글로 충분)
7. `mocks/admin.html` ← ManageA/B/C (동일)
8. claude.ai/design 시안 v2 와 시각 비교 → 사용자 컨펌

Phase B (별도 세션): `src/features/*` 실 데이터 연결, 세션 spec §6 인터랙션 (스와이프·꾹누르기·키패드).

---

## 7. 금지 / 주의

- **Clawd 캐릭터 일체 추가 금지** (v2 = 캐릭터 제거)
- 라이트 변형 만들지 말 것 (시안 다크 그대로)
- 토큰 임의값 금지 — `--accent` `#d97757`, 다크 배경 `#0f0d0a`/`#15120e`/`#0c0a08` 외 사용 금지
- 시안 SessionC 의 "← 이전 수정 / 완료 →" 텍스트는 mocks 단계만 유지. Phase B 에서 spec §6-3-1 "지시문 금지"에 따라 제거
- 데이터는 시안 더미 그대로 (Phase A). 실 IndexedDB 바인딩 금지
- 새 의존성 추가 금지 — React 도입 X. 바닐라 유지

---

## 8. 체크리스트

- [ ] `tokens.css` 변경 없음 (값 인용만)
- [ ] LoginA 시각 일치
- [ ] HomeA (idle) 시각 일치
- [ ] HomeC (active) 시각 일치 + 분기 토글 동작
- [ ] SessionEmpty 시각 일치 (시트 + 카테고리 chip 중앙 정렬)
- [ ] SessionC 시각 일치 + `_preview-session-c.html` 정리
- [ ] CompleteB 시각 일치 (clipPath 영수증 톱니, dashed 구분선)
- [ ] StatsA/B/C 탭 전환 동작
- [ ] ManageA/B/C 탭 전환 동작
- [ ] Clawd 잔존 검색: `rg -n -i 'clawd|character|pose=' mocks/` → 0건
- [ ] 시안 v2 와 사용자 시각 컨펌 후 commit

---

**참고 자료** (필요 시): 본 저장소 `specs/gym-app-spec.md` §5 (홈) / §6 (세션) / §7 (완료) / §9 (통계) / §10 (관리). 디자인 룰 충돌 시 본 문서가 권위.

---

## 9. Phase B 인계 메모 (Phase A 종료 시점 — 2026-05-10)

Phase A 는 mocks/ 정합만 처리. 아래는 src/specs/e2e 잔존 — Phase B 에서 처리.

- `src/app.js:4` `import pickerHtml from '../mocks/picker.html?raw'` 의존 → `mocks/picker.html` 보존. SessionEmpty 와 기능 중복은 src 가 v2 시안 기반으로 재작성될 때 같이 정리.
- `src/features/home.js` `clawd` 객체 (state/anim/size 매핑) — v2 다크 시안에서 캐릭터 제거. spec §1·§5-3 갱신 후 같이 정리.
- `src/db/exercises.js` `EXERCISE_POSE` 매핑 + `src/db/exercises.test.js` Clawd 포즈 테스트.
- `src/features/home.test.js` `r.clawd` assertion 4건.
- `e2e/home-active-card.spec.js` Clawd 흔적 (일부 v2 주석으로 정리됨, 잔여 정리).
- `specs/gym-app-spec.md` §1 (Clawd 포즈 10종) · §5-3 (스트릭 + Clawd) · §6-7 (운동별 프로그레스바 + Clawd) — 본 작업지시서 §1 명시 "범위 외". v2 캐릭터 제거 반영해서 재작성 필요.

---

## 10. Phase B 단계 1~3 완료 + 단계 4~8 인계 (2026-05-10)

Phase B 지시서 §9 8단계 중 1~3 완료. 단계 4~8 은 다음 세션.

### 완료 (단계 1~3)

**단계 1 — spec 갱신**: `gym-app-spec.md` §1 라인 10 / §1 Clawd 포즈 체계 표 (구 99-113) / §2 화면 구조 ASCII / §5-3 스트릭 영역 / §6-3 카드 ASCII (구 line 308 🦀) / §6-7 운동별 프로그레스바 / §6-11 PR 토스트 / §14 디자인 원칙 / §15 Phase 2 항목 11·13 갱신. §0 인덱스 행 번호 재계산 (현 grep -n 결과 기준). `rg -i 'clawd|barbell.raise|sparkle|wiggle|slowbob' specs/ DESIGN.md` → exit 1 (0건).

**단계 2 — Clawd 제거 (src + e2e)**:
- `src/db/exercises.js` — `POSES` · `EXERCISE_POSE` 상수 + `getPoseForExercise` 함수 제거. `window.gymExercises` export 정리.
- `src/db/exercises.test.js` — `POSES / EXERCISE_POSE` describe 블록 + `getPoseForExercise` describe 블록 제거.
- `src/features/home.js` — `summarizeStreak` 의 `clawd` 객체 반환 + JSDoc + 함수 내부 변수 제거. 주석 잔여 정리 (line 268·345·366).
- `src/features/home.test.js` — `r.clawd` assertion 4건 제거. 1~2일 / 3~4일 / 5+일 케이스 라벨에서 "Barbell Raise" / "bob" / "slowbob" 제거.
- `e2e/home-active-card.spec.js` — test F·G 라벨 + 주석 정리.
- 검증: `rg -i 'clawd|EXERCISE_POSE|barbell.raise|sparkle|wiggle|slowbob' src/ e2e/` → exit 1 (0건).
- 영향 테스트: `pnpm vitest run src/db/exercises.test.js src/features/home.test.js` → "Test Files 2 passed (2) / Tests 55 passed (55)".

**단계 3 — picker 정리**: `src/app.js:4` raw import 제거 + `ROUTES.picker` 제거. `mocks/picker.html` 삭제. 외부 `#/picker` 진입 코드 grep → 0건 확인 후 제거.

### 단계 4 진입 전 핵심 발견 (다음 세션 시작 시 우선 해결)

**`src/app.js` 가 `mocks/*.html?raw` 를 innerHTML 로 주입하는 구조**. 즉 `src/features/*` 가 의존하는 element id (예: `sNum`·`sLabel`·`sPart`·`sSub`·`sSubUnit`·`ctaBtn` 등) 가 Phase A 의 v2 mocks 풀 리라이트 결과에는 **존재하지 않음**. 단계 4 의 본질은 단순 "v2 적용" 이 아니라:

1. (옵션 A) `mocks/*.html` 의 v2 시각을 유지하면서 **id 를 추가** — 텍스트 노드 분리 + `id="sNum"` 등 부착. 시각 변경 없음.
2. (옵션 B) `src/features/*` 의 querySelector 를 v2 마크업 구조에 맞게 재작성 — 시안 변경 시 selector 깨질 위험.

권장 = (A). v2 마크업에 id 만 추가.

### 단계 4~8 인계 (Phase B 지시서 §9)

- **단계 4 — 화면별 src 적용**:
  - login → `src/services/auth.js` (215). `mocks/login.html` 의 Google 버튼 click 핸들러 + 에러 메시지 영역 id 매핑 필요.
  - home → `src/features/home.js` (이미 Clawd 제거됨, 432 → 약 410). v2 HomeA/HomeC 분기를 active session 유무로 동작. mocks 의 두 phone 마크업에 id 부착 + JS 토글 → src 가 데이터로 토글하도록.
  - session-empty + session → `src/features/session.js` (612). spec §6-3 인터랙션 (스와이프·키패드·프리셋·꾹누르기) + v2 시각 일치. mocks/session.html 의 "← 이전 수정 / 완료 →" 가이드 텍스트 src 적용 시 제거 (spec §6-3-1 "지시문 금지"). 시안 누락분 보강 (서킷 토글, 시트 §6-2 권위).
  - summary → `src/features/session-summary.js` (139). v2 CompleteB 영수증 모달.
  - stats → `src/features/stats.js` (408). 3 탭 (캘린더/추이/부위) src 적용. 캘린더 날짜 탭 → 그날 운동 바텀시트 (Phase A 단계서 미구현, Phase B 에서 구현).
  - **신설**: `src/features/manage.js` (Manage 통합 셸). exercises-admin/weights/profile 의 콘텐츠 함수만 import → 3 탭 wrapper. 기존 3 파일은 router 진입점 제거하고 render 함수만 export.
- **단계 5 — 테스트 갱신**: `pnpm vitest run` 0 fail 목표. `session.test.js` (947) · `stats.test.js` (491) UI selector 갱신.
- **단계 6 — 빌드**: `pnpm build` 통과.
- **단계 7 — e2e**: `pnpm e2e` 0 fail. `e2e/` 7 spec selector 갱신.
- **단계 8 — 자체 시각 검증**: preview screenshot 으로 `Gym App 시안 v2.html` (또는 handoff §4 JSX 명세) vs 실 src dev 서버 비교. 사용자 위임 금지.
- **자동 commit + push**: 본 세션 편집 파일만 staging.

### 본 세션 commit 예정 메시지

`refactor(gym): Phase B step 1-3 — spec/Clawd cleanup + picker removal`

---

## 11. Phase B 단계 4 부분 완료 + 잔여 인계 (2026-05-10)

Phase B 지시서 §9 단계 4 의 0순위 (mocks id 부착) 7화면 완료. src/features/* 갱신 + HomeC active 분기·session active 카드·manage 셸 신설은 다음 세션.

### 완료 — mocks id/data-bind 부착 (시각 변경 0)

| 화면 | 부착 항목 | preview_eval 검증 |
|---|---|---|
| `login.html` | `id="googleSignInBtn"` + `id="loginError"` (display:none) + inline `<script>` (window.gymAuth.signInWithGoogle 호출, AUTH_ERROR_KEY 처리) | btn h56·bg#fff / errEl display:none / pageHeight 820 |
| `summary.html` | `id="summaryHomeBtn"` + inline `<script>` ("홈으로" → `#/home`) | (visual diff 0) |
| `home.html` (HomeA only) | `weekCal`·`sLabel`·`sNum`·`sUnit`·`sPart`·`sSub`·`sSubUnit`·`ctaBtn` | 8 id 모두 Phase A 측정 사이즈 일치 (sNum 88·200, sPart 16·500, ctaBtn 운동시작) |
| `session-empty.html` | `addexChips` (6 chip + `data-part` 매핑) + `addexList` + 5 `.addex-item` (`data-ex` 매핑 — bench_press/incline_bench/decline_bench/dumbbell_fly/cable_crossover) | chip 6 / item 5 / pageHeight 820 |
| `admin.html` 운동 탭 | `adminParts` (6 chip `data-part`) + `adminExList` | adminPartsKids 6 / parts ['chest','back','shoulder','legs','arms','cardio'] |
| `admin.html` 체중 탭 | `[data-bind="weight-hero-num"]` "69.4"·64px / `[data-bind="weight-hero-meta"]` 메타 / SVG 안 `data-bind="chart-weight"`·`chart-avg`(display:none placeholder)·`chart-goal` (inline script 갱신) / 외부 hidden DOM: `.chart-legend`·`[data-bind="weight-list"]`·`[data-bind="weight-pr-pop"]`·`[data-bind="weight-entry-form"]` | chartWeight path stroke-width 2 / chartAvg display:none / chartGoal x2=280 stroke-dasharray "3 3" |
| `admin.html` 프로필 탭 | 4 row 에 `data-field="height"`·`"birthyear"`·`"goal-weight"`·`"weekly-goal"` + `.f-val` wrapper + `.hint` (cm/kg/회) | 4 row 모두 found / 3 row hint (생년 제외) |
| `stats.html` 캘린더 탭 | `id="cal-grid"` → `id="calGrid"` 변경 + `monthLabel` + 동적 셀에 `class="cal-cell"`·`data-day` (today 셀 +`today` 클래스) + 외부 hidden `.compare-section` (2 cs-group × 2 cs-bar-row) | calGrid camel / cell 31 / today day=6 1건 / cs-group 2 cs-bar-row 4 hidden |

검증 방법: 각 부착 후 `preview_eval` 로 selector 존재·값·시각 메트릭 측정. pageHeight 820 동일 확인 (시각 변경 0).

검증 명령:
- `pnpm vitest run` → "Test Files 13 passed (13) / Tests 391 passed (391)" (전체 통과)
- `pnpm build` → "✓ 71 modules transformed. ✓ built in 479ms / PWA precache 24 entries"

### 잔여 — 다음 세션 작업

**우선 처리 (단계 4 미완료)**:
1. **HomeC active 분기 id 분리** — src/features/home.js 의 `applyToDom` (active session) 가 `sLabel`·`sNum`·`sPart`·`sSub`·`ctaBtn` 동일 id 사용. 두 phone 마크업에 같은 id 두면 `getElementById` 첫 매칭만 반환 → HomeC 데이터 바인딩 실패. 해결: src/features/home.js active 분기를 별도 id (`cardTime`·`cardPart`·`cardEx`·`cardVol`·`cardProgress`·`cardCta` 등) 로 재설계 + HomeC 마크업 부착. 본 세션 home.html HomeC 부착 미수행.
2. **session active 카드 마운트 함수 신설** — src/features/session.js (612 라인) 의 직접 DOM 접근 = `addexChips`/`addexList`/`.addex-item` 3건만. SessionC active 카드 (운동명·SET 03/05·60kg·10회·S1~S5 도트·진행바) 데이터 바인딩 함수 부재. 추가 작성 필요.
3. **session.html 가이드 텍스트 src 적용 시 제거** — "← 이전 수정 / 완료 →" (spec §6-3-1 "지시문 금지" 충돌). mocks 는 시안 비교용 보존.
4. **manage 통합 셸 신설** — `src/features/manage.js` (3 탭 wrapper). `exercises-admin/weights/profile` 의 콘텐츠 render 함수만 export 분리. router 진입점 통합.
5. **stats `parseMonthLabel` 정규식** — 현재 `(\d{4})년\s+(\d{1,2})월` ≠ mocks "2026 · 5월" 형식. src 갱신: `(\d{4})\s*[·년]\s*(\d{1,2})월` 등 수용.
6. **시안 누락 §2 보강** — session-empty 시트 우상단 [서킷] 토글 + 서킷 ON 모드 (배너·체크 선택·완료 버튼). spec §6-2 권위.

**단계 5 — 테스트** (분 단위, 본 세션 후 반영 필요): home.test 에서 `r.clawd` 잔여 0건 (이미 정리), stats UI selector 갱신, session UI selector 갱신.

**단계 6 — e2e**: 7 spec selector 갱신 (현재 mocks 의 v2 시각·id 매핑 반영).

**단계 7 — 시각 검증**: preview screenshot vs mocks/*.html 비교. 사용자 위임 금지.

**단계 8 — 자동 commit + push**.

### 본 세션 commit 예정 메시지

`refactor(gym): Phase B step 4 (partial) — mocks id 부착 7화면 (시각 변경 0)`
