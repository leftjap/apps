/* d1/sessionShell.js — desktop redesign session sidebar (.d1-side) + stepper.
 * Shared by session screens ②다이얼로그 ③신규 ④복습 ⑤수학 (desktop only).
 * Ported from handoff dt1.jsx D1Side. Phone/tablet keep using SessionLayout.js.
 */
import { h } from './dom.js';
import { d1Icon } from './icons.js';

/* 2-step stepper shown in the scene (dialogue) phase. active: 1 | 2 */
export function d1Steps(active) {
  return h('div', { class: 'd1-steps' },
    h('div', { class: 'd1-stepi' + (active === 1 ? ' on' : active > 1 ? ' done' : '') },
      h('div', { class: 'd1-stepn' }, active > 1 ? '✓' : '1'),
      h('div', { class: 'd1-steptx' }, '전체 대화 듣기'),
    ),
    h('div', { class: 'd1-stepline' }),
    h('div', { class: 'd1-stepi' + (active === 2 ? ' on' : '') },
      h('div', { class: 'd1-stepn' }, '2'),
      h('div', { class: 'd1-steptx' }, '표현별 학습'),
    ),
  );
}

/* Session sidebar. Returns { el, timeEl } — timeEl for per-second timer updates.
 * opts:
 *   mode: 'scene' | 'new' | 'review' | 'math'
 *   subjLabel: '영어' | '일본어' | '수학'
 *   timer: '00:00'
 *   scene, sceneMeta            (scene mode)
 *   idx, total, items[{n,t}], showListenedBadge   (new/review/math)
 * handlers: onHome, onEnd, onJump(n)
 */
export function buildD1Side(opts = {}) {
  const { mode, subjLabel = '', onHome, onEnd, onJump } = opts;
  const timeEl = h('span', { class: 'tm' }, opts.timer || '');
  const homeBtn = h('button', { class: 'd1-topbtn', onClick: onHome }, d1Icon('home', 17), '홈으로');
  const foot = h('div', { class: 'd1-foot' },
    timeEl,
    h('button', { class: 'd1-endbtn', onClick: onEnd }, d1Icon('close', 13), '세션 종료'),
  );

  if (mode === 'scene') {
    const el = h('div', { class: 'd1-side' },
      homeBtn,
      h('div', { style: 'margin-top:28px;' },
        h('div', { class: 'd1-lab', style: 'color:var(--terra);' }, subjLabel + ' · 신규 학습'),
        h('div', { style: 'font-size:20px;font-weight:800;letter-spacing:-0.02em;margin-top:12px;line-height:1.28;' }, opts.scene || ''),
        opts.sceneMeta ? h('div', { style: 'font-size:13px;color:var(--mut);margin-top:8px;' }, opts.sceneMeta) : null,
      ),
      h('div', { style: 'margin-top:34px;' }, d1Steps(1)),
      h('div', { style: 'flex:1;' }),
      foot,
    );
    return { el, timeEl };
  }

  // new | review | math — 연속 진행바 + 스크롤 내비
  const isR = mode === 'review';
  const accent = isR ? 'var(--sage)' : 'var(--terra)';
  const total = Number(opts.total) || 0;
  const idx = Number(opts.idx) || 0;
  const pct = total ? Math.round((idx / total) * 100) : 0;
  const navhead = isR ? '복습 대기열' : mode === 'math' ? '문제 목록' : '표현 목록';
  const items = opts.items || [];

  const nav = h('div', { class: 'd1-nav' },
    items.map((it) => {
      const done = it.n < idx, cur = it.n === idx;
      return h('button', {
        class: 'd1-navi' + (cur ? ' cur' : '') + (done ? ' done' : ''),
        style: cur ? ('background:' + (isR ? 'var(--sage-bg)' : 'var(--terra-bg)') + ';') : null,
        onClick: onJump ? () => onJump(it.n) : null,
      },
        h('span', { class: 'n', style: cur ? ('color:' + accent + ';') : null }, String(it.n)),
        h('span', { class: 't' }, it.t),
        done ? h('span', { class: 'ck' }, '✓') : null,
      );
    }),
  );

  const el = h('div', { class: 'd1-side' },
    homeBtn,
    h('div', { style: 'margin-top:26px;' },
      h('div', { class: 'd1-lab', style: 'color:' + accent + ';' }, subjLabel + ' · ' + (isR ? '복습' : '신규 학습')),
      opts.showListenedBadge
        ? h('div', { style: 'font-size:12.5px;color:var(--mut);margin-top:8px;display:inline-flex;align-items:center;gap:6px;' },
            h('span', { style: 'color:var(--sage);font-weight:800;' }, '✓'), '전체 대화 듣기 완료')
        : null,
      h('div', { style: 'display:flex;align-items:baseline;gap:5px;margin-top:12px;' },
        h('span', { style: 'font-size:38px;font-weight:800;letter-spacing:-0.03em;' }, String(idx)),
        h('span', { style: 'font-size:20px;font-weight:700;color:var(--faint);' }, '/ ' + total),
        h('span', { style: 'margin-left:auto;font-size:12.5px;font-weight:600;color:var(--faint);white-space:nowrap;' }, Math.max(0, total - idx) + '개 남음'),
      ),
      h('div', { class: 'd1-track', style: 'margin-top:12px;' }, h('i', { style: 'width:' + pct + '%;background:' + accent + ';' })),
    ),
    h('div', { class: 'd1-navhead', style: 'margin-top:24px;' }, navhead),
    nav,
    foot,
  );
  return { el, timeEl };
}
