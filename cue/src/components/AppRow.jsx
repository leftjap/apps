/* AppRow.jsx — v9 활동 행 + 월 캘린더 + 펼침 (작업지시서 §2 통일 골격).
   기록 3종을 직전 → 이번 주(근접목표 진행막대) → 추세 4행 subgrid 로 정렬 (§6 정렬 필수).
   plumbing: due prop(§6), MonthCal 요일 오프셋 일반화, CTA 는 launch.js 로 실제 앱 열기. */
import React from 'react';
import { AppIcon, GoIcon, Chev, Mark } from './icons.jsx';
import { launchHabit } from '../data/launch.js';

/* ---------------- 월 캘린더 히트맵 ---------------- */
function MonthCal({ days, todayDate, month, offset, unit }) {
  const max = Math.max(...days, 1);
  const lv = (v) => (v === 0 ? 0 : v < max * 0.34 ? 1 : v < max * 0.67 ? 2 : 3);
  return (
    <div className="cal">
      <span className="cal-month">{month}월</span>
      <div className="cal-grid">
        {['월', '화', '수', '목', '금', '토', '일'].map((d) => <span key={d} className="cal-wd">{d}</span>)}
        {Array.from({ length: offset }).map((_, i) => <i key={'p' + i} className="cc pad"></i>)}
        {days.map((v, i) => {
          const d = i + 1;
          const fut = d > todayDate;
          return (
            <i
              key={d}
              className={'cc' + (fut ? ' fut' : ' h' + lv(v)) + (d === todayDate ? ' today' : '')}
              title={`${month}월 ${d}일${v > 0 ? ` · ${v}${unit}` : ''}`}
            ></i>
          );
        })}
      </div>
    </div>
  );
}

function Hook({ hook }) {
  return (
    <p className="row-hook">
      {hook.title} <b>{hook.strong}</b>{hook.tail || ''}
    </p>
  );
}

/* 기록 1종 — 4행(라벨 · 값 · 진행막대 · 보조줄). 칸이 달라도 같은 baseline (subgrid). */
function Rec({ r }) {
  const g = r.goal;
  const value = g
    ? <>{g.cur}<span className={'goal-sep' + (g.proposed ? ' soft' : '')}> / {g.max}{g.unit}</span></>
    : r.v;
  return (
    <div className="rec">
      <span className="rec-lb">
        {r.lb}
        {g && g.proposed && <span className="rec-goal" title="주간 목표 제안값 — 아직 설정 전이에요">제안</span>}
        {r.pr > 0 && <span className="rec-pr" title="개인 기록">★ 신기록 {r.pr}</span>}
      </span>
      <span className="rec-v">{value}</span>
      <span className="rec-goalcell">
        {g && (
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

export default function AppRow({ app, due, open, onToggle, onStats, today }) {
  const done = app.done;
  const hook = done && app.hookDone ? app.hookDone : app.hook;
  const month = today.getMonth() + 1;
  const offset = (new Date(today.getFullYear(), today.getMonth(), 1).getDay() + 6) % 7; // 1일의 월요일 기준 칸
  const subClass = app.subGap ? 'gap-fact' : app.subStrong ? 'sub-strong' : '';
  const beat = app.beat || ['', '', ''];
  const launch = (e) => {
    e.preventDefault();
    e.stopPropagation();
    launchHabit({
      habit: app, demoMode: false, onDemo: () => {},
      open: (u, t, f) => window.open(u, t, f),
    });
  };
  return (
    <li className={'row' + (open ? ' is-open' : '') + (done ? ' is-done' : '') + (due && !done ? ' is-due' : '')}>
      <button className="row-head" onClick={onToggle} aria-expanded={open}>
        <Mark done={done} accent={due && !done} />
        <span className="row-name">{app.name}</span>
        <span className="row-mid">
          <Hook hook={hook} />
          <span className="row-sub"><span className={subClass}>{app.sub}</span></span>
        </span>
        <a className="cta" href={app.url || '#'} role="button" aria-disabled={!app.url} onClick={launch}>
          <i className="cta-ic"><AppIcon id={app.id} /></i>
          <span className="cta-lb">{done && app.ctaDone ? app.ctaDone : app.cta}</span>
          <GoIcon />
        </a>
        <Chev open={open} />
      </button>

      {open && (
        <div className="row-detail">
          <MonthCal days={app.cal} todayDate={today.getDate()} month={month} offset={offset} unit={app.calUnit} />
          <div className="recs">
            {app.records.map((r) => <Rec key={r.lb} r={r} />)}
          </div>
          <div className="beat">
            <span className="beat-txt">{beat[0]}<b>{beat[1]}</b>{beat[2]}</span>
            <a className="beat-more" href="#" onClick={(e) => { e.preventDefault(); onStats(); }}>전체 통계</a>
          </div>
        </div>
      )}
    </li>
  );
}
