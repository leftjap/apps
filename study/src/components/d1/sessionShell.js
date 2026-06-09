/* d1/sessionShell.js — desktop redesign session sidebar (.d1-side) + stepper.
 * Shared by session screens ②다이얼로그 ③신규 ④복습 ⑤수학 (desktop only).
 * Ported from handoff dt1.jsx D1Side. Phone/tablet keep using SessionLayout.js.
 */
import { h } from './dom.js';
import { d1Icon } from './icons.js';
import { hiFragment } from './shared.js';
import { startMicRecording, stopAndAnalyze } from '../../services/sessionAnalyze.js';
import { recordErrorMessage, showRecordToast } from '../session/recordToast.js';
import { savePronunciationLog } from '../../services/pronunciationLog.js';
import { applyWeakPhonemesUpdate } from '../../services/weakPhonemes.js';

const PASS_THRESHOLD = 80;
function getTodayISO() { return window.studyDay?.TODAY_ISO || new Date().toISOString().slice(0, 10); }

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
  const homeBtn = h('button', { class: 'd1-topbtn', onClick: onHome }, d1Icon('home', 17), opts.homeLabel || '홈으로');
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

/* ── 표현 추출 (explanation.key 의 "표현 = 뜻" 에서 표현 부분) ── */
export function exprOf(card) {
  return String(card?.explanation?.key || '').split('=')[0].replace(/\([^)]*\)/g, '').trim();
}

function d1Section(label, text) {
  return h('div', {},
    h('div', { class: 'd1-panel-lab' }, label),
    h('div', { style: 'font-size:15px;line-height:1.55;' }, text),
  );
}

/* 변주 드릴 행들 — 각 행 [표현(하이라이트)·뜻 · 듣기 chip · 녹음 chip]. 녹음은 services 재사용. */
export function buildD1DrillRows(drills, hl, lang) {
  const ttsLang = lang === 'ja' ? 'ja-JP' : 'en-US';
  const rec = { ctrl: null, btn: null };
  const onRecord = async (text, btn) => {
    if (rec.ctrl) {
      const ctrl = rec.ctrl; rec.ctrl = null;
      if (rec.btn) rec.btn.lastChild.textContent = '녹음';
      rec.btn = null;
      const result = await stopAndAnalyze(ctrl, text, { lang });
      if (result?.mockFallback) showRecordToast(recordErrorMessage(result.fallbackReason));
      else showRecordToast('발음 점수 ' + Math.round(result?.score ?? 0) + '점');
      return;
    }
    const r = await startMicRecording();
    if (r.error) { showRecordToast(recordErrorMessage(r.error)); return; }
    rec.ctrl = r.controller; rec.btn = btn;
    if (btn) btn.lastChild.textContent = '멈추기';
  };
  return (Array.isArray(drills) ? drills : []).map((d) => {
    const recChip = h('button', { class: 'd1-chip', style: 'background:var(--terra);border-color:var(--terra);color:#fff;' }, d1Icon('mic', 13), '녹음');
    recChip.addEventListener('click', () => onRecord(d.en || '', recChip));
    return h('div', { class: 'd1-drill' },
      h('div', { style: 'grid-column:1;font-size:16px;font-weight:600;' }, hiFragment(d.en || '', hl)),
      h('div', { style: 'grid-column:1;font-size:13.5px;color:var(--mut);' }, d.ko || ''),
      h('div', { style: 'grid-column:2;grid-row:1 / 3;display:flex;gap:8px;' },
        h('button', { class: 'd1-chip', style: 'color:var(--mut);', onClick: () => { if (d.en && window.studySpeech?.speak) window.studySpeech.speak(d.en, { lang: ttsLang }); } }, d1Icon('play', 12), '듣기'),
        recChip,
      ),
    );
  });
}

/* 우측 해설 컬럼 — 핵심(keybox) + (옵션)변주 + 상황/실수/비슷한표현. en/ja 스키마 graceful. */
export function buildD1ExplainRight(ex, lang, opts = {}) {
  const { header = '표현 해설', sub = null, withDrills = false, hl = [], flexBasis = '43%' } = opts;
  const headerEl = sub
    ? h('div', { style: 'display:flex;align-items:baseline;justify-content:space-between;margin-bottom:16px;' },
        h('span', { class: 'd1-panel-lab', style: 'margin-bottom:0;' }, header),
        h('span', { style: 'font-size:12.5px;color:var(--faint);' }, sub))
    : h('div', { class: 'd1-panel-lab', style: 'margin-bottom:16px;' }, header);
  const kids = [headerEl];
  if (ex?.key) {
    kids.push(h('div', { class: 'd1-keybox' },
      h('div', { class: 'd1-panel-lab', style: 'color:var(--terra);margin-bottom:8px;' }, '핵심 포인트'),
      h('div', { style: 'font-size:16px;line-height:1.6;font-weight:500;' }, String(ex.key))));
  }
  if (withDrills) {
    const drills = Array.isArray(ex?.drills) ? ex.drills : [];
    if (drills.length) {
      kids.push(h('div', { style: 'margin-top:24px;' },
        h('div', { class: 'd1-panel-lab' }, '변주 — 듣고, 따라 말하기'),
        h('div', { style: 'margin-top:4px;' }, buildD1DrillRows(drills, hl, lang))));
    }
  }
  const sects = [];
  const situation = ex?.situation || ex?.whenToUse;
  if (situation) sects.push(d1Section('이런 상황에서 써요', String(situation)));
  const mistake = ex?.mistake || ex?.commonMistakes;
  if (mistake) sects.push(d1Section('한국인 실수', String(mistake)));
  let similar = null;
  if (typeof ex?.similar === 'string') similar = ex.similar;
  else if (Array.isArray(ex?.similar)) similar = ex.similar.map((x) => x?.expression || '').filter(Boolean).join(' / ');
  if (similar) sects.push(d1Section('비슷한 표현', similar));
  if (sects.length) kids.push(h('div', { style: 'display:grid;gap:22px;margin-top:24px;' }, sects));
  return h('div', { style: 'flex:1 1 ' + flexBasis + ';padding:48px 56px 40px 48px;overflow-y:auto;' }, kids);
}

