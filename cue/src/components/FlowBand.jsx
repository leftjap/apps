/* FlowBand.jsx — '오늘 흐름' 시간 밴드 (flow 작업지시서 §3 A안). 시안
   design-ref/flow/src/flow/flow-band.jsx 의 FlowBandA 이식 — DOM/클래스 verbatim, ES module·props 화.
   2레인: 선 위 = 오늘 실제 기록(atMin, 채운 점) / 선 아래 = 미실행 고스트(usualMin, 점선 점).
   캡션 탭 = 문 — 도어와 동일하게 launchHabit (데모: 상태 순환 / 운동 url 없음: 무동작). */
import React, { Fragment } from 'react';
import { p2 } from '../data/transforms.js';
import { fmt, remainLabel, staggerLane } from '../data/flow.js';
import { launchHabit } from '../data/launch.js';

function ClockDigits({ h, m, sec, showSec }) {
  return (
    <div className="clock__time" role="timer" aria-label={`현재 시각 ${p2(h)}시 ${p2(m)}분`}>
      <span>{p2(h)}</span><span className="colon">:</span><span>{p2(m)}</span>
      {showSec ? <span className="sec">{p2(sec)}</span> : null}
    </div>
  );
}

export default function FlowBand({ habits, stateKeys, clock, showSec, startHour, nextId, demoMode, onDemo }) {
  const nowMin = clock.min;
  const s = startHour * 60, span = 1440 - s;
  const posOf = (min) => Math.max(1.5, Math.min(98.5, ((min - s) / span) * 100));
  const sts = habits.map((h, i) => ({ h, st: h.states[stateKeys[i]] }));

  const tap = (h) => launchHabit({
    habit: h, demoMode, onDemo: () => onDemo(h.id),
    open: (url, target, feat) => window.open(url, target, feat),
  });

  const upRaw = sts
    .filter((x) => x.st.kind === 'done' || x.st.kind === 'progress')
    .map((x) => x.st.kind === 'progress'
      ? { ...x, live: true, pos: posOf(nowMin), tm: '지금' }
      : { ...x, pos: posOf(x.st.atMin), tm: fmt(x.st.atMin) });
  const pendRaw = sts
    .filter((x) => x.st.kind === 'none')
    .map((x) => ({ ...x, pos: posOf(x.h.usualMin), due: x.h.usualMin <= nowMin }));

  const up = staggerLane(upRaw);
  const dn = staggerLane(pendRaw);
  const pendingNames = pendRaw.slice().sort((a, b) => a.h.usualMin - b.h.usualMin).map((x) => x.h.ko);

  const ticks = [];
  for (let t = startHour; t <= 24; t += 3) ticks.push(t);

  const nowPos = posOf(nowMin);
  const pct = Math.round((nowMin / 1440) * 100);

  const urgent = pendingNames.length > 0 && 1440 - nowMin <= 240; // 잔여 ≤ 4시간이면 숨쉬기 펄스
  return (
    <section className="band" aria-label="오늘 흐름">
      <div className="band__head">
        <span className="band__title">오늘 흐름</span>
        <span className="band__pending">
          {pendingNames.length
            ? <>오늘 아직 <b>{pendingNames.join(' · ')}</b></>
            : <b>오늘 다 했어요 ✓</b>}
        </span>
      </div>
      <div className="band__body">
        <div className="clock">
          <ClockDigits h={clock.h} m={clock.m} sec={clock.sec} showSec={showSec} />
          {pendingNames.length
            ? <div className={`clock__remain${urgent ? ' urgent' : ''}`}>오늘이 <b>{remainLabel(nowMin)}</b> 남았다</div>
            : <div className="clock__alldone"><b>오늘 다 했어요</b> — 남은 시간은 덤</div>}
          <div className="clock__pct">하루의 {pct}% 경과</div>
        </div>
        <div className="tl" style={{ '--axis': '88px' }}>
          {ticks.map((t) => (
            <Fragment key={t}>
              <span className="tl__tick" style={{ left: `${posOf(t * 60)}%` }} />
              <span className="tl__ticklab" style={{ left: `${posOf(t * 60)}%` }}>{p2(t)}</span>
            </Fragment>
          ))}
          <div className="tl__line" />
          <div className="tl__elapsed" style={{ width: `${nowPos}%` }} />

          {/* 점 — 좌표는 전부 축 위 한 줄: 오늘 기록(채움) vs 미실행 고스트(점선) */}
          {upRaw.map((x) => (
            <span key={x.h.id} className={`tl__pt ${x.live ? 'live' : 'done'}`} style={{ left: `${x.pos}%` }} />
          ))}
          {pendRaw.map((x) => (
            <span key={x.h.id} className={`tl__pt ghost${x.due ? ' due' : ''}`} style={{ left: `${x.pos}%` }} />
          ))}

          {/* 위 레인 캡션 — 오늘 실제 기록 */}
          {up.map((x) => (
            <button key={x.h.id} className="tl__cap up" onClick={() => tap(x.h)} aria-label={`${x.h.ko} — 오늘 ${x.live ? '진행 중' : x.tm}`}
              style={{ left: `${Math.max(4, Math.min(94, x.pos))}%`, transform: `translate(-50%, ${-x.row * 30}px)` }}>
              <span className="ko">{x.h.ko}</span>
              <span className="tm">{x.live ? '지금' : x.tm}</span>
              {!x.live && x.st.amount ? <span className="sub">{x.st.amount}</span> : null}
            </button>
          ))}

          {/* 아래 레인 캡션 — 미실행 (평소 시간대 + 직전 기록) */}
          {dn.map((x) => (
            <button key={x.h.id} className={`tl__cap dn${x.due ? ' due' : ''}`} onClick={() => tap(x.h)} aria-label={`${x.h.ko} — 오늘 아직, 마지막 ${x.h.last}`}
              style={{ left: `${Math.max(4, Math.min(93, x.pos))}%`, transform: `translate(-50%, ${x.row * 34}px)` }}>
              <span className="ko">{x.h.ko}{x.h.id === nextId ? <span className="tl__nexttag">다음</span> : null}</span>
              <span className="tm">보통 {fmt(x.h.usualMin)}</span>
              <span className="sub">마지막 {x.h.last}</span>
            </button>
          ))}

          <div className="tl__now" style={{ left: `${nowPos}%` }}>
            <span className="tl__nowlab">지금 {p2(clock.h)}:{p2(clock.m)}</span>
            <span className="tl__nowhead" style={{ top: 'calc(var(--axis) - 12px)' }} />
          </div>
        </div>
      </div>
    </section>
  );
}
