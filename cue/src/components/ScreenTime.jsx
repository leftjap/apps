/* ScreenTime.jsx — 화면 시간 레일(화면 ①) + 전체 기록 모달(화면 ②).
   작업지시서(design_handoff_screentime) 정본 이식. 데이터·로직은 ../data/screentime.js.
   ⚠️ §3 절대 규칙: 게이지·스트릭·캡·격려·발명분류 없음 / 액센트(#D2602F)는 4활동 전용 —
   본 영역엔 웜뉴트럴+올리브만 / 강조는 "내 도구". 모든 숫자는 §8 placeholder(목업). */
import React, { useState } from 'react';
import { SCREENTIME_DATA, screenTimeView } from '../data/screentime.js';

const PERIODS = [['day', '일'], ['week', '주'], ['month', '월']];

/** 모니터 아이콘 (§4 헤더) */
function MonitorIcon({ size = 16, stroke = '#9C9079' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4.5" width="18" height="12" rx="1.5" />
      <path d="M9 20h6M12 16.5v3.5" />
    </svg>
  );
}

/** ↗ 화살표 (§4) */
function ArrowIcon({ size = 12, stroke = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 10.5L10.5 3.5M5.2 3.5h5.3v5.3" />
    </svg>
  );
}

/** 일/주/월 토글 */
function PeriodToggle({ period, onPick, variant }) {
  return (
    <span className={'st-seg' + (variant === 'modal' ? ' st-seg--modal' : '')}>
      {PERIODS.map(([k, label]) => (
        <button key={k} className={'st-seg-btn' + (period === k ? ' is-on' : '')} onClick={() => onPick(k)}>{label}</button>
      ))}
    </span>
  );
}

/** 랭킹 한 행 (§4·§5). idx = 막대 등장 스태거용. */
function RankRow({ row, idx }) {
  const ink = { color: row.nameColor, fontWeight: row.weight };
  return (
    <div className="st-row">
      <span className="st-row-dot">{row.isTool && <i className="st-dot" />}</span>
      <span className="st-row-name" style={ink}>{row.name}</span>
      <span className="st-row-bar">
        <i style={{ width: `${row.pct}%`, background: row.barColor, '--st-i': idx }} />
      </span>
      <span className="st-row-time" style={ink}>{row.time}</span>
    </div>
  );
}

/** 랭킹 섹션 (구분선 + 라벨 + 행들) */
function RankSection({ label, rows }) {
  return (
    <>
      <div className="st-div" />
      <div className="st-sec-label">{label}</div>
      {rows.map((row, i) => <RankRow key={row.name} row={row} idx={i} />)}
    </>
  );
}

/** 모달 랭킹 한 행 (§4 우측 — 이름 위, 막대 아래 스택) */
function ModalRankRow({ row, idx }) {
  const ink = { color: row.nameColor, fontWeight: row.weight };
  return (
    <div className="st-mrow">
      <span className="st-row-dot">{row.isTool && <i className="st-dot" />}</span>
      <span className="st-mrow-body">
        <span className="st-mrow-name" style={ink}>{row.name}</span>
        <span className="st-row-bar"><i style={{ width: `${row.pct}%`, background: row.barColor, '--st-i': idx }} /></span>
      </span>
      <span className="st-row-time" style={ink}>{row.time}</span>
    </div>
  );
}

/** 모달 우측 랭킹 컬럼 (전체 목록 — 기타 포함) */
function ModalRankCol({ label, rows }) {
  return (
    <div>
      <div className="st-sec-label">{label}</div>
      {rows.map((row, i) => <ModalRankRow key={row.name} row={row} idx={i} />)}
    </div>
  );
}

