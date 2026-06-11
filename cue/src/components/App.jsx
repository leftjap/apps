/* App.jsx — cue v8 대시보드 (design-ref/v8 작업지시서 기준. 시안 app.jsx 277~338행 이식).
   plumbing 변경: 데이터 useApps(데모/실데이터), due = dueOf(§6 — DUE_ID 목업 제거),
   useClock 으로 데모 시각 QA(§11) 지원, Gate/AccountMenu 승계. 토큰은 고정(§4) — 색 트윅 없음. */
import React, { useState, useEffect, useRef } from 'react';
import {
  useTweaks, TweaksPanel, TweakSection, TweakSlider, TweakToggle,
} from './Tweaks.jsx';
import { useApps } from '../data/useApps.js';
import { dueOf, p2, startOfToday, WD } from '../data/transforms.js';
import { signInWithGoogle } from '../services/auth.js';
import AccountMenu from './AccountMenu.jsx';
import Hero from './Hero.jsx';
import AppRow from './AppRow.jsx';
import StatsView from './StatsView.jsx';

const TWEAK_DEFAULTS = {
  demoMode: false, // 기본 실데이터 — 데모는 Tweaks 에서
  liveTime: true,  // OFF 시 demoHour 기준 — 시간대별 due·타임라인 검증용 (QA §11)
  demoHour: 16.5,
  showSec: true,
  motion: true,
};

/* 상시표시 시계 — 1s interval 하나로 시계·초·자정 롤오버 공용.
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

function Dashboard({ apps, t }) {
  const clock = useClock(t.liveTime, t.demoHour);
  const today = startOfToday();
  const [openId, setOpenId] = useState('read'); // 첫 행 기본 펼침 (§2 시안 1)
  const [stats, setStats] = useState(false);
  const dueId = dueOf(apps, clock.min);

  return (
    <div className={'page' + (t.motion ? '' : ' no-motion')}>
      <header className="hd">
        <span className="logo">cue<i>.</i></span>
        <span className="date">{today.getFullYear()}.{p2(today.getMonth() + 1)}.{p2(today.getDate())} {WD[today.getDay()]}</span>
        <button className="hd-stats" onClick={() => setStats(true)}>전체 통계</button>
        <AccountMenu />
      </header>

      {stats ? (
        <StatsView apps={apps} onClose={() => setStats(false)} />
      ) : (
        <>
          <Hero clock={clock} showSec={t.showSec} apps={apps} dueId={dueId} />
          <ul className="rows" data-screen-label="활동 목록">
            {apps.map((app) => (
              <AppRow
                key={app.id}
                app={app}
                due={app.id === dueId}
                open={openId === app.id}
                today={today}
                onToggle={() => setOpenId(openId === app.id ? null : app.id)}
                onStats={() => setStats(true)}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/* ---------- gate — 로그인/로딩/에러 (실데이터 모드에서 apps 없을 때) ---------- */
function Gate({ status }) {
  const wrap = { minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px', background: '#FAF7F1' };
  const brand = <span className="logo" style={{ fontSize: '22px' }}>cue<i>.</i></span>;
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
        <p style={{ color: '#786C57', fontSize: '14px', lineHeight: 1.6, margin: '18px 0 22px' }}>
          독서·글쓰기·어학·운동을 한 화면에서. 시작하려면 로그인하세요.
        </p>
        <button onClick={signInWithGoogle}
          style={{ background: '#27211A', color: '#fff', border: 0, borderRadius: '10px', padding: '11px 18px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          Google로 로그인
        </button>
      </div>
    </div>
  );
}

export default function App() {
  // v8 키 — 구 cue.tweaks 의 슬라이더 값(숫자 motion 등)이 새 토글 기본값을 덮지 않게 분리
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS, 'cue.tweaks.v8');
  const { status, apps } = useApps(t.demoMode);
  const showDash = (status === 'demo' || status === 'ready') && apps;

  return (
    <>
      {showDash ? <Dashboard apps={apps} t={t} /> : <Gate status={status} />}
      <TweaksPanel title="Tweaks">
        <TweakSection label="동작" />
        <TweakToggle label="데모 모드" value={t.demoMode} onChange={(v) => setTweak('demoMode', v)} />
        <TweakSection label="시각 (QA)" />
        <TweakToggle label="실제 시각 사용" value={t.liveTime} onChange={(v) => setTweak('liveTime', v)} />
        {!t.liveTime && <TweakSlider label="데모 시각" value={t.demoHour} min={0} max={23.75} step={0.25} unit="시" onChange={(v) => setTweak('demoHour', v)} />}
        <TweakSection label="표시" />
        <TweakToggle label="초 표시" value={t.showSec} onChange={(v) => setTweak('showSec', v)} />
        <TweakToggle label="애니메이션" value={t.motion} onChange={(v) => setTweak('motion', v)} />
      </TweaksPanel>
    </>
  );
}
