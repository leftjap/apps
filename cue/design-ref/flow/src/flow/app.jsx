/* app.jsx — cue '오늘 흐름' 새 안 프로토타입 조립.
   헤더·도어·기록은 기존 시안의 어휘를 유지하며 재구성. 도어 탭 = 장면 순환(데모). */

const { HABITS, SENTENCES, fmt: fmtMin, p2: pad2, level, longestRun, dayMeta, sentenceOfDay } = window.CUE;

const FLOW_DEFAULTS = /*EDITMODE-BEGIN*/{
  "variant": "A 타임라인",
  "liveTime": false,
  "demoHour": 16.5,
  "showSec": true,
  "motion": 70,
  "startHour": 6,
  "showRecord": true
}/*EDITMODE-END*/;

/* 시계 — 실시간 또는 데모 시각(초는 계속 흐름) */
function useClock(live, demoHour) {
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const anchor = React.useRef(null);
  if (!anchor.current || anchor.current.demoHour !== demoHour) anchor.current = { demoHour, t0: Date.now() };
  if (live) {
    const d = new Date();
    return { h: d.getHours(), m: d.getMinutes(), sec: d.getSeconds(), min: d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60 };
  }
  const elapsed = (Date.now() - anchor.current.t0) / 1000;
  const secOfDay = (demoHour * 3600 + elapsed) % 86400;
  return { h: Math.floor(secOfDay / 3600), m: Math.floor(secOfDay / 60) % 60, sec: Math.floor(secOfDay % 60), min: secOfDay / 60 };
}

function Header({ flags }) {
  const [i, setI] = React.useState(sentenceOfDay(SENTENCES.length));
  const s = SENTENCES[i];
  const parts = s.hi && s.text.includes(s.hi) ? s.text.split(s.hi) : null;
  const now = new Date();
  const done = flags.filter(Boolean).length;
  const allDone = done === flags.length && flags.length > 0;
  return (
    <header className="head">
      <div className="head__l">
        <div className="head__meta">
          <span className="brand">cue<i className="brand__dot"></i></span>
          <span>오늘</span>
          <span className="date mono">{now.getFullYear()}.{pad2(now.getMonth() + 1)}.{pad2(now.getDate())} <b>{window.CUE.WD[now.getDay()]}</b></span>
        </div>
        <h1 className="sentence">
          {parts ? <React.Fragment>{parts[0]}<span className="uline">{s.hi}</span>{parts[1]}</React.Fragment> : s.text}
          <button className="shuffle" title="다른 문장" aria-label="다른 문장 보기"
            onClick={() => setI((v) => (v + 1) % SENTENCES.length)}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 6.5A5 5 0 0 0 3.6 5"></path><path d="M3 2.5V5h2.5"></path>
              <path d="M3 9.5A5 5 0 0 0 12.4 11"></path><path d="M13 13.5V11h-2.5"></path>
            </svg>
          </button>
        </h1>
      </div>
      <div className={`tally${allDone ? " alldone" : ""}`}>
        <span className="tally__n">{allDone
          ? <React.Fragment><b>오늘 다 했어요</b> ✓</React.Fragment>
          : <React.Fragment>오늘 <b>{done}</b> / {flags.length}</React.Fragment>}</span>
        <span className="tally__dots">
          {flags.map((f, k) => <span key={k} className={`tally__d${f ? " on" : ""}`}></span>)}
        </span>
      </div>
    </header>
  );
}

