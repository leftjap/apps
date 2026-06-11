/* Hero.jsx — v8 시계·하루 고리·오늘 흐름 (시안 app.jsx 78~152행 이식).
   plumbing 변경: useNow → 부모 useClock(데모 시각 QA), FLOW 목업 → apps 파생,
   due 클래스 = dueId(§6 단일 소스), 보통 시각 밀집 시 staggerLane 행 내림(QA §11-2 —
   실데이터 보통 시각이 저녁에 몰려 시안 고정 레이아웃으로는 라벨이 겹침). */
import React from 'react';
import { Mark } from './icons.jsx';
import { staggerLane } from '../data/flow.js';
import { p2 } from '../data/transforms.js';

const T0 = 6, T1 = 24;
const px = (h) => ((Math.min(Math.max(h, T0), T1) - T0) / (T1 - T0)) * 100;
const ROW_H = 34; // 겹침 회피 행 간격(px) — 마크+이름+메타 한 줄 높이

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
  const stops = staggerLane(apps.map((a) => ({
    id: a.id, name: a.name, done: a.done, tlMeta: a.tlMeta,
    pos: px((a.done && a.atMin != null ? a.atMin : a.usualMin) / 60),
  })), 11);
  const maxRow = Math.max(0, ...stops.map((s) => s.row));

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
        <div className="flow-rail" style={{ height: 150 + maxRow * ROW_H }}>
          <div className="flow-now" style={{ left: px(dec) + '%' }}>
            <span className="flow-now-pill">지금 <b>{p2(h)}:{p2(m)}</b></span>
            <i className="flow-now-line"></i>
            <i className="flow-now-dot"></i>
          </div>
          <div className="flow-axis">
            <i className="flow-axis-fill" style={{ width: px(dec) + '%' }}></i>
          </div>
          {stops.map((a) => (
            <div
              key={a.id}
              className={'flow-item' + (a.done ? ' done' : '') + (a.id === dueId ? ' due' : '')}
              style={{ left: a.pos + '%', top: 90 + a.row * ROW_H }}
            >
              <Mark done={a.done} size={14} />
              <span className="flow-name">{a.name}</span>
              {a.done && a.tlMeta && <span className="flow-meta">{a.tlMeta}</span>}
            </div>
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
