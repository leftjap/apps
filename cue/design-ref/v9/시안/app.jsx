/* app.jsx — cue 활동 카드 정보 재설계 프로토타입.
   히어로(시계·고리·타임라인)는 v8 정본 그대로 유지(작업지시서 범위 밖).
   재설계 범위: 4개 활동 행(접힘+펼침) · 전체 통계 — 정보 항목과 카피(§3·§4·§5)만 바꿈.
   데이터는 §7 실제 스냅샷 기반 데모 한 장(2026.06.13 토 저녁). */
const { useState, useRef, useMemo, useLayoutEffect, useEffect } = React;

/* ───────── helpers ───────── */
const p2 = (n) => String(n).padStart(2, '0');
const T0 = 6, T1 = 24;
const px = (h) => ((Math.min(Math.max(h, T0), T1) - T0) / (T1 - T0)) * 100;

function clusterPoints(items, clusterPx = 60) {
  const out = [];
  items.slice().sort((a, b) => a.x - b.x).forEach((a) => {
    const last = out[out.length - 1];
    if (last && a.x - last.xs[last.xs.length - 1] <= clusterPx) { last.items.push(a); last.xs.push(a.x); }
    else out.push({ key: a.id, items: [a], xs: [a.x] });
  });
  out.forEach((c) => { c.cx = c.xs.reduce((s, v) => s + v, 0) / c.xs.length; });
  return out;
}
function sweepLefts(centers, widths, W, gap = 26) {
  const lefts = centers.map((cx, i) => cx - widths[i] / 2);
  for (let i = 0; i < lefts.length; i++) {
    if (i === 0) lefts[i] = Math.max(0, lefts[i]);
    else lefts[i] = Math.max(lefts[i], lefts[i - 1] + widths[i - 1] + gap);
  }
  for (let i = lefts.length - 1; i >= 0; i--) {
    const maxL = i === lefts.length - 1 ? W - widths[i] : lefts[i + 1] - gap - widths[i];
    lefts[i] = Math.min(lefts[i], maxL);
    if (i === 0) lefts[i] = Math.max(0, lefts[i]);
  }
  return lefts;
}

/* ───────── icons ───────── */
const ICONS = {
  read: <path d="M8 3.4v9.2M2.8 3.8c1.8-1 3.6-1 5.2 0 1.6-1 3.4-1 5.2 0v8.4c-1.8-.8-3.6-.8-5.2.2-1.6-1-3.4-1-5.2-.2z" />,
  write: <path d="M3 13l1-3.5L11.5 2 14 4.5 6.5 12 3 13zM9.8 3.7l2.5 2.5" />,
  lang: <path d="M2.8 3h10.4v7.2H8.2l-3 2.8v-2.8H2.8zM5.6 6.6h4.8" />,
  gym: <path d="M4.6 5v6M11.4 5v6M2.5 6.4v3.2M13.5 6.4v3.2M4.6 8h6.8" />,
};
const AppIcon = ({ id }) => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[id]}</svg>
);
const GoIcon = () => (
  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 10.5L10.5 3.5M5.2 3.5h5.3v5.3" /></svg>
);
const Chev = ({ open }) => (
  <svg className={'chev' + (open ? ' open' : '')} width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>
);
function Mark({ done, size = 18, accent }) {
  const r = (size - 5) / 2, c = 2 * Math.PI * r;
  return (
    <svg className={'mark' + (accent ? ' accent' : '')} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {done ? (<><circle cx={size / 2} cy={size / 2} r={r + 1.2} className="mark-fill" /><path d={`M${size * 0.3} ${size * 0.53} l${size * 0.13} ${size * 0.14} l${size * 0.28} ${size * -0.3}`} className="mark-chk" /></>)
        : (<circle cx={size / 2} cy={size / 2} r={r} className="mark-ring" strokeDasharray={`${c * 0.76} ${c}`} transform={`rotate(-54 ${size / 2} ${size / 2})`} />)}
    </svg>
  );
}

/* ───────── 데이터: 재설계된 4개 활동 (2026.06.13 토) ───────── */
/* cal: 6월 1~13일 일별값(나머지 미래). calUnit. usualMin/atMin = 타임라인 위치(분). */
const TODAY = { y: 2026, mo: 6, d: 13, dim: 30, wd: '토' }; // 6월 13일 토요일
const MONTH_OFFSET = 0; // 2026-06-01 = 월요일 → 오프셋 0

