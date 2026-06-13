/* StatsView.jsx — v9 전체 통계 (작업지시서 §4). 카드에서 뺀 연간 누적·최장·페이스를 모음.
   앱별: 아이콘+이름+연간 요약 / 올해 페이스(raw 누적 대신 목표 대비) /
   8주 빈도 막대(주별 활동 일수, 이번 주만 포인트색) / 기록 3종(statRecords). ESC 닫기(§10). */
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
        <span className="stats-range">최근 8주 · 주별 활동 일수</span>
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
              {app.pace && (
                <div className="stat-pace">
                  <b>{app.pace.now}</b>
                  <span className="pace-goal">· {app.pace.goal}</span>
                </div>
              )}
              <div className="stat-bars">
                {app.weekly8.map((v, i) => (
                  <span key={i} className={'sb' + (i === 7 ? ' this' : '') + (v === 0 ? ' zero' : '')}>
                    <i style={{ height: Math.max((v / max) * 60, 2) + 'px' }} title={`${v}일`}></i>
                  </span>
                ))}
              </div>
              <div className="stat-axis"><span>8주 전</span><span>이번 주</span></div>
              <div className="stat-recs">
                {(app.statRecords || []).map((r) => (
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