/** 전체 기록 상세 모달 (화면 ②). period 는 레일과 공유 상태. 라벨은 일반형 고정(§4). */
function DetailModal({ v, period, onPick, onClose, isMock }) {
  return (
    <div className="st-scrim" onClick={onClose}>
      <div className="st-card" onClick={(e) => e.stopPropagation()}>
        <div className="st-card-hd">
          <MonitorIcon size={18} stroke="#8a8676" />
          <span className="st-card-title">화면 시간 · 전체 기록</span>
          {isMock && <span className="st-flag">확인 필요 · 목업</span>}
          <PeriodToggle period={period} onPick={onPick} variant="modal" />
          <button className="st-close" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        <div className="st-modal-body">
          <div>
            <div className="st-mhero-label"><i className="st-dot st-dot--lg" />내 도구로 보낸 시간</div>
            <div className="st-mhero">
              <div className="st-mhero-num">{v.toolTotal}</div>
              <span className="st-mhero-delta">{v.toolDelta}</span>
            </div>
            <div className="st-mpct"><i style={{ width: v.toolPct }} /></div>
            <div className="st-mctx">
              <span>전체 화면 시간 <b>{v.total}</b> 중 {v.toolShare} · {v.totalDelta}</span>
              <span className="st-mctx-other">그 외 {v.otherTotal}</span>
            </div>
            <div className="st-breakdown">
              <span><i className="st-dot" />독서 {v.bkRead}</span>
              <span><i className="st-dot" />글쓰기·어학 {v.bkWeb}</span>
            </div>
            <div className="st-trend">
              {v.trend.map((t, i) => (
                <span key={i} className="st-trend-col">
                  <i className="st-trend-other" style={{ height: `${t.otherH}px` }} />
                  <i className="st-trend-tool" style={{ height: `${t.toolH}px` }} />
                </span>
              ))}
            </div>
            <div className="st-legend">
              <span><i className="st-sq st-sq--tool" />내 도구</span>
              <span><i className="st-sq st-sq--other" />그 외</span>
              <span className="st-legend-axis">{v.axisStart} → {v.axisEnd}</span>
            </div>
            <p className="st-note">올리브 = 큐가 식별 가능한 자기 도구(독서=밀리의 서재 · 글쓰기·어학=leftjap.github.io). 그 외는 판단 없이 시간순. 운동(iPhone)은 데스크톱 화면시간에 포함되지 않아요.</p>
          </div>
          <div className="st-mcols">
            <ModalRankCol label="앱 · 전체" rows={v.apps} />
            <ModalRankCol label="크롬 사이트 · 전체" rows={v.sites} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ScreenTime({ data }) {
  const [period, setPeriod] = useState('day');
  const [detailOpen, setDetailOpen] = useState(false);
  const isMock = !data; // 실데이터(screentime_daily) 없으면 시안 목업 폴백 + "확인 필요·목업" 플래그
  const v = screenTimeView(data || SCREENTIME_DATA, period);

  return (
    <aside className="st-rail" data-screen-label="화면시간 레일">
      <div className="st-rail-hd">
        <MonitorIcon />
        <span className="st-title">화면 시간</span>
        <PeriodToggle period={period} onPick={setPeriod} />
      </div>

      {/* 글랜스: 내 도구를 히어로로, 총합은 맥락 */}
      <div className="st-glance-label"><i className="st-dot st-dot--lg" />{v.toolLabel}</div>
      <div className="st-hero">
        <div className="st-hero-num">{v.toolTotal}</div>
        <span className="st-hero-delta">{v.toolDelta}</span>
      </div>
      <div className="st-pct">
        <i style={{ width: v.toolPct }} />
      </div>
      <div className="st-ctx">
        <span>전체 화면 시간 <b>{v.total}</b> 중 {v.toolShare}</span>
        <span className="st-ctx-delta">{v.totalDelta}</span>
      </div>

      <RankSection label="앱" rows={v.railApps} />
      <RankSection label="크롬 사이트" rows={v.railSites} />

      <div className="st-div" />
      <button className="st-detail-btn" onClick={() => setDetailOpen(true)}>
        전체 기록 보기
        <ArrowIcon />
      </button>

      {detailOpen && (
        <DetailModal v={v} period={period} onPick={setPeriod} onClose={() => setDetailOpen(false)} isMock={isMock} />
      )}
    </aside>
  );
}