const APPS = [
  {
    id: 'read', name: '독서', cta: '이어 읽기', url: '#',
    done: false, usualMin: 20.15 * 60, atMin: null, tlMeta: null,
    // hook = 재개 지점: 책 제목 + 진도%(EPUB라 쪽수 아님)
    hook: { title: '「어떤 생각들은 나의 세계가 된다」', strong: '52%', tail: '까지 읽었어요' },
    // sub = 직전에 읽은 시점(이어보기 유도). 읽은 분은 보조
    sub: '어제 18분 읽었어요',
    cal: [0, 25, 0, 31, 22, 0, 40, 0, 33, 0, 28, 18, 0], calUnit: '분',
    // 통일 구조: 직전 → 이번 주(근접목표) → 추세/진척
    records: [
      { lb: '직전 읽기', v: '18분', note: '어제 · 이어서 52%' },
      { lb: '이번 주', goal: { cur: 3, max: 5, unit: '일', proposed: true }, note: '지난주 4일' },
      { lb: '책 진척', v: '52%', note: '지난주 41%' },
    ],
    beat: ['오늘 10분이면 ', '이번 주 4일째', ' — 지난주만큼이에요'],
    weekly8: [4, 5, 6, 4, 5, 3, 5, 3], total: '올해 38시간 · 41일',
    pace: { now: '올해 평균 주 3.9일', goal: '제안 주 5일', proposed: true },
    statRecords: [{ lb: '최장 연속', v: '11일' }, { lb: '올해 읽은 책', v: '4권' }, { lb: '하루 최고', v: '52분' }],
  },
  {
    id: 'write', name: '글쓰기', cta: '이어 쓰기', url: '#',
    done: false, usualMin: 19.65 * 60, atMin: null, tlMeta: null,
    // hook = 카테고리 라벨 + 「제목」 + 매수. 직전 글을 이어쓰게 (재개 충동)
    hook: { title: '오늘의 네비 「정치는 인물」', strong: '6.5매', tail: '까지 썼어요' },
    // 공백은 사실로만 (§3-3 죄책감 어법 금지)
    sub: '마지막으로 쓴 날은 6월 4일이에요', subGap: true,
    cal: [0, 3.2, 2.2, 6.5, 0, 0, 0, 0, 0, 0, 0, 0, 0], calUnit: '매',
    // 통일 구조: 직전 → 이번 주(근접목표) → 이번 달(추세)
    records: [
      { lb: '직전 글', v: '6.5매', note: '오늘의 네비 · 6월 4일' },
      { lb: '이번 주', goal: { cur: 0, max: 3, unit: '편', proposed: true }, note: '지난주 2편' },
      { lb: '이번 달', v: '12매', note: '지난달 38.4매' },
    ],
    beat: ['오늘 1매면 ', '이번 달 13매째', ' — 지난달은 38매였어요'],
    weekly8: [3, 4, 5, 2, 4, 3, 2, 0], total: '올해 85편 · 495매',
    pace: { now: '올해 평균 주 1.9편', goal: '제안 주 3편', proposed: true },
    statRecords: [{ lb: '올해 편수', v: '85편' }, { lb: '올해 매수', v: '495매' }, { lb: '편당 평균', v: '5.8매' }],
  },
  {
    id: 'lang', name: '어학', cta: '오늘 분량 시작', url: '#',
    done: false, usualMin: 19 * 60, atMin: null, tlMeta: null,
    // hook = 마지막 학습 장면명 + 날짜 (이어보기)
    hook: { title: '「구덩이 약속」', strong: '5월 18일', tail: '이 마지막이에요' },
    // sub = SRS 복습 대기(미완성 과제 = 돌아오게 만드는 당김). 발음 점수 제거
    sub: '복습할 문장 12개가 오늘 만료돼요', subStrong: true,
    cal: [0, 0, 30, 0, 45, 250, 0, 20, 0, 39, 33, 0, 0], calUnit: '분',
    records: [
      { lb: '직전 발화', v: '9문장', note: '5월 18일 · 신규 6' },
      { lb: '이번 주', goal: { cur: 3, max: 4, unit: '일', proposed: true }, note: '지난주 2일' },
      { lb: '이번 달 익힘', v: '+48문장', note: '지난달 +32' },
    ],
    beat: ['오늘 5문장이면 ', '이번 주 첫 발화', ' — 복습 12개도 기다려요'],
    weekly8: [2, 3, 5, 4, 1, 3, 2, 3], total: '올해 21시간 · 발화 1,240문장',
    pace: { now: '올해 평균 주 2.7일', goal: '제안 주 4일', proposed: true },
    statRecords: [{ lb: '올해 발화', v: '1,240문장' }, { lb: '익힌 문장', v: '2,860개' }, { lb: '최장 연속', v: '14일' }],
  },
  {
    id: 'gym', name: '운동', cta: '운동 기록 열기', ctaDone: '오늘 기록 보기', url: '#',
    done: true, usualMin: 7.66 * 60, atMin: 7 * 60 + 40, tlMeta: '07:40 · 48분',
    hook: { title: '이번 주', strong: '4회', tail: ' 했어요 — 목표는 주 4일' },
    hookDone: { title: '오늘 07:40 · 가슴·어깨', strong: '48분', tail: '' },
    sub: '이번 주 4회 · 주 4일 목표를 채웠어요',
    cal: [0, 52, 0, 46, 0, 0, 0, 40, 44, 0, 0, 36, 48], calUnit: '분',
    // 직전 세션의 한 부위 2개(session.tags) + 개인기록(PR). 시간·볼륨은 작게
    records: [
      { lb: '오늘 한 운동', v: '가슴 · 어깨', pr: 1, note: '48분 · 볼륨 6,200kg' },
      { lb: '이번 주', goal: { cur: 4, max: 4, unit: '회', proposed: false }, note: '3주 연속' },
      { lb: '이번 달', v: '14회', note: '지난달 12회' },
    ],
    beat: ['이번 주 4일을 채웠어요', '', ' — 3주 연속이에요'],
    weekly8: [4, 3, 4, 4, 3, 4, 4, 4], total: '올해 86회 · 64시간',
    pace: { now: '올해 평균 주 3.2회', goal: '주 4일 목표', proposed: false },
    statRecords: [{ lb: '올해 횟수', v: '86회' }, { lb: '최고 주 연속', v: '5주' }, { lb: '하루 최고', v: '71분' }],
  },
];

