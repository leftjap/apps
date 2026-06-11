/* StatsView.jsx — v8 전체 통계 (시안 app.jsx 232~275행 이식).
   plumbing 변경: window.CUE8 전역 → apps prop. ESC 닫기 유지(§10). */
import React, { useEffect } from 'react';
import { AppIcon } from './icons.jsx';

export default function StatsView({ apps, onClose }) {
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
        {apps.map((app) => {
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
