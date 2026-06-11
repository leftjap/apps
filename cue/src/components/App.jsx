/* App.jsx — cue 런처 (springboard). 시안 app-l.jsx 이식.
   변경점(데이터 plumbing 만, DOM/CSS 는 시안 verbatim):
   - 전역 HABITS/ORDER → props/import (Task 4 실데이터 교체점)
   - BASE 하드코딩(2026-06-08) → startOfToday() 동적
   - fullSeq(h,st) → fullSeq(h.hist, st.today) (순수 시그니처)
   상태(none/progress/done)는 demo: cycle 순환 / 실데이터: 단일 cur(adapter). */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SENTENCES } from '../data/sentences.js';
import { ORDER } from '../data/mock.js';
import {
  fullSeq, level, longestRun, dayMeta, sentenceOfDay, p2, startOfToday,
  sumCurrentWeek, activeDaysInCurrentWeek,
} from '../data/transforms.js';
import { nextOf } from '../data/flow.js';
import {
  useTweaks, TweaksPanel, TweakSection, TweakSlider, TweakToggle,
} from './Tweaks.jsx';
import { useHabits } from '../data/useHabits.js';
import { launchHabit } from '../data/launch.js';
import { signInWithGoogle } from '../services/auth.js';
import AccountMenu from './AccountMenu.jsx';
import FlowBand from './FlowBand.jsx';

const TWEAK_DEFAULTS = {
  demoMode: false, // 작업지시서 §9 — 기본 OFF (카드 탭 = 실제 앱 실행). 데모는 Tweaks 에서.
  warmth: 50,
  accent: 67,
  period: 28,
  density: 50,
  showRibbon: true,
  showRecord: true,
  // 오늘 흐름 (flow 작업지시서 §3.1·§6·§7)
  liveTime: true,  // 실연동 기본 ON — OFF 시 demoHour 기준 (시간대별 상태 검증용)
  demoHour: 16.5,
  showSec: true,
  motion: 70,      // 0~100 → --motion 0~1. 0이면 상시 모션 전부 정지
  startHour: 6,    // 타임라인 창 시작 (0/3/6/9시)
};

/* 상시표시 시계 — 1s interval 하나로 시계·초·자정 롤오버·운동 타이머 공용 (flow 작업지시서 §6).
   실시간 OFF(Tweaks) 면 demoHour 기준 + 초는 계속 흐름 — 시간대별 상태 검증용. */
function useClock(live, demoHour) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const anchor = useRef(null);
  if (!anchor.current || anchor.current.demoHour !== demoHour) anchor.current = { demoHour, t0: Date.now() };
  if (live) {
    const d = new Date();
    return { h: d.getHours(), m: d.getMinutes(), sec: d.getSeconds(), min: d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60 };
  }
  const elapsed = (Date.now() - anchor.current.t0) / 1000;
  const secOfDay = (demoHour * 3600 + elapsed) % 86400;
  return { h: Math.floor(secOfDay / 3600), m: Math.floor(secOfDay / 60) % 60, sec: Math.floor(secOfDay % 60), min: secOfDay / 60 };
}

