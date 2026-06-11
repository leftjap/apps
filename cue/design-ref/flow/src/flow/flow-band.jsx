/* flow-band.jsx — '오늘 흐름' 새 안 두 가지.
   A안: 대형 라이브 시계 + 2레인 타임라인 (선 위 = 오늘 실제 기록 / 선 아래 = 미실행 고스트)
   B안: 카운트다운형 (거대 시계 + 시간 블록 소진 + 습관 칩) */

const { fmt, p2, remainLabel } = window.CUE;

/* 같은 레인 안에서 라벨이 겹치면 줄을 내려 배치 (결정론적 충돌 회피) */
function staggerLane(stops, minGap = 19) {
  const rows = [-Infinity, -Infinity, -Infinity];
  return stops
    .slice()
    .sort((a, b) => a.pos - b.pos)
    .map((s) => {
      let r = 0;
      while (r < 2 && s.pos - rows[r] < minGap) r++;
      rows[r] = s.pos;
      return { ...s, row: r };
    });
}

/* 미실행 중 "다음" — 밀린 것(평소 시각 지남) 우선, 없으면 가장 가까운 예정 */
function nextOf(pend, nowMin) {
  const due = pend.filter((p) => p.h.usualMin <= nowMin).sort((a, b) => a.h.usualMin - b.h.usualMin);
  const up = pend.filter((p) => p.h.usualMin > nowMin).sort((a, b) => a.h.usualMin - b.h.usualMin);
  return (due[0] || up[0] || { h: {} }).h.id || null;
}

function ClockDigits({ h, m, sec, showSec, big }) {
  return (
    <div className={big ? "bandB__clock" : "clock__time"} role="timer" aria-label={`현재 시각 ${p2(h)}시 ${p2(m)}분`}>
      <span>{p2(h)}</span><span className="colon">:</span><span>{p2(m)}</span>
      {showSec ? <span className="sec">{p2(sec)}</span> : null}
    </div>
  );
}

function FlowBandA({ habits, stateKeys, clock, showSec, startHour, nextId, onCycle }) {
  const nowMin = clock.min;
  const s = startHour * 60, span = 1440 - s;
  const posOf = (min) => Math.max(1.5, Math.min(98.5, ((min - s) / span) * 100));
  const sts = habits.map((h, i) => ({ h, st: h.states[stateKeys[i]] }));

  const upRaw = sts
    .filter((x) => x.st.kind === "done" || x.st.kind === "progress")
    .map((x) => x.st.kind === "progress"
      ? { ...x, live: true, pos: posOf(nowMin), tm: "지금" }
      : { ...x, pos: posOf(x.st.atMin), tm: fmt(x.st.atMin) });
  const pendRaw = sts
    .filter((x) => x.st.kind === "none")
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
            ? <>오늘 아직 <b>{pendingNames.join(" · ")}</b></>
            : <b>오늘 다 했어요 ✓</b>}
        </span>
      </div>
      <div className="band__body">
        <div className="clock">
          <ClockDigits h={clock.h} m={clock.m} sec={clock.sec} showSec={showSec} />
          {pendingNames.length
            ? <div className={`clock__remain${urgent ? " urgent" : ""}`}>오늘이 <b>{remainLabel(nowMin)}</b> 남았다</div>
            : <div className="clock__alldone"><b>오늘 다 했어요</b> — 남은 시간은 덤</div>}
          <div className="clock__pct">하루의 {pct}% 경과</div>
        </div>
        <div className="tl" style={{ "--axis": "88px" }}>
          {ticks.map((t) => (
            <React.Fragment key={t}>
              <span className="tl__tick" style={{ left: `${posOf(t * 60)}%` }} />
              <span className="tl__ticklab" style={{ left: `${posOf(t * 60)}%` }}>{p2(t % 24 === 0 && t === 24 ? 24 : t)}</span>
            </React.Fragment>
          ))}
          <div className="tl__line" />
          <div className="tl__elapsed" style={{ width: `${nowPos}%` }} />

          {/* 점 — 좌표는 전부 축 위 한 줄: 오늘 기록(채움) vs 미실행 고스트(점선) */}
          {upRaw.map((x) => (
            <span key={x.h.id} className={`tl__pt ${x.live ? "live" : "done"}`} style={{ left: `${x.pos}%` }} />
          ))}
          {pendRaw.map((x) => (
            <span key={x.h.id} className={`tl__pt ghost${x.due ? " due" : ""}`} style={{ left: `${x.pos}%` }} />
          ))}

          {/* 위 레인 캡션 — 오늘 실제 기록 */}
          {up.map((x) => (
            <button key={x.h.id} className="tl__cap up" onClick={() => onCycle(x.h.id)} aria-label={`${x.h.ko} — 오늘 ${x.live ? "진행 중" : x.tm}`}
              style={{ left: `${Math.max(4, Math.min(94, x.pos))}%`, transform: `translate(-50%, ${-x.row * 30}px)` }}>
              <span className="ko">{x.h.ko}</span>
              <span className="tm">{x.live ? "지금" : x.tm}</span>
              {!x.live && x.st.amount ? <span className="sub">{x.st.amount}</span> : null}
            </button>
          ))}

          {/* 아래 레인 캡션 — 미실행 (평소 시간대 + 직전 기록) */}
          {dn.map((x) => (
            <button key={x.h.id} className={`tl__cap dn${x.due ? " due" : ""}`} onClick={() => onCycle(x.h.id)} aria-label={`${x.h.ko} — 오늘 아직, 마지막 ${x.h.last}`}
              style={{ left: `${Math.max(4, Math.min(93, x.pos))}%`, transform: `translate(-50%, ${x.row * 34}px)` }}>
              <span className="ko">{x.h.ko}{x.h.id === nextId ? <span className="tl__nexttag">다음</span> : null}</span>
              <span className="tm">보통 {fmt(x.h.usualMin)}</span>
              <span className="sub">마지막 {x.h.last}</span>
            </button>
          ))}

          <div className="tl__now" style={{ left: `${nowPos}%` }}>
            <span className="tl__nowlab">지금 {p2(clock.h)}:{p2(clock.m)}</span>
            <span className="tl__nowhead" style={{ top: "calc(var(--axis) - 12px)" }} />
          </div>
        </div>
      </div>
    </section>
  );
}

