/* icons.jsx — v8 시안(design-ref/v8/시안-소스/app.jsx 26~76행) verbatim 이식.
   AppIcon(활동 아이콘) · GoIcon(↗) · Chev(펼침 화살표) · Mark(닫힌 원/열린 고리) */
import React from 'react';

const ICONS = {
  read: <path d="M8 3.4v9.2M2.8 3.8c1.8-1 3.6-1 5.2 0 1.6-1 3.4-1 5.2 0v8.4c-1.8-.8-3.6-.8-5.2.2-1.6-1-3.4-1-5.2-.2z" />,
  write: <path d="M3 13l1-3.5L11.5 2 14 4.5 6.5 12 3 13zM9.8 3.7l2.5 2.5" />,
  lang: <path d="M2.8 3h10.4v7.2H8.2l-3 2.8v-2.8H2.8zM5.6 6.6h4.8" />,
  gym: <path d="M4.6 5v6M11.4 5v6M2.5 6.4v3.2M13.5 6.4v3.2M4.6 8h6.8" />,
};

export function AppIcon({ id }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[id]}
    </svg>
  );
}

export function GoIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 10.5L10.5 3.5M5.2 3.5h5.3v5.3" />
    </svg>
  );
}

export function Chev({ open }) {
  return (
    <svg className={'chev' + (open ? ' open' : '')} width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

/* 마크: 닫힌 원(완료) / 76% 열린 고리(미완료) */
export function Mark({ done, size = 18, accent }) {
  const r = (size - 5) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg className={'mark' + (accent ? ' accent' : '')} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {done ? (
        <>
          <circle cx={size / 2} cy={size / 2} r={r + 1.2} className="mark-fill" />
          <path d={`M${size * 0.3} ${size * 0.53} l${size * 0.13} ${size * 0.14} l${size * 0.28} ${size * -0.3}`} className="mark-chk" />
        </>
      ) : (
        <circle
          cx={size / 2} cy={size / 2} r={r}
          className="mark-ring"
          strokeDasharray={`${c * 0.76} ${c}`}
          transform={`rotate(-54 ${size / 2} ${size / 2})`}
        />
      )}
    </svg>
  );
}