/* ---------- hero ---------- */
function Header({ flags, base }) {
  const [i, setI] = useState(sentenceOfDay(SENTENCES.length));
  const s = SENTENCES[i];
  const parts = s.hi && s.text.includes(s.hi) ? s.text.split(s.hi) : null;
  const t = dayMeta(0, base);
  const done = flags.filter(Boolean).length;
  const allDone = done === flags.length && flags.length > 0;
  return (
    <header className="head">
      <div className="head__l">
        <div className="head__meta">
          <span className="brand">cue<i className="brand__dot" /></span>
          <span>오늘</span>
          <span className="date mono">{base.getFullYear()}.{p2(t.m)}.{p2(t.d)} <b>{t.wd}</b></span>
        </div>
        <h1 className="sentence">
          {parts ? <>{parts[0]}<span className="uline">{s.hi}</span>{parts[1]}</> : s.text}
          <button className="shuffle" title="다른 문장" aria-label="다른 문장 보기"
            onClick={() => setI((v) => (v + 1) % SENTENCES.length)}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 6.5A5 5 0 0 0 3.6 5" /><path d="M3 2.5V5h2.5" />
              <path d="M3 9.5A5 5 0 0 0 12.4 11" /><path d="M13 13.5V11h-2.5" />
            </svg>
          </button>
        </h1>
      </div>
      <div className="head__r">
        <AccountMenu />
        <div className={`tally${allDone ? ' alldone' : ''}`}>
          <span className="tally__n">{allDone
            ? <><b>오늘 다 했어요</b> <span className="chk" aria-hidden="true">✓</span></>
            : <>오늘 <b>{done}</b> / {flags.length}</>}</span>
          <span className="tally__dots">
            {flags.map((f, k) => <span key={k} className={`tally__d${f ? ' on' : ''}`} />)}
          </span>
        </div>
      </div>
    </header>
  );
}

/* ---------- door (앱으로 들어가는 문) ---------- */
function Door({ habit, stateKey, demoMode, onDemo, isNext }) {
  const st = habit.states[stateKey];
  // 운동 라이브 경과 — Dashboard 가 시계(1s)로 재렌더하므로 별도 interval 없이 seed+경과로 파생
  const tRef = useRef(null);
  if (st.kind === 'progress' && st.timer && (!tRef.current || tRef.current.seed !== st.timer)) {
    tRef.current = { seed: st.timer, t0: Date.now() };
  }
  const tSec = tRef.current ? tRef.current.seed + Math.floor((Date.now() - tRef.current.t0) / 1000) : 0;
  const timer = `${p2(Math.floor(tSec / 60))}:${p2(tSec % 60)}`;
  const ref = useRef(null);

  const launch = useCallback(() => {
    const el = ref.current;
    // 데모: 상태순환 / 실모드 url: 앱 열기(launching 모션) / url 없음(iPhone): 무동작 — launch.js
    launchHabit({
      habit, demoMode, onDemo,
      open: (url, target, feat) => {
        if (el && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
          el.classList.remove('launching'); void el.offsetWidth; el.classList.add('launching');
        }
        window.open(url, target, feat);
      },
    });
  }, [demoMode, onDemo, habit]);

  const onKey = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); launch(); } };

  const cueEl = (() => {
    if (st.kind === 'progress' && st.timer)
      return <><span className="live" /><span className="nw">운동 중</span> <span className="timer">{timer}</span></>;
    if (st.kind === 'progress') return <><span className="led" />{st.line}</>;
    return <span className="nw">{st.line}</span>;
  })();

  const isPhone = habit.device === 'iPhone';
  const label = demoMode
    ? `${habit.ko} — ${st.line}. (데모: 탭하면 상태 전환)`
    : isPhone ? `${habit.ko} — ${st.line}. iPhone 전용`
    : `${habit.ko} 열기 — ${st.line}`;

  return (
    <button ref={ref} className={`door is-${st.kind}${isNext ? ' is-next' : ''}`} onClick={launch} onKeyDown={onKey} aria-label={label}>
      <span className="door__seal" aria-hidden="true">
        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7.5 L6 10.5 L11 4.5" /></svg>
        오늘 완료
      </span>
      {isNext && <span className="door__nexttag" aria-hidden="true">다음</span>}
      <div className="door__name">
        <span className="door__ko">{habit.ko}</span>
        <span className="door__en">{habit.en}</span>
      </div>
      <div className="door__streak">
        <span className="door__big mono" key={st.big}>{st.big}</span>
        {st.denom && <span className="door__denom mono">{st.denom}</span>}
        <span className="door__unit">{st.unit}</span>
      </div>
      <div className="door__cue">{cueEl}</div>
      <div className="door__enter">
        {st.enter
          ? <span className="door__go">{st.enter}
              <span className="arc"><svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10 L10 4" /><path d="M5 4 H10 V9" /></svg></span>
            </span>
          : <span className="door__go" style={{ color: 'var(--ink-4)' }}>
              <span className="arc" style={{ background: 'var(--line-soft)' }}><svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="4.5" y="2.5" width="5" height="9" rx="1.2" /></svg></span>
              iPhone 전용
            </span>}
      </div>
    </button>
  );
}