/* due 판정(§6): 보통 시각을 지났고 미완료인 활동 중 가장 이른 것. 동시 1개만. */
function dueOf(apps, nowMin) {
  let best = null;
  apps.forEach((a) => {
    if (a.done) return;
    if (a.usualMin <= nowMin) { if (!best || a.usualMin < best.usualMin) best = a; }
  });
  return best ? best.id : null;
}

/* ───────── 하루 고리 ───────── */
function DayRing({ done, total, size = 84 }) {
  const r = size / 2 - 7, C = 2 * Math.PI * r, seg = C / total, fill = seg * 0.78;
  return (
    <svg className="dayring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`오늘 ${done} / ${total}`}>
      {Array.from({ length: total }).map((_, i) => (
        <circle key={i} cx={size / 2} cy={size / 2} r={r} className={i < done ? 'dr-f' : 'dr-e'}
          strokeDasharray={`${fill} ${C - fill}`} transform={`rotate(${-90 + (360 / total) * i + 8} ${size / 2} ${size / 2})`} />
      ))}
      <text x="50%" y="50%" dy="0.36em" textAnchor="middle" className="dr-t">{done}/{total}</text>
    </svg>
  );
}

/* ───────── 히어로 (정본 유지) ───────── */
function Hero({ clock, apps, dueId }) {
  const { h, m, sec } = clock;
  const dec = clock.min / 60;
  const remainMin = 24 * 60 - (h * 60 + m);
  const rh = Math.floor(remainMin / 60), rm = remainMin % 60;
  const pct = Math.round(((h * 60 + m) / 1440) * 100);
  const doneCount = apps.filter((a) => a.done).length;
  const stops = apps.map((a) => ({ id: a.id, name: a.name, done: a.done, tlMeta: a.tlMeta, pos: px((a.done && a.atMin != null ? a.atMin : a.usualMin) / 60) }));

  const railRef = useRef(null), groupRefs = useRef({});
  const [W, setW] = useState(0), [lay, setLay] = useState(null);
  useLayoutEffect(() => {
    const measure = () => railRef.current && setW(railRef.current.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    if (railRef.current) ro.observe(railRef.current);
    return () => ro.disconnect();
  }, []);
  const clusters = useMemo(() => (W ? clusterPoints(stops.map((s) => ({ ...s, x: (s.pos / 100) * W }))) : []), [W, dueId]);
  useLayoutEffect(() => {
    if (!W || clusters.length === 0) return;
    const ws = clusters.map((c) => (groupRefs.current[c.key] ? groupRefs.current[c.key].offsetWidth : 60));
    const lefts = sweepLefts(clusters.map((c) => c.cx), ws, W);
    setLay({ lefts: Object.fromEntries(clusters.map((c, i) => [c.key, lefts[i]])), stems: clusters.map((c, i) => Math.min(Math.max(c.cx, lefts[i] + 16), lefts[i] + ws[i] - 16)) });
  }, [W, clusters]);

  return (
    <section className="hero" data-screen-label="오늘 흐름">
      <div className="hero-clock">
        <div className="clock-row">
          <div>
            <div className="clock"><b>{p2(h)}<i>:</i>{p2(m)}</b><em>{p2(sec)}</em></div>
            <p className="clock-remain">오늘이 <b>{rh}시간 {p2(rm)}분</b> 남았어요</p>
            <p className="clock-pct">하루의 <b>{pct}%</b>가 지나갔어요</p>
          </div>
          <DayRing done={doneCount} total={apps.length} />
        </div>
      </div>
      <div className="flow">
        <div className="flow-rail" ref={railRef}>
          <div className="flow-now" style={{ left: px(dec) + '%' }}>
            <span className="flow-now-pill">지금 <b>{p2(h)}:{p2(m)}</b></span><i className="flow-now-line"></i><i className="flow-now-dot"></i>
          </div>
          <div className="flow-axis"><i className="flow-axis-fill" style={{ width: px(dec) + '%' }}></i></div>
          {stops.map((a) => (<i key={a.id} className={'flow-pt' + (a.done ? ' done' : '') + (a.id === dueId ? ' due' : '')} style={{ left: a.pos + '%' }}></i>))}
          {lay && lay.stems.map((x, i) => (<i key={'s' + i} className="flow-stem" style={{ left: x }}></i>))}
          {clusters.map((c) => (
            <div key={c.key} className={'flow-group' + (c.items.length > 1 ? ' multi' : '')} ref={(el) => { groupRefs.current[c.key] = el; }}
              style={lay && lay.lefts[c.key] != null ? { left: lay.lefts[c.key] } : { left: c.cx, visibility: 'hidden' }}>
              <span className="fg-row">
                {c.items.map((a) => { const due = a.id === dueId; return (<span key={a.id} className={'fg-item' + (a.done ? ' done' : '') + (due ? ' due' : '')}><Mark done={a.done} size={13} accent={due} />{a.name}</span>); })}
              </span>
              {c.items.length === 1 && c.items[0].done && c.items[0].tlMeta && (<span className="flow-meta">{c.items[0].tlMeta}</span>)}
            </div>
          ))}
          {[6, 9, 12, 15, 18, 21, 24].map((hh) => (<i key={'t' + hh} className="flow-tick" style={{ left: px(hh) + '%' }}></i>))}
          <div className="flow-hours">{[6, 9, 12, 15, 18, 21, 24].map((hh) => (<span key={hh} style={{ left: px(hh) + '%' }}>{p2(hh)}</span>))}</div>
        </div>
      </div>
    </section>
  );
}

/* ───────── 월 캘린더 히트맵 ───────── */
function MonthCal({ days, todayDate, month, offset, unit }) {
  const max = Math.max(...days, 1);
  const lv = (v) => (v === 0 ? 0 : v < max * 0.34 ? 1 : v < max * 0.67 ? 2 : 3);
  return (
    <div className="cal">
      <span className="cal-month">{month}월</span>
      <div className="cal-grid">
        {['월', '화', '수', '목', '금', '토', '일'].map((d) => <span key={d} className="cal-wd">{d}</span>)}
        {Array.from({ length: offset }).map((_, i) => <i key={'p' + i} className="cc pad"></i>)}
        {Array.from({ length: TODAY.dim }).map((_, i) => {
          const d = i + 1, v = days[i] || 0, fut = d > todayDate;
          return <i key={d} className={'cc' + (fut ? ' fut' : ' h' + lv(v)) + (d === todayDate ? ' today' : '')} title={`${month}월 ${d}일${v > 0 ? ` · ${v}${unit}` : ''}`}></i>;
        })}
      </div>
    </div>
  );
}

/* ───────── 기록 1종 (통일 4행 구조: 라벨 · 값 · 진행막대 · 보조줄) ───────── */
function Rec({ r, showGoal }) {
  const g = r.goal;
  // 제안 목표는 Tweaks로 끌 수 있음. 실제 목표(운동)는 항상 표시.
  const showG = g && (!g.proposed || showGoal);
  let value;
  if (g) {
    value = showG
      ? <>{g.cur}<span className={'goal-sep' + (g.proposed ? ' soft' : '')}> / {g.max}{g.unit}</span></>
      : `${g.cur}${g.unit}`;
  } else {
    value = r.v;
  }
  return (
    <div className="rec">
      <span className="rec-lb">
        {r.lb}
        {showG && g.proposed && <span className="rec-goal" title="주간 목표 제안값 — 아직 설정 전이에요">제안</span>}
        {r.pr > 0 && <span className="rec-pr" title="개인 기록">★ 신기록 {r.pr}</span>}
      </span>
      <span className="rec-v">{value}</span>
      <span className="rec-goalcell">
        {showG && (
          <span className="goalbar" aria-hidden="true">
            {Array.from({ length: g.max }).map((_, i) => (
              <i key={i} className={i < g.cur ? 'on' : (i === g.cur ? 'next' : '')}></i>
            ))}
          </span>
        )}
      </span>
      <span className="rec-note">{r.note || ''}</span>
    </div>
  );
}

/* ───────── 활동 행 ───────── */
function AppRow({ app, due, open, onToggle, onStats, tw }) {
  const done = app.done;
  const hook = done && app.hookDone ? app.hookDone : app.hook;
  const cta = done && app.ctaDone ? app.ctaDone : app.cta;
  return (
    <li className={'row' + (open ? ' is-open' : '') + (done ? ' is-done' : '') + (due && !done ? ' is-due' : '')} data-screen-label={app.name}>
      <button className="row-head" onClick={onToggle} aria-expanded={open}>
        <Mark done={done} accent={due && !done} />
        <span className="row-name">{app.name}</span>
        <span className="row-mid">
          <p className="row-hook">{hook.title} <b>{hook.strong}</b>{hook.tail || ''}</p>
          <span className="row-sub"><span className={app.subGap ? 'gap-fact' : (app.subStrong ? 'sub-strong' : '')}>{app.sub}</span></span>
        </span>
        <a className="cta" href={app.url || '#'} role="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
          <i className="cta-ic"><AppIcon id={app.id} /></i>
          <span className="cta-lb">{cta}</span>
          <GoIcon />
        </a>
        <Chev open={open} />
      </button>
      {open && (
        <div className="row-detail">
          <MonthCal days={app.cal} todayDate={TODAY.d} month={TODAY.mo} offset={MONTH_OFFSET} unit={app.calUnit} />
          <div className="recs">
            {app.records.map((r) => <Rec key={r.lb} r={r} showGoal={tw.goalSlot} />)}
          </div>
          {tw.showBeat && (
            <div className="beat">
              <span className="beat-txt">{app.beat[0]}<b>{app.beat[1]}</b>{app.beat[2]}</span>
              <a className="beat-more" onClick={onStats}>전체 통계</a>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/* ───────── 전체 통계 ───────── */
function StatsView({ apps, onClose }) {
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);
  return (
    <div className="stats" data-screen-label="전체 통계">
      <div className="stats-head">
        <h2>전체 통계</h2><span className="stats-range">최근 8주 · 주별 활동 일수</span>
        <button className="stats-close" onClick={onClose} aria-label="닫기">✕</button>
      </div>
      <div className="stats-grid">
        {apps.map((app) => {
          const max = Math.max(...app.weekly8, 1);
          return (
            <div key={app.id} className="stat-block">
              <div className="stat-top">
                <i className="stat-ic"><AppIcon id={app.id} /></i>
                <span className="stat-name">{app.name}</span>
                <span className="stat-total">{app.total}</span>
              </div>
              <div className="stat-pace">
                <b>{app.pace.now}</b>
                <span className="pace-goal">· {app.pace.goal}</span>
              </div>
              <div className="stat-bars">
                {app.weekly8.map((v, i) => (
                  <span key={i} className={'sb' + (i === 7 ? ' this' : '') + (v === 0 ? ' zero' : '')}>
                    <i style={{ height: Math.max((v / max) * 60, 2) + 'px' }} title={`${v}일`}></i>
                  </span>
                ))}
              </div>
              <div className="stat-axis"><span>8주 전</span><span>이번 주</span></div>
              <div className="stat-recs">
                {app.statRecords.map((r) => (<span key={r.lb} className="stat-rec"><em>{r.lb}</em><b>{r.v}</b></span>))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ───────── Tweaks 패널 ───────── */
const TW_KEY = 'cue.redesign.tweaks';
const TW_DEFAULTS = { nowMin: 20 * 60 + 18, goalSlot: true, showBeat: true, motion: true };
function loadTw() { try { return { ...TW_DEFAULTS, ...JSON.parse(localStorage.getItem(TW_KEY) || '{}') }; } catch { return { ...TW_DEFAULTS }; } }

function Tweaks({ tw, set, open, onClose }) {
  if (!open) return null;
  const hh = Math.floor(tw.nowMin / 60), mm = tw.nowMin % 60;
  return (
    <div className="tw">
      <div className="tw-head"><span>Tweaks</span><button onClick={onClose} aria-label="닫기">✕</button></div>
      <div className="tw-sec">시각</div>
      <label className="tw-row">
        <span>지금 시각 <b>{p2(hh)}:{p2(mm)}</b></span>
        <input type="range" min={360} max={1439} step={3} value={tw.nowMin} onChange={(e) => set('nowMin', +e.target.value)} />
        <span className="tw-hint">시각이 보통 수행 시각을 지나면 그 활동이 ‘지금 할 일’로 바뀌어요</span>
      </label>
      <div className="tw-sec">표시</div>
      <label className="tw-toggle"><input type="checkbox" checked={tw.goalSlot} onChange={(e) => set('goalSlot', e.target.checked)} /><span>주간 목표 슬롯</span><span className="tw-hint">독서·글쓰기·어학은 제안값(DB에 없음), 운동만 실제 목표</span></label>
      <label className="tw-toggle"><input type="checkbox" checked={tw.showBeat} onChange={(e) => set('showBeat', e.target.checked)} /><span>경신 한 줄(beat)</span></label>
      <label className="tw-toggle"><input type="checkbox" checked={tw.motion} onChange={(e) => set('motion', e.target.checked)} /><span>애니메이션</span></label>
    </div>
  );
}

/* ───────── 시계 (데모 시각 + 초 진행) ───────── */
function useClock(nowMin) {
  const [tick, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick((t) => t + 1), 1000); return () => clearInterval(id); }, []);
  const anchor = useRef(null);
  if (!anchor.current || anchor.current.nowMin !== nowMin) anchor.current = { nowMin, t0: Date.now() };
  const elapsed = (Date.now() - anchor.current.t0) / 1000;
  const secOfDay = (nowMin * 60 + elapsed) % 86400;
  return { h: Math.floor(secOfDay / 3600), m: Math.floor(secOfDay / 60) % 60, sec: Math.floor(secOfDay % 60), min: secOfDay / 60 };
}

/* ───────── 앱 ───────── */
function App() {
  const [tw, setTw] = useState(loadTw);
  const set = (k, v) => setTw((prev) => { const next = { ...prev, [k]: v }; localStorage.setItem(TW_KEY, JSON.stringify(next)); return next; });
  const [twOpen, setTwOpen] = useState(false);
  const [openId, setOpenId] = useState('read');
  const [stats, setStats] = useState(false);
  const clock = useClock(tw.nowMin);
  const dueId = dueOf(APPS, clock.min);

  return (
    <div className={'page' + (tw.motion ? '' : ' no-motion')}>
      <header className="hd">
        <span className="logo">cue<i>.</i></span>
        <span className="date">{TODAY.y}.{p2(TODAY.mo)}.{p2(TODAY.d)} {TODAY.wd}</span>
        <button className="hd-stats" onClick={() => setStats(true)}>전체 통계</button>
      </header>
      {stats ? (
        <StatsView apps={APPS} onClose={() => setStats(false)} />
      ) : (
        <>
          <Hero clock={clock} apps={APPS} dueId={dueId} />
          <ul className="rows" data-screen-label="활동 목록">
            {APPS.map((app) => (
              <AppRow key={app.id} app={app} due={app.id === dueId} open={openId === app.id} tw={tw}
                onToggle={() => setOpenId(openId === app.id ? null : app.id)} onStats={() => setStats(true)} />
            ))}
          </ul>
        </>
      )}
      <button className="tw-fab" onClick={() => setTwOpen((v) => !v)} aria-label="Tweaks">⚙</button>
      <Tweaks tw={tw} set={set} open={twOpen} onClose={() => setTwOpen(false)} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