function useTimer(active, seed) {
  const [s, setS] = React.useState(seed);
  React.useEffect(() => {
    if (!active) return;
    setS(seed);
    const id = setInterval(() => setS((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [active, seed]);
  return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
}

function Door({ habit, stateKey, onCycle, isNext }) {
  const st = habit.states[stateKey];
  const timer = useTimer(st.kind === "progress" && !!st.timer, st.timer || 0);
  const isPhone = habit.device === "iPhone";
  const cueEl = st.kind === "progress" && st.timer
    ? <React.Fragment><span className="live"></span><span>운동 중</span> <span className="timer">{timer}</span></React.Fragment>
    : <span>{st.line}</span>;
  return (
    <button className={`door is-${st.kind}${isNext && st.kind === "none" ? " is-next" : ""}`} onClick={onCycle}
      aria-label={`${habit.ko} — ${st.line} (데모: 탭하면 상태 전환)`}>
      <span className="door__seal" aria-hidden="true">
        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7.5 L6 10.5 L11 4.5"></path></svg>
        오늘 완료
      </span>
      {isNext && st.kind === "none" ? <span className="door__nexttag" aria-hidden="true">다음</span> : null}
      <div className="door__name">
        <span className="door__ko">{habit.ko}</span>
        <span className="door__en">{habit.en}</span>
      </div>
      <div className="door__streak">
        <span className="door__big mono">{st.big}</span>
        <span className="door__unit">{st.unit}</span>
      </div>
      <div className="door__cue">{cueEl}</div>
      <div className="door__enter">
        {st.enter
          ? <span className="door__go">{st.enter}
              <span className="arc"><svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10 L10 4"></path><path d="M5 4 H10 V9"></path></svg></span>
            </span>
          : <span className="door__go" style={{ color: "var(--ink-4)" }}>
              <span className="arc" style={{ background: "var(--line-soft)" }}><svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="4.5" y="2.5" width="5" height="9" rx="1.2"></rect></svg></span>
              iPhone 전용
            </span>}
      </div>
    </button>
  );
}

function Record({ habits, stateKeys }) {
  const PERIOD = 28;
  const base = new Date(); base.setHours(0, 0, 0, 0);
  const ticks = [27, 20, 14, 7, 0].map((n) => dayMeta(n, base));
  const seqs = habits.map((h, i) => h.hist.concat([h.states[stateKeys[i]].today || 0]).slice(-PERIOD));
  const runs = seqs.map((s) => longestRun(s));
  const longest = Math.max(...runs);
  const longestKo = longest > 0 ? habits[runs.indexOf(longest)].ko : null;
  let total = 0, sum = 0;
  seqs.forEach((s) => s.forEach((v) => { total++; if (v > 0) sum++; }));
  const comp = total ? Math.round((sum / total) * 100) : 0;
  const wdN = ((base.getDay() + 6) % 7) + 1; // 월=1 … 일=7
  let weekActive = 0;
  for (let i = 1; i <= wdN; i++) if (seqs.some((s) => (s[s.length - i] || 0) > 0)) weekActive++;
  const from = dayMeta(PERIOD - 1, base), to = dayMeta(0, base);

  return (
    <section className="rec">
      <div className="rec__head">
        <span className="rec__title">그간의 기록</span>
        <span className="rec__sub">최근 4주 · {from.m}.{pad2(from.d)} – {to.m}.{pad2(to.d)}</span>
      </div>
      <div className="rec__axis">
        <span></span>
        <span className="rec__dates">
          {ticks.map((d, k) => <span key={k} className="mono">{k === ticks.length - 1 ? <b>오늘</b> : `${d.m}.${pad2(d.d)}`}</span>)}
        </span>
        <span></span>
      </div>
      <div className="rec__rows">
        {habits.map((h, i) => {
          const st = h.states[stateKeys[i]];
          const seq = seqs[i];
          return (
            <div className="rrow" key={h.id}>
              <span className="rrow__name">{h.ko}</span>
              <span className="cells">
                {seq.map((c, k) => {
                  const isToday = k === seq.length - 1;
                  const dm = dayMeta(PERIOD - 1 - k, base);
                  let cls = "cell";
                  if (dm.wd === "토" || dm.wd === "일") cls += " we";
                  const lv = level(+c, h.metric.max); if (lv) cls += " " + lv;
                  if (isToday) cls += " today";
                  return <span key={k} className={cls} title={`${dm.m}.${pad2(dm.d)} (${dm.wd}) · ${isToday ? "오늘 · " : ""}${+c > 0 ? `${+c}${h.metric.unit}` : "안 함"}`}></span>;
                })}
              </span>
              <span className={`rrow__streak mono${st.big > 0 ? "" : " is-zero"}`}>
                {h.id === "gym" ? <React.Fragment>이번주 <b>{st.big}</b>회</React.Fragment> : <React.Fragment>연속 <b>{st.big}</b>일</React.Fragment>}
              </span>
            </div>
          );
        })}
      </div>
      <div className="rec__legend">
        <span className="lg"><i className="sw empty"></i>안 함</span>
        <span className="lg"><i className="sw grad"></i>적게 → 많이</span>
        <span className="lg"><i className="sw today"></i>오늘</span>
        <span className="lg lg--note">칸 진하기 = 그날 한 양 · 이번주 활동 {weekActive}/7일 · 4주 활동률 {comp}% · 최장 연속 {longest}일{longestKo ? ` (${longestKo})` : ""}</span>
      </div>
    </section>
  );
}

function App() {
  const [t, setTweak] = useTweaks(FLOW_DEFAULTS);
  React.useEffect(() => {
    const r = document.documentElement.style;
    r.setProperty("--motion", String(t.motion / 100));
    r.setProperty("--anim", t.motion === 0 ? "paused" : "running");
  }, [t.motion]);

  const clock = useClock(t.liveTime, t.demoHour);
  const [idxs, setIdxs] = React.useState(() => HABITS.map((h) => h.cycle.indexOf(h.start)));
  const stateKeys = idxs.map((ix, i) => HABITS[i].cycle[ix]);
  const cycle = (i) => setIdxs((prev) => prev.map((v, k) => (k === i ? (v + 1) % HABITS[i].cycle.length : v)));
  const cycleById = (id) => { const i = HABITS.findIndex((h) => h.id === id); if (i >= 0) cycle(i); };

  const flags = HABITS.map((h, i) => h.states[stateKeys[i]].kind === "done");
  const pend = HABITS.map((h, i) => ({ h, st: h.states[stateKeys[i]] })).filter((x) => x.st.kind === "none");
  const nextId = window.nextOf(pend, clock.min);

  const Band = t.variant === "A 타임라인" ? window.FlowBandA : window.FlowBandB;

  return (
    <React.Fragment>
      <div className="page">
        <Header flags={flags} />
        <Band habits={HABITS} stateKeys={stateKeys} clock={clock} showSec={t.showSec} startHour={t.startHour} nextId={nextId} onCycle={cycleById} />
        <section className="doors">
          {HABITS.map((h, i) => (
            <Door key={h.id} habit={h} stateKey={stateKeys[i]} onCycle={() => cycle(i)} isNext={h.id === nextId} />
          ))}
        </section>
        {t.showRecord ? <Record habits={HABITS} stateKeys={stateKeys} /> : null}
        <p className="hint">프로토타입 · 카드를 <b>탭</b>하면 상태가 순환합니다 (미실행→진행→완료) · 시각·변형은 <b>Tweaks</b>에서</p>
      </div>
      <TweaksPanel title="Tweaks">
        <TweakSection label="오늘 흐름" />
        <TweakRadio label="변형" value={t.variant} options={["A 타임라인", "B 카운트다운"]} onChange={(v) => setTweak("variant", v)} />
        <TweakToggle label="실제 시각 사용" value={t.liveTime} onChange={(v) => setTweak("liveTime", v)} />
        {!t.liveTime && <TweakSlider label="데모 시각" value={t.demoHour} min={5} max={23.5} step={0.25} unit="시" onChange={(v) => setTweak("demoHour", v)} />}
        <TweakSlider label="타임라인 시작" value={t.startHour} min={0} max={9} step={3} unit="시" onChange={(v) => setTweak("startHour", v)} />
        <TweakSection label="모션" />
        <TweakToggle label="초 표시" value={t.showSec} onChange={(v) => setTweak("showSec", v)} />
        <TweakSlider label="모션 수위" value={t.motion} min={0} max={100} step={10} onChange={(v) => setTweak("motion", v)} />
        <TweakSection label="섹션" />
        <TweakToggle label="그간의 기록" value={t.showRecord} onChange={(v) => setTweak("showRecord", v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