/* ---------- record (calendar) ---------- */
function Record({ habits, stateKeys, period, order, onOpenStats, base }) {
  const ticks = [period - 1, Math.round((period - 1) * 0.74), Math.round((period - 1) * 0.5), Math.round((period - 1) * 0.26), 0].map((n) => dayMeta(n, base));
  const seqs = habits.map((h, i) => fullSeq(h.hist, h.states[stateKeys[i]].today).slice(-period));
  const runs = seqs.map((s) => longestRun(s));
  const longest = Math.max(...runs);
  const longestKo = longest > 0 ? habits[runs.indexOf(longest)].ko : null; // 동률 시 첫 습관
  let total = 0, sum = 0;
  seqs.forEach((s) => s.forEach((v) => { total++; if (v > 0) sum++; }));
  const comp = total ? Math.round(sum / total * 100) : 0;
  const weekActive = activeDaysInCurrentWeek(seqs, base);
  const wi = habits.findIndex((h) => h.id === 'today');
  const weekPages = Math.round(sumCurrentWeek(seqs[wi], base) * 10) / 10; // 이번주 = 월~오늘
  const from = dayMeta(period - 1, base), to = dayMeta(0, base);

  return (
    <section className="rec">
      <div className="rec__head">
        <span className="rec__title">그간의 기록</span>
        <div className="rec__headr">
          <span className="rec__sub">최근 {Math.round(period / 7)}주</span>
          <button className="rec__more" onClick={onOpenStats}>전체 통계 <span aria-hidden="true">→</span></button>
        </div>
      </div>
      <div className="rec__axis">
        <span />
        <span className="rec__dates">
          {ticks.map((d, k) => <span key={k} className="mono">{k === ticks.length - 1 ? <b>오늘</b> : `${d.m}.${p2(d.d)}`}</span>)}
        </span>
      </div>
      <div className="rec__rows">
        {(order || habits.map((_, i) => i)).map((i) => {
          const h = habits[i];
          const st = h.states[stateKeys[i]];
          const seq = fullSeq(h.hist, st.today).slice(-period);
          return (
            <div className="rrow" key={h.id}>
              <span className="rrow__name">{h.ko}</span>
              <div className="rrow__r">
                <span className="cells">
                  {seq.map((c, k) => {
                    const isToday = k === seq.length - 1;
                    const dm = dayMeta(period - 1 - k, base);
                    let cls = 'cell';
                    if (dm.wd === '토' || dm.wd === '일') cls += ' we';
                    const lv = level(+c, h.metric.max); if (lv) cls += ' ' + lv;
                    if (isToday) cls += ' today';
                    const status = +c > 0 ? `${+c}${h.metric.unit}` : '안 함';
                    return <span key={k} className={cls} title={`${dm.m}.${p2(dm.d)} (${dm.wd}) · ${isToday ? '오늘 · ' : ''}${status}`} />;
                  })}
                </span>
                <span className={`rrow__streak mono${st.big > 0 ? '' : ' is-zero'}`}>
                  {h.id === 'gym' ? <>이번주 <b>{st.big}</b>회</> : <>연속 <b>{st.big}</b>일</>}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="rec__legend">
        <span className="lg"><i className="sw empty" />안 함</span>
        <span className="lg"><i className="sw grad" />적게 → 많이</span>
        <span className="lg"><i className="sw today" />오늘</span>
        <span className="lg lg--note">칸 진하기 = 그날 한 양 (운동 분 · 어학 문장 · 글쓰기 매 · 독서 분)</span>
      </div>
      <div className="rec__figs">
        <div className="fig"><span className="fig__n mono accent">{weekActive}<span className="u">/7일</span></span><span className="fig__l">이번주 활동</span></div>
        <div className="fig"><span className="fig__n mono">{weekPages}<span className="u">매</span></span><span className="fig__l">이번주 원고</span></div>
        <div className="fig"><span className="fig__n mono">{comp}<span className="u">%</span></span><span className="fig__l">{Math.round(period / 7)}주 활동률</span></div>
        <div className="fig"><span className="fig__n mono">{longest}<span className="u">일</span></span><span className="fig__l">최장 연속{longestKo ? ` · ${longestKo}` : ''}</span></div>
        <span className="range">{from.m}.{p2(from.d)} – {to.m}.{p2(to.d)}</span>
      </div>
    </section>
  );
}

/* 12주 추세 — 데모 폴백용(실데이터는 adapter 의 habit.trend 사용). id 시드 결정론적 */
function weeklyTrend(seed, weeks) {
  let r = (seed * 7919) % 233280;
  const out = [];
  for (let w = 0; w < weeks; w++) {
    r = (r * 9301 + 49297) % 233280;
    const noise = (r / 233280 - 0.5) * 0.30;
    const base = 0.40 + (w / (weeks - 1)) * 0.50;
    out.push(Math.max(0.12, Math.min(1, base + noise)));
  }
  return out;
}

function StatsOverlay({ habits, stateKeys, order, onClose }) {
  useEffect(() => {
    const onEsc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);
  const WEEKS = 12;
  const isReal = (order || habits.map((_, i) => i)).some((i) => Array.isArray(habits[i].trend));
  return (
    <div className="ov" onClick={onClose}>
      <div className="ov__panel" onClick={(e) => e.stopPropagation()}>
        <div className="ov__head">
          <span className="ov__title">전체 통계</span>
          <button className="ov__close" onClick={onClose} aria-label="닫기">×</button>
        </div>
        <div className="ov__sub">최근 12주 · 습관별 추세</div>
        <div className="ov__rows">
          {(order || habits.map((_, i) => i)).map((i) => {
            const h = habits[i]; const st = h.states[stateKeys[i]];
            const longest = h.longest != null ? h.longest : longestRun(fullSeq(h.hist, st.today));
            const ratios = h.trend || weeklyTrend(h.id.charCodeAt(0) + h.id.length, WEEKS);
            const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
            const perWeek = Math.round(avg * 7 * 10) / 10;
            return (
              <div className="ovrow" key={h.id}>
                <div className="ovrow__name">
                  <span className="ovrow__ko">{h.ko}</span>
                  <span className="ovrow__meta">{h.en}</span>
                </div>
                <div className="ovrow__r">
                  <div className="ovweeks">
                    {ratios.map((rt, w) => {
                      const lv = rt < 0.4 ? 'w1' : rt < 0.7 ? 'w2' : 'w3';
                      return <span key={w} className={`ovweek ${lv}${w === WEEKS - 1 ? ' now' : ''}`} style={{ height: `${Math.round(rt * 100)}%` }} title={`${WEEKS - w}주 전 · ${Math.round(rt * 100)}%`} />;
                    })}
                  </div>
                  <div className="ovrow__figs">
                    <span className="ovf">현재 <b>{st.big}</b>{h.id === 'gym' ? '회' : '일'}</span>
                    <span className="ovf">최장 <b>{longest}</b>일</span>
                    <span className="ovf">주평균 <b className="acc">{perWeek}</b>일 활동</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="ov__note">{isReal ? '최근 12주 · 주별 활동일 비율 (현재 주 강조)' : '12주 추세는 데모 목업 · 실연동 시 실데이터'}</div>
      </div>
    </div>
  );
}

function applyTweaks(t) {
  const r = document.documentElement.style;
  r.setProperty('--g-h', String(Math.round(40 + (t.warmth / 100) * 45)));
  r.setProperty('--crail', `oklch(67% ${(0.06 + (t.accent / 100) * 0.10).toFixed(3)} 50)`);
  r.setProperty('--crail-deep', `oklch(48% ${(0.07 + (t.accent / 100) * 0.11).toFixed(3)} 50)`);
  r.setProperty('--density', (0.82 + (t.density / 100) * 0.45).toFixed(3));
  r.setProperty('--motion', String(t.motion / 100));
  // 0이면 정지. 그 외엔 inline 제거 — prefers-reduced-motion CSS 가 inline 에 덮이지 않게 (§7)
  if (t.motion === 0) r.setProperty('--anim', 'paused');
  else r.removeProperty('--anim');
}

/* ---------- dashboard (시안 본문) — habits 주입받아 렌더 ---------- */
function Dashboard({ habits, t }) {
  const demoMode = t.demoMode;
  const clock = useClock(t.liveTime, t.demoHour); // 1s 단일 interval — 자정 롤오버·시계·타이머 공용
  const base = startOfToday();
  const [idxs, setIdxs] = useState(() => habits.map((h) => h.cycle.indexOf(h.start)));
  useEffect(() => { setIdxs(habits.map((h) => h.cycle.indexOf(h.start))); }, [habits]);
  const demo = useCallback((i) => {
    setIdxs((prev) => prev.map((v, k) => (k === i ? (v + 1) % habits[i].cycle.length : v)));
  }, [habits]);
  const demoById = useCallback((id) => {
    const i = habits.findIndex((h) => h.id === id);
    if (i >= 0) demo(i);
  }, [habits, demo]);
  const stateKeys = idxs.map((ix, i) => habits[i].cycle[ix]);
  // 표시 순서 = 하루 흐름(ORDER). 문·탤리·기록 모두 동일 순서로 일관.
  const ord = ORDER.map((id) => habits.findIndex((h) => h.id === id)).filter((i) => i >= 0);
  const flags = ord.map((i) => habits[i].states[stateKeys[i]].kind === 'done');
  // "다음" = 미실행 중 밀린 것 우선 — 도어 태그·흐름 밴드 동일 소스 (flow 작업지시서 §3.4)
  const pend = habits.map((h, i) => ({ h, st: h.states[stateKeys[i]] })).filter((x) => x.st.kind === 'none');
  const nextId = nextOf(pend, clock.min);
  const [statsOpen, setStatsOpen] = useState(false);

  return (
    <div className="page">
      <Header flags={flags} base={base} />
      {t.showRibbon && (
        <FlowBand habits={habits} stateKeys={stateKeys} clock={clock} showSec={t.showSec}
          startHour={t.startHour} nextId={nextId} demoMode={demoMode} onDemo={demoById} />
      )}
      <section className="doors">
        {ord.map((i) => (
          <Door key={habits[i].id} habit={habits[i]} stateKey={stateKeys[i]} demoMode={demoMode} onDemo={() => demo(i)} isNext={habits[i].id === nextId} />
        ))}
      </section>
      {t.showRecord && <Record habits={habits} stateKeys={stateKeys} period={t.period} order={ord} onOpenStats={() => setStatsOpen(true)} base={base} />}
      <p className="hint">
        {demoMode
          ? <>데모 모드 · 카드를 <b>탭</b>하면 상태가 바뀝니다 (미실행→진행→완료) · 데이터는 목업</>
          : <>카드를 <b>탭</b>하면 해당 앱이 열립니다 · 운동은 <b>iPhone</b> 전용</>}
      </p>
      {statsOpen && <StatsOverlay habits={habits} stateKeys={stateKeys} order={ord} onClose={() => setStatsOpen(false)} />}
    </div>
  );
}

/* ---------- gate — 로그인/로딩/에러 (실데이터 모드에서 habits 없을 때) ---------- */
function Gate({ status }) {
  const wrap = { minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px', background: 'var(--paper)' };
  const brand = (
    <div className="head__meta" style={{ justifyContent: 'center' }}>
      <span className="brand" style={{ fontSize: '22px' }}>cue<i className="brand__dot" /></span>
    </div>
  );
  if (status === 'loading') {
    return <div style={wrap}><div style={{ textAlign: 'center' }}>{brand}<p className="hint" style={{ marginTop: '16px' }}>불러오는 중…</p></div></div>;
  }
  if (status === 'error') {
    return <div style={wrap}><div style={{ textAlign: 'center' }}>{brand}<p className="hint" style={{ marginTop: '16px' }}>데이터를 불러오지 못했어요 · Tweaks(<b>t</b>)에서 데모 모드로 미리볼 수 있어요</p></div></div>;
  }
  // signed-out
  return (
    <div style={wrap}>
      <div style={{ textAlign: 'center', maxWidth: '300px' }}>
        {brand}
        <p style={{ color: 'var(--ink-3)', fontSize: '14px', lineHeight: 1.6, margin: '18px 0 22px' }}>
          어학·운동·글쓰기·독서를 한 화면에서. 시작하려면 로그인하세요.
        </p>
        <button onClick={signInWithGoogle}
          style={{ background: 'var(--ink-1)', color: '#fff', border: 0, borderRadius: '10px', padding: '11px 18px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--sans)' }}>
          Google로 로그인
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  useEffect(() => { applyTweaks(t); }, [t]);
  const { status, habits } = useHabits(t.demoMode);
  const showDash = (status === 'demo' || status === 'ready') && habits;

  return (
    <>
      {showDash ? <Dashboard habits={habits} t={t} /> : <Gate status={status} />}
      <TweaksPanel title="Tweaks">
        <TweakSection label="동작" />
        <TweakToggle label="데모 모드 (탭=상태전환)" value={t.demoMode} onChange={(v) => setTweak('demoMode', v)} />
        <TweakToggle label="오늘 흐름 보이기" value={t.showRibbon} onChange={(v) => setTweak('showRibbon', v)} />
        <TweakToggle label="기록 보이기" value={t.showRecord} onChange={(v) => setTweak('showRecord', v)} />
        <TweakSlider label="기록 기간" value={t.period} min={14} max={35} step={7} unit="일" onChange={(v) => setTweak('period', v)} />
        <TweakSection label="오늘 흐름" />
        <TweakToggle label="실제 시각 사용" value={t.liveTime} onChange={(v) => setTweak('liveTime', v)} />
        {!t.liveTime && <TweakSlider label="데모 시각" value={t.demoHour} min={5} max={23.5} step={0.25} unit="시" onChange={(v) => setTweak('demoHour', v)} />}
        <TweakSlider label="타임라인 시작" value={t.startHour} min={0} max={9} step={3} unit="시" onChange={(v) => setTweak('startHour', v)} />
        <TweakSection label="모션" />
        <TweakToggle label="초 표시" value={t.showSec} onChange={(v) => setTweak('showSec', v)} />
        <TweakSlider label="모션 수위" value={t.motion} min={0} max={100} step={10} onChange={(v) => setTweak('motion', v)} />
        <TweakSection label="색" />
        <TweakSlider label="색온도" value={t.warmth} min={0} max={100} onChange={(v) => setTweak('warmth', v)} />
        <TweakSlider label="Crail 강도" value={t.accent} min={0} max={100} onChange={(v) => setTweak('accent', v)} />
        <TweakSection label="레이아웃" />
        <TweakSlider label="간격" value={t.density} min={0} max={100} onChange={(v) => setTweak('density', v)} />
      </TweaksPanel>
    </>
  );
}