function FlowBandB({ habits, stateKeys, clock, showSec, startHour, nextId, onCycle }) {
  const nowMin = clock.min;
  const sts = habits.map((h, i) => ({ h, st: h.states[stateKeys[i]] }));
  const pend = sts.filter((x) => x.st.kind === "none").sort((a, b) => a.h.usualMin - b.h.usualMin);
  const pendingNames = pend.map((x) => x.h.ko);

  const cells = [];
  for (let h = startHour; h < 24; h++) {
    const endMin = (h + 1) * 60;
    const past = nowMin >= endMin;
    const cur = !past && nowMin >= h * 60;
    cells.push({ h, past, cur, fill: cur ? `${Math.round(((nowMin - h * 60) / 60) * 100)}%` : null });
  }
  const labs = [];
  for (let t = startHour; t <= 24; t += 6) labs.push(t);

  const chips = sts.slice().sort((a, b) => a.h.usualMin - b.h.usualMin);
  const urgent = pendingNames.length > 0 && 1440 - nowMin <= 240;

  return (
    <section className="bandB" aria-label="오늘 흐름">
      <ClockDigits big h={clock.h} m={clock.m} sec={clock.sec} showSec={showSec} />
      <div className="hours" aria-hidden="true">
        {cells.map((c) => (
          <span key={c.h} className={`hourcell${c.past ? " past" : ""}${c.cur ? " cur" : ""}`}>
            {c.cur ? <span className="fill" style={{ "--w": c.fill }} /> : null}
          </span>
        ))}
      </div>
      <div className="hours__labs" aria-hidden="true">
        {labs.map((t) => <span key={t}>{p2(t === 24 ? 24 : t)}</span>)}
      </div>
      <div className={`bandB__remain${urgent ? " urgent" : ""}`}>
        {pendingNames.length
          ? <>오늘이 <b>{remainLabel(nowMin)}</b> 남았다 — 아직 <span className="names">{pendingNames.join(" · ")}</span></>
          : <><span className="names">오늘 다 했어요</span> — 남은 시간은 덤</>}
      </div>
      <div className="chips">
        {chips.map((x) => {
          const k = x.st.kind;
          const cyc = () => onCycle(x.h.id);
          if (k === "done") return (
            <button key={x.h.id} className="chip done" onClick={cyc}>
              <span className="chk">✓</span>{x.h.ko}
              <span className="tm">{fmt(x.st.atMin)}{x.st.amount ? ` · ${x.st.amount}` : ""}</span>
            </button>
          );
          if (k === "progress") return (
            <button key={x.h.id} className="chip live" onClick={cyc}><span className="led" />{x.h.ko} 중</button>
          );
          return (
            <button key={x.h.id} className={`chip${x.h.id === nextId ? " next" : ""}`} onClick={cyc}>
              {x.h.id === nextId ? <span className="nx">다음</span> : null}
              {x.h.ko}<span className="tm">마지막 {x.h.last}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

Object.assign(window, { FlowBandA, FlowBandB, nextOf });