/* 복습 판정 3카드 — 선택 전 중립(흰 배경 + 색 테두리). 다시→no / 애매→hmm / 완벽→got. */
export function buildD1Judges(onJudge) {
  const JUDGES = [
    { k: 'no', en: '다시', sub: 'AGAIN', note: '내일 다시', color: 'var(--terra)', border: 'var(--terra)' },
    { k: 'hmm', en: '애매', sub: 'HARD', note: '3일 후', color: 'var(--ink)', border: 'var(--faint)' },
    { k: 'got', en: '완벽', sub: 'GOOD', note: '7일 후', color: 'var(--sage)', border: 'var(--sage)' },
  ];
  return h('div', { style: 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;' },
    JUDGES.map((j) => h('div', {
      class: 'd1-judge', style: 'border-color:' + j.border + ';background:#fff;',
      role: 'button', 'aria-label': j.en, onClick: () => onJudge && onJudge(j.k),
    },
      h('div', { class: 'jn', style: 'color:' + j.color + ';' }, j.en),
      h('div', { class: 'js', style: 'color:' + (j.k === 'hmm' ? 'var(--faint)' : j.color) + ';' }, j.sub),
      h('div', { class: 'jh' }, j.note),
    )),
  );
}

/* 좌측 능동 연습 — 듣기(재생 토글) + 따라 말하기(녹음·채점) + 점수 행.
 * state(lastScore/tried/passed/pronScores/weakInSession/recording) 갱신 + 저장. handlers.saveSnapshot.
 * 반환 { listenBtn, recBtn, scoreRow, stop }. ③신규·④복습 공용.
 */
export function buildD1Practice(state, lang, handlers = {}) {
  const ttsLang = lang === 'ja' ? 'ja-JP' : 'en-US';
  const s = state.sentence;
  let playing = false, recCtrl = null;

  const listenBtn = h('button', { class: 'd1-btn d1-btn--outline lg' }, d1Icon('play', 15), '듣기');
  const stopPlaying = () => { playing = false; };
  listenBtn.addEventListener('click', () => {
    if (state.recording) return;
    if (playing) { try { window.studySpeech?.cancel?.(); } catch { /* noop */ } stopPlaying(); return; }
    const text = s?.sentence || '';
    if (!text || !window.studySpeech?.speak) return;
    playing = true;
    window.studySpeech.speak(text, { lang: ttsLang, speaker: s?.speaker, onEnd: stopPlaying });
    setTimeout(stopPlaying, 30000);
  });

  const recBtn = h('button', { class: 'd1-btn d1-btn--primary lg d1-pulse' }, d1Icon('mic', 17), '따라 말하기');
  const recLabel = recBtn.lastChild;
  const setRec = (on) => { state.recording = on; recBtn.classList.toggle('d1-pulse', !on); recLabel.textContent = on ? '녹음 멈추기' : '따라 말하기'; };

  const scoreNum = h('span', { class: 'sc' }, '');
  const scoreChip = h('span', { class: 'd1-score', style: 'display:none;' }, scoreNum, h('span', { class: 'sl' }, '발음'));
  const scoreMsg = h('span', { style: 'font-size:14px;color:var(--mut);' }, '');
  const showScore = (score) => {
    scoreNum.textContent = String(score);
    scoreChip.style.display = '';
    scoreMsg.textContent = score >= PASS_THRESHOLD ? '또렷하게 잘 말했어요.' : '조금 더 또렷하게 다시 말해 볼까요?';
  };
  if (state.lastScore != null) showScore(state.lastScore);

  recBtn.addEventListener('click', async () => {
    if (!state.recording) {
      setRec(true);
      const rec = await startMicRecording();
      if (rec.error) { setRec(false); recCtrl = null; showRecordToast(recordErrorMessage(rec.error)); return; }
      recCtrl = rec.controller;
    } else {
      const ctrl = recCtrl; recCtrl = null;
      const result = await stopAndAnalyze(ctrl, s.sentence, s);
      setRec(false);
      if (result?.mockFallback) { showRecordToast(recordErrorMessage(result.fallbackReason)); return; }
      const score = Number(result?.score) || 0;
      state.lastScore = score; state.tried += 1; if (score >= PASS_THRESHOLD) state.passed += 1;
      state.pronScores.push(score);
      if (Array.isArray(result?.weakPhonemes)) for (const ph of result.weakPhonemes) if (ph) state.weakInSession[ph] = (state.weakInSession[ph] || 0) + 1;
      showScore(score);
      try {
        await savePronunciationLog(window.studyDB, { result, sentenceId: s.id, lang, date: getTodayISO() });
        await applyWeakPhonemesUpdate(window.studyDB, lang, result?.weakPhonemes);
      } catch (e) { console.error('[d1 practice] pron persist', e); }
      handlers.saveSnapshot?.();
    }
  });

  const scoreRow = h('div', { style: 'display:flex;align-items:center;gap:14px;margin-top:18px;min-height:38px;' }, scoreChip, scoreMsg);
  const stop = () => { try { window.studySpeech?.cancel?.(); if (recCtrl?.stop) recCtrl.stop(); } catch { /* noop */ } };
  return { listenBtn, recBtn, scoreRow, stop };
}
