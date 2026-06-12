// cue v8 — 월 캘린더 히트맵, 열린 고리 마크, 진행 애니메이션, 버튼 통일

const { useState, useEffect, useRef, useLayoutEffect, useMemo } = React;

/* ---------------- 시간 ---------------- */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}
const pad = (n) => String(n).padStart(2, '0');
const T0 = 6, T1 = 24;
const px = (h) => ((Math.min(Math.max(h, T0), T1) - T0) / (T1 - T0)) * 100;

const FLOW = [
  { id: 'gym', name: '운동', t: 7.2, doneAt: 7.21, tlMeta: '07:12 · 41분' },
  { id: 'lang', name: '어학', t: 19.0 },
  { id: 'write', name: '글쓰기', t: 19.65 },
  { id: 'read', name: '독서', t: 20.15 },
];
const DUE_ID = 'lang';

/* ---------------- 아이콘 ---------------- */
const ICONS = {
  read: <path d="M8 3.4v9.2M2.8 3.8c1.8-1 3.6-1 5.2 0 1.6-1 3.4-1 5.2 0v8.4c-1.8-.8-3.6-.8-5.2.2-1.6-1-3.4-1-5.2-.2z" />,
  write: <path d="M3 13l1-3.5L11.5 2 14 4.5 6.5 12 3 13zM9.8 3.7l2.5 2.5" />,
  lang: <path d="M2.8 3h10.4v7.2H8.2l-3 2.8v-2.8H2.8zM5.6 6.6h4.8" />,
  gym: <path d="M4.6 5v6M11.4 5v6M2.5 6.4v3.2M13.5 6.4v3.2M4.6 8h6.8" />,
};
function AppIcon({ id }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[id]}
    </svg>
  );
}
function GoIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 10.5L10.5 3.5M5.2 3.5h5.3v5.3" />
    </svg>
  );
}
function Chev({ open }) {
  return (
    <svg className={'chev' + (open ? ' open' : '')} width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

/* ---------------- 마크: 닫힌 원 / 열린 고리 ---------------- */
function Mark({ done, size = 18, accent }) {
  const r = (size - 5) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg className={'mark' + (accent ? ' accent' : '')} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {done ? (
        <>
          <circle cx={size / 2} cy={size / 2} r={r + 1.2} className="mark-fill" />
          <path d={`M${size * 0.3} ${size * 0.53} l${size * 0.13} ${size * 0.14} l${size * 0.28} ${size * -0.3}`} className="mark-chk" />
        </>
      ) : (
        <circle
          cx={size / 2} cy={size / 2} r={r}
          className="mark-ring"
          strokeDasharray={`${c * 0.76} ${c}`}
          transform={`rotate(-54 ${size / 2} ${size / 2})`}
        />
      )}
    </svg>
  );
}

/* ---------------- 하루 고리 (완성 욕구) ---------------- */
function DayRing({ done, total, size = 84 }) {
  const r = size / 2 - 7;
  const C = 2 * Math.PI * r;
  const seg = C / total;
  const fill = seg * 0.78;
  return (
    <svg className="dayring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`오늘 ${done} / ${total}`}>
      {Array.from({ length: total }).map((_, i) => (
        <circle
          key={i}
          cx={size / 2} cy={size / 2} r={r}
          className={i < done ? 'dr-f' : 'dr-e'}
          strokeDasharray={`${fill} ${C - fill}`}
          transform={`rotate(${-90 + (360 / total) * i + 8} ${size / 2} ${size / 2})`}
        />
      ))}
      <text x="50%" y="50%" dy="0.36em" textAnchor="middle" className="dr-t">{done}/{total}</text>
    </svg>
  );
}

/* ---------------- 히어로 ---------------- */
function Hero({ now, showSec, doneIds }) {
  const h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
  const dec = h + m / 60;
  const remainMin = 24 * 60 - (h * 60 + m);
  const rh = Math.floor(remainMin / 60), rm = remainMin % 60;
  const pct = Math.round(((h * 60 + m) / 1440) * 100);

  // 시간대가 몰리면 라벨을 묶는다: 점은 실제 위치에 작게, 라벨은 클러스터 단위로 하나
  const railRef = useRef(null);
  const groupRefs = useRef({});
  const [W, setW] = useState(0);
  const [lay, setLay] = useState(null);

  useLayoutEffect(() => {
    const measure = () => railRef.current && setW(railRef.current.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    if (railRef.current) ro.observe(railRef.current);
    return () => ro.disconnect();
  }, []);

  // 점 간격이 60px 이하면 같은 클러스터
  const clusters = useMemo(() => {
    if (!W) return [];
    const CLUSTER_PX = 60;
    const out = [];
    FLOW.forEach((a) => {
      const x = (px(a.t) / 100) * W;
      const last = out[out.length - 1];
      if (last && x - last.xs[last.xs.length - 1] <= CLUSTER_PX) {
        last.items.push(a);
        last.xs.push(x);
      } else {
        out.push({ key: a.id, items: [a], xs: [x] });
      }
    });
    out.forEach((c) => { c.cx = c.xs.reduce((s, v) => s + v, 0) / c.xs.length; });
    return out;
  }, [W]);

  // 클러스터 라벨 폭을 실측해 좌우 스윅 + 클램프
  useLayoutEffect(() => {
    if (!W || clusters.length === 0) return;
    const GAP = 26;
    const ws = clusters.map((c) => (groupRefs.current[c.key] ? groupRefs.current[c.key].offsetWidth : 60));
    const lefts = clusters.map((c, i) => c.cx - ws[i] / 2);
    for (let i = 0; i < lefts.length; i++) {
      if (i === 0) lefts[i] = Math.max(0, lefts[i]);
      else lefts[i] = Math.max(lefts[i], lefts[i - 1] + ws[i - 1] + GAP);
    }
    for (let i = lefts.length - 1; i >= 0; i--) {
      const maxL = i === lefts.length - 1 ? W - ws[i] : lefts[i + 1] - GAP - ws[i];
      lefts[i] = Math.min(lefts[i], maxL);
      if (i === 0) lefts[i] = Math.max(0, lefts[i]);
    }
    setLay({
      lefts: Object.fromEntries(clusters.map((c, i) => [c.key, lefts[i]])),
      stems: clusters.map((c, i) => Math.min(Math.max(c.cx, lefts[i] + 16), lefts[i] + ws[i] - 16)),
    });
  }, [W, clusters, doneIds.size]);

  return (
    <section className="hero" data-screen-label="오늘 흐름">
      <div className="hero-clock">
        <div className="clock-row">
          <div>
            <div className="clock">
              <b>{pad(h)}<i>:</i>{pad(m)}</b>
              {showSec && <em>{pad(s)}</em>}
            </div>
            <p className="clock-remain">오늘이 <b>{rh}시간 {pad(rm)}분</b> 남았어요</p>
            <p className="clock-pct">하루의 <b>{pct}%</b>가 지나갔어요</p>
          </div>
          <DayRing done={doneIds.size} total={FLOW.length} />
        </div>
      </div>
      <div className="flow">
        <div className="flow-rail" ref={railRef}>
          <div className="flow-now" style={{ left: px(dec) + '%' }}>
            <span className="flow-now-pill">지금 <b>{pad(h)}:{pad(m)}</b></span>
            <i className="flow-now-line"></i>
            <i className="flow-now-dot"></i>
          </div>
          <div className="flow-axis">
            <i className="flow-axis-fill" style={{ width: px(dec) + '%' }}></i>
          </div>
          {FLOW.map((a) => {
            const done = doneIds.has(a.id);
            return (
              <i
                key={a.id}
                className={'flow-pt' + (done ? ' done' : '') + (a.id === DUE_ID && !done ? ' due' : '')}
                style={{ left: px(a.t) + '%' }}
              ></i>
            );
          })}
          {lay && lay.stems.map((x, i) => (
            <i key={'s' + i} className="flow-stem" style={{ left: x }}></i>
          ))}
          {clusters.map((c) => (
            <div
              key={c.key}
              className={'flow-group' + (c.items.length > 1 ? ' multi' : '')}
              ref={(el) => { groupRefs.current[c.key] = el; }}
              style={lay && lay.lefts[c.key] != null ? { left: lay.lefts[c.key] } : { left: c.cx, visibility: 'hidden' }}
            >
              <span className="fg-row">
                {c.items.map((a) => {
                  const done = doneIds.has(a.id);
                  const due = a.id === DUE_ID && !done;
                  return (
                    <span key={a.id} className={'fg-item' + (done ? ' done' : '') + (due ? ' due' : '')}>
                      <Mark done={done} size={13} accent={due} />{a.name}
                    </span>
                  );
                })}
              </span>
              {c.items.length === 1 && doneIds.has(c.items[0].id) && (
                <span className="flow-meta">{c.items[0].tlMeta}</span>
              )}
            </div>
          ))}
          {[6, 9, 12, 15, 18, 21, 24].map((hh) => (
            <i key={'t' + hh} className="flow-tick" style={{ left: px(hh) + '%' }}></i>
          ))}
          <div className="flow-hours">
            {[6, 9, 12, 15, 18, 21, 24].map((hh) => (
              <span key={hh} style={{ left: px(hh) + '%' }}>{pad(hh)}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- 월 캘린더 히트맵 ---------------- */
// 2026년 6월: 1일 = 월요일, 30일까지. 오늘 = 12일.
function MonthCal({ days, today }) {
  const max = Math.max(...days, 1);
  const lv = (v) => (v === 0 ? 0 : v < max * 0.34 ? 1 : v < max * 0.67 ? 2 : 3);
  return (
    <div className="cal">
      <span className="cal-month">6월</span>
      <div className="cal-grid">
        {['월', '화', '수', '목', '금', '토', '일'].map((d) => <span key={d} className="cal-wd">{d}</span>)}
        {days.map((v, i) => {
          const d = i + 1;
          const fut = d > today;
          return (
            <i
              key={d}
              className={'cc' + (fut ? ' fut' : ' h' + lv(v)) + (d === today ? ' today' : '')}
              title={`6월 ${d}일${v > 0 ? ' · ' + v : ''}`}
            ></i>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- 활동 행 ---------------- */
function Hook({ hook }) {
  return (
    <p className="row-hook">
      {hook.title} <b>{hook.strong}</b>{hook.tail || ''}
    </p>
  );
}

function AppRow({ app, done, open, onToggle, onStats, today }) {
  const due = app.id === DUE_ID;
  const hook = done && app.hookDone ? app.hookDone : app.hook;
  return (
    <li className={'row' + (open ? ' is-open' : '') + (done ? ' is-done' : '') + (due && !done ? ' is-due' : '')}>
      <button className="row-head" onClick={onToggle} aria-expanded={open}>
        <Mark done={done} accent={due && !done} />
        <span className="row-name">{app.name}</span>
        <span className="row-mid">
          <Hook hook={hook} />
          <span className="row-sub">{app.sub}</span>
        </span>
        <a className="cta" href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
          <i className="cta-ic"><AppIcon id={app.id} /></i>
          <span className="cta-lb">{done && app.ctaDone ? app.ctaDone : app.cta}</span>
          <GoIcon />
        </a>
        <Chev open={open} />
      </button>

      {open && (
        <div className="row-detail">
          <MonthCal days={app.cal} today={today} />
          <div className="recs">
            {app.records.map((r) => (
              <div key={r.lb} className="rec">
                <span className="rec-lb">{r.lb}</span>
                <span className="rec-v">{r.v}</span>
                {r.note && <span className="rec-note">{r.note}</span>}
              </div>
            ))}
          </div>
          <div className="beat">
            <span className="beat-txt">{app.beat}</span>
            <a className="beat-more" href="#" onClick={(e) => { e.preventDefault(); onStats(); }}>전체 통계</a>
          </div>
        </div>
      )}
    </li>
  );
}

/* ---------------- 전체 통계 ---------------- */
function StatsView({ onClose }) {
  const C = window.CUE8;
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);
  return (
    <div className="stats" data-screen-label="전체 통계">
      <div className="stats-head">
        <h2>전체 통계</h2>
        <span className="stats-range">최근 8주</span>
        <button className="stats-close" onClick={onClose} aria-label="닫기">✕</button>
      </div>
      <div className="stats-grid">
        {C.apps.map((app) => {
          const max = Math.max(...app.weekly8, 1);
          return (
            <div key={app.id} className="stat-block">
              <div className="stat-top">
                <i className="stat-ic"><AppIcon id={app.id} /></i>
                <span className="stat-name">{app.name}</span>
                <span className="stat-total">{app.total}</span>
              </div>
              <div className="stat-bars">
                {app.weekly8.map((v, i) => (
                  <span key={i} className={'sb' + (i === 7 ? ' this' : '') + (v === 0 ? ' zero' : '')}>
                    <i style={{ height: Math.max((v / max) * 64, 2) + 'px' }}></i>
                  </span>
                ))}
              </div>
              <div className="stat-axis"><span>8주 전</span><span>이번 주</span></div>
              <div className="stat-recs">
                {app.records.map((r) => (
                  <span key={r.lb} className="stat-rec"><em>{r.lb}</em><b>{r.v}</b></span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- 앱 ---------------- */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#D2602F",
  "showSec": true,
  "motion": true
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const now = useNow();
  const dec = now.getHours() + now.getMinutes() / 60;
  const [openId, setOpenId] = useState('read');
  const [stats, setStats] = useState(false);
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const today = window.CUE8.todayDate;

  const doneIds = new Set(dec >= 7.21 ? ['gym'] : []);
  const apps = window.CUE8.apps;

  return (
    <div className={'page' + (t.motion ? '' : ' no-motion')} style={{ '--cue': t.accent }}>
      <header className="hd">
        <span className="logo">cue<i>.</i></span>
        <span className="date">{now.getFullYear()}.{pad(now.getMonth() + 1)}.{pad(now.getDate())} {dayNames[now.getDay()]}</span>
        <button className="hd-stats" onClick={() => setStats(true)}>전체 통계</button>
      </header>

      {stats ? (
        <StatsView onClose={() => setStats(false)} />
      ) : (
        <>
          <Hero now={now} showSec={t.showSec} doneIds={doneIds} />
          <ul className="rows" data-screen-label="활동 목록">
            {apps.map((app) => (
              <AppRow
                key={app.id}
                app={app}
                done={doneIds.has(app.id)}
                open={openId === app.id}
                today={today}
                onToggle={() => setOpenId(openId === app.id ? null : app.id)}
                onStats={() => setStats(true)}
              />
            ))}
          </ul>
        </>
      )}

      <TweaksPanel>
        <TweakSection label="색" />
        <TweakColor label="포인트" value={t.accent}
          options={['#D2602F', '#B9551F', '#E0744A']}
          onChange={(v) => setTweak('accent', v)} />
        <TweakSection label="표시" />
        <TweakToggle label="초 표시" value={t.showSec}
          onChange={(v) => setTweak('showSec', v)} />
        <TweakToggle label="애니메이션" value={t.motion}
          onChange={(v) => setTweak('motion', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
