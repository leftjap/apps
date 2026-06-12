/* Hero.jsx — v8 시계·하루 고리·오늘 흐름 (시안 app.jsx Hero 이식).
   plumbing 변경: useNow → 부모 useClock(데모 시각 QA), FLOW 목업 → apps 파생,
   due 클래스 = dueId(§6 단일 소스). 시간대 몰림은 점·라벨 분리 + 클러스터 묶음
   캡슐(§3.3 — 점 간격 60px 이하 묶음, 실측 폭 스윕·클램프, ResizeObserver 재계산.
   라벨 세로 쌓기·사선 연결선 금지). */
import React, { useState, useRef, useMemo, useLayoutEffect } from 'react';
import { Mark } from './icons.jsx';
import { clusterPoints, sweepLefts } from '../data/flow.js';
import { p2 } from '../data/transforms.js';

const T0 = 6, T1 = 24;
const px = (h) => ((Math.min(Math.max(h, T0), T1) - T0) / (T1 - T0)) * 100;

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

export default function Hero({ clock, showSec, apps, dueId }) {
  const { h, m, sec } = clock;
  const dec = clock.min / 60;
  const remainMin = 24 * 60 - (h * 60 + m);
  const rh = Math.floor(remainMin / 60), rm = remainMin % 60;
  const pct = Math.round(((h * 60 + m) / 1440) * 100);
  const doneCount = apps.filter((a) => a.done).length;

  // 위치: 완료 = 실제 기록 시각(atMin), 미완료 = 보통 시각(usualMin)
  const stops = apps.map((a) => ({
    id: a.id, name: a.name, done: a.done, tlMeta: a.tlMeta,
    pos: px((a.done && a.atMin != null ? a.atMin : a.usualMin) / 60),
  }));

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

  const clusters = useMemo(
    () => (W ? clusterPoints(stops.map((s) => ({ ...s, x: (s.pos / 100) * W }))) : []),
    [W, apps],
  );

  // 클러스터 라벨 폭을 실측해 좌우 스윕 + 클램프
  useLayoutEffect(() => {
    if (!W || clusters.length === 0) return;
    const ws = clusters.map((c) => (groupRefs.current[c.key] ? groupRefs.current[c.key].offsetWidth : 60));
    const lefts = sweepLefts(clusters.map((c) => c.cx), ws, W);
    setLay({
      lefts: Object.fromEntries(clusters.map((c, i) => [c.key, lefts[i]])),
      stems: clusters.map((c, i) => Math.min(Math.max(c.cx, lefts[i] + 16), lefts[i] + ws[i] - 16)),
    });
  }, [W, clusters]);

  return (
    <section className="hero" data-screen-label="오늘 흐름">
      <div className="hero-clock">
        <div className="clock-row">
          <div>
            <div className="clock">
              <b>{p2(h)}<i>:</i>{p2(m)}</b>
              {showSec && <em>{p2(sec)}</em>}
            </div>
            <p className="clock-remain">오늘이 <b>{rh}시간 {p2(rm)}분</b> 남았어요</p>
            <p className="clock-pct">하루의 <b>{pct}%</b>가 지나갔어요</p>
          </div>
          <DayRing done={doneCount} total={apps.length} />
        </div>
      </div>
      <div className="flow">
        <div className="flow-rail" ref={railRef}>
          <div className="flow-now" style={{ left: px(dec) + '%' }}>
            <span className="flow-now-pill">지금 <b>{p2(h)}:{p2(m)}</b></span>
            <i className="flow-now-line"></i>
            <i className="flow-now-dot"></i>
          </div>
          <div className="flow-axis">
            <i className="flow-axis-fill" style={{ width: px(dec) + '%' }}></i>
          </div>
          {stops.map((a) => (
            <i
              key={a.id}
              className={'flow-pt' + (a.done ? ' done' : '') + (a.id === dueId ? ' due' : '')}
              style={{ left: a.pos + '%' }}
            ></i>
          ))}
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
                  const due = a.id === dueId;
                  return (
                    <span key={a.id} className={'fg-item' + (a.done ? ' done' : '') + (due ? ' due' : '')}>
                      <Mark done={a.done} size={13} accent={due} />{a.name}
                    </span>
                  );
                })}
              </span>
              {c.items.length === 1 && c.items[0].done && c.items[0].tlMeta && (
                <span className="flow-meta">{c.items[0].tlMeta}</span>
              )}
            </div>
          ))}
          {[6, 9, 12, 15, 18, 21, 24].map((hh) => (
            <i key={'t' + hh} className="flow-tick" style={{ left: px(hh) + '%' }}></i>
          ))}
          <div className="flow-hours">
            {[6, 9, 12, 15, 18, 21, 24].map((hh) => (
              <span key={hh} style={{ left: px(hh) + '%' }}>{p2(hh)}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
