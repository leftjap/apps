/* 다이얼로그 — 데스크톱 C 파이널 v2 (작업지시서 §2)
 * 맥락 리뷰 + 표현 개별 선별: 전체 대화 듣기 + 쉐도잉 + AI 추천 표현 체크/제외/+추가 → 선택분만 학습.
 * 정본 시안: 작업지시서 v-dialog.jsx (DlgV2)
 *
 * 실데이터: state.sentence.explanation.dialogue + state.cards(표현)로 deriveDialogue.
 * 선택 확정(CTA) 시 state.cards 를 [scene, ...선택 표현]으로 좁혀 선택분만 학습(§2 파이프라인).
 */
import { h } from '../components/d1/dom.js';
import { exprOf } from '../components/d1/sessionShell.js';
import { V_VARS, VI, vIcon, vEq, vCheck, v2Style, ensureV2Fonts } from '../components/v2/atoms.js';

const VD_CSS = `
.vd{width:100%;min-height:100vh;min-height:100dvh;background:var(--bg);color:var(--ink);font-family:Pretendard,sans-serif;word-break:keep-all;${V_VARS}}
.vd *{box-sizing:border-box;margin:0}
.vd-top{height:60px;border-bottom:1px solid var(--line);display:flex;align-items:center}
.vd-top-in{width:100%;max-width:920px;margin:0 auto;padding:0 20px;display:flex;align-items:center;justify-content:space-between}
.vd-home{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--mut);white-space:nowrap;background:none;border:0;cursor:pointer;font-family:inherit}
.vd-meta{font-family:Outfit;font-size:12.5px;color:var(--faint);letter-spacing:.06em;white-space:nowrap}
.vd-wrap{width:100%;max-width:920px;margin:0 auto;padding:26px 20px 0}
.vd-eyebrow{font-family:Outfit;font-size:11.5px;letter-spacing:.15em;color:var(--faint);font-weight:600;text-transform:uppercase}
.vd-h1{font-family:Outfit;font-size:36px;font-weight:700;letter-spacing:-0.03em;margin-top:10px;color:var(--teal-deep)}
.vd-sub{font-size:14.5px;color:var(--mut);margin-top:9px;line-height:1.55}
.vd-ctl{display:flex;align-items:center;gap:16px;margin-top:18px;flex-wrap:wrap}
.vd-listen{position:relative;display:inline-flex;align-items:center;gap:10px;background:var(--blue-soft);color:var(--blue-deep);border:1.5px solid var(--blue-line);border-radius:999px;padding:12px 22px;font:inherit;font-size:14px;font-weight:700;cursor:pointer;white-space:nowrap;overflow:hidden}
.vd-listen.on .pr{position:absolute;left:0;bottom:0;height:2.5px;background:var(--blue);animation:vd-lineprog 6s linear infinite}
.vd-shadow{display:inline-flex;align-items:center;gap:9px;font-size:13px;color:var(--mut);font-weight:600;white-space:nowrap;cursor:pointer;background:none;border:0;font-family:inherit}
.vd-shadow .sw{width:34px;height:20px;border-radius:999px;background:var(--teal);position:relative;flex:0 0 auto;transition:background .2s}
.vd-shadow .sw i{position:absolute;top:2.5px;left:17px;width:15px;height:15px;border-radius:50%;background:#fff;transition:left .2s}
.vd-shadow.off .sw{background:#ddd9c9}
.vd-shadow.off .sw i{left:2.5px}
.vd-shadow b{color:var(--ink)}
.vd-said{margin-left:auto;font-size:12.5px;color:var(--mut);display:inline-flex;align-items:center;gap:8px;white-space:nowrap}
.vd-said .d{display:inline-flex;gap:4px}
.vd-said .d i{width:6px;height:6px;border-radius:50%;background:#ddd9c9}
.vd-said .d i.f{background:var(--teal)}
.vd-selrow{margin-top:13px;display:flex;align-items:center;gap:11px;font-size:12.5px;color:var(--mut);flex-wrap:wrap}
.vd-selcount{font-family:Outfit;font-size:12px;font-weight:700;color:var(--teal-deep);background:var(--teal-soft);border-radius:999px;padding:4px 12px;animation:v-settle .5s both}
.vd-list{margin-top:14px;display:flex;flex-direction:column}
.vd-line{position:relative;display:flex;align-items:center;gap:13px;padding:10px 16px;border-radius:14px}
.vd-line.playing{background:var(--blue-soft)}
.vd-line.playing::before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:2px;background:var(--blue);animation:v-blink 1.6s ease-in-out infinite}
.vd-sel{width:19px;height:19px;border-radius:6px;border:1.5px solid #d5d1c2;display:grid;place-items:center;color:#fff;flex:0 0 auto;cursor:pointer;background:transparent;padding:0}
.vd-sel.on{background:var(--teal);border-color:var(--teal)}
.vd-sel.sp{border-color:transparent;cursor:default}
.vd-sel.add{border-style:dashed;color:var(--faint);font-size:13px;font-weight:700}
.vd-num{width:20px;height:20px;border-radius:50%;border:1.5px solid var(--teal-line);color:var(--teal-deep);font-size:10.5px;font-weight:800;display:grid;place-items:center;font-family:Outfit;flex:0 0 auto}
.vd-num.ctx{border-color:transparent}
.vd-num.off{border-style:dashed;border-color:#d5d1c2;color:transparent}
.vd-av{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;font-size:12.5px;font-weight:800;flex:0 0 auto;font-family:Outfit}
.vd-av.a{background:var(--teal-soft);color:var(--teal-deep)}
.vd-av.l{background:var(--coral-soft);color:var(--coral-deep)}
.vd-line .enw{position:relative;display:inline-block}
.vd-line .en{font-size:17px;font-weight:600;letter-spacing:-0.005em;line-height:1.4}
.vd-line .en b{font-weight:800;text-decoration:underline;text-decoration-color:oklch(44% .062 192/.3);text-decoration-thickness:3px;text-underline-offset:4px}
.vd-line.unsel .en{color:var(--mut)}
.vd-line.unsel .en b{color:var(--mut);text-decoration-color:#d8d4c6}
.vd-line .ko{font-size:12.5px;color:var(--faint);margin-top:3px}
.vd-grow{flex:1}
.vd-cir{width:32px;height:32px;border-radius:50%;border:1.5px solid var(--line);background:var(--card);color:var(--mut);display:grid;place-items:center;cursor:pointer;flex:0 0 auto;position:relative;padding:0}
.vd-cir.eqq{border-color:var(--blue-line);color:var(--blue);background:#fff}
.vd-cir.said{color:var(--teal);border-color:var(--teal-line)}
.vd-chip{font-size:10.5px;font-weight:700;color:var(--teal-deep);white-space:nowrap;font-family:Outfit}
.vd-foot{width:100%;max-width:920px;margin:16px auto 0;padding:0 20px 40px;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
.vd-foot .hh{font-size:13px;color:var(--faint)}
.vd-cta{background:var(--teal);color:#fff;border:0;border-radius:13px;padding:14px 28px;font:inherit;font-size:14.5px;font-weight:700;cursor:pointer;white-space:nowrap;animation:v-breathe 2.6s ease-in-out infinite}
.vd-cta:disabled{animation:none;opacity:.5;cursor:default}
@keyframes vd-lineprog{from{width:0}to{width:100%}}
`;

function hlFragment(en, hl) {
  const term = Array.isArray(hl) ? hl[0] : hl;
  if (!term) return document.createTextNode(en);
  const i = en.toLowerCase().indexOf(String(term).toLowerCase());
  if (i < 0) return document.createTextNode(en);
  const frag = document.createDocumentFragment();
  frag.append(document.createTextNode(en.slice(0, i)));
  const b = document.createElement('b'); b.textContent = en.slice(i, i + term.length); frag.appendChild(b);
  frag.append(document.createTextNode(en.slice(i + term.length)));
  return frag;
}

// 시드 dialogue 줄 ↔ 표현 카드 매칭 (session-new deriveDialogue 와 동일 규칙).
function deriveLines(sceneEx, cards) {
  const dialogue = Array.isArray(sceneEx?.dialogue) ? sceneEx.dialogue : [];
  const exprCards = (cards || []).filter((c) => c?.explanation?.key && !Array.isArray(c.explanation.dialogue));
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  let ci = 0;
  return dialogue.map((line) => {
    let num = null, hl = [], card = null;
    const nl = norm(line.en);
    if (ci < exprCards.length) {
      const c = exprCards[ci];
      const nc = norm(c.sentence);
      if (nl && nc && nl.includes(nc)) { num = ci + 1; card = c; const e = exprOf(c); if (e) hl = [e]; ci += 1; }
    }
    return { spk: line.speaker || '', en: line.en || '', ko: line.ko || '', num, hl, card };
  });
}

/* 모바일(phone/tablet) — 동일 마크업, 단일 칼럼 셸 + 하단 sticky CTA (작업지시서 모바일 §3-2) */
const VDM_CSS = `
.vd{min-height:100vh;min-height:100dvh;background:var(--bg);color:var(--ink);font-family:Pretendard,sans-serif;word-break:keep-all;display:flex;flex-direction:column;${V_VARS}}
.vd *{box-sizing:border-box;margin:0}
.vd button{font:inherit;background:none;border:0;cursor:pointer;padding:0;color:inherit}
.vd-top{position:sticky;top:0;z-index:6;background:oklch(97.5% .009 95/.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);padding:calc(9px + env(safe-area-inset-top)) 20px 11px;flex:0 0 auto;height:auto}
.vd-top-in{display:flex;align-items:center;justify-content:space-between;gap:12px;max-width:none;margin:0;padding:0}
.vd-home{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--mut);white-space:nowrap}
.vd-meta{font-family:Outfit,sans-serif;font-size:12px;color:var(--faint);letter-spacing:.04em;white-space:nowrap}
.vd-wrap{flex:1 1 auto;padding:0 20px 96px;max-width:560px;margin:0 auto;width:100%}
.vd-eyebrow{font-family:Outfit;font-size:11px;letter-spacing:.14em;color:var(--faint);font-weight:600;text-transform:uppercase;margin-top:16px}
.vd-h1{font-family:Outfit;font-size:25px;font-weight:700;letter-spacing:-.03em;margin:9px 0 0;color:var(--teal-deep);line-height:1.15}
.vd-sub{font-size:13.5px;color:var(--mut);margin-top:8px;line-height:1.5}
.vd-ctl{display:flex;flex-wrap:wrap;align-items:center;gap:11px 12px;margin-top:16px}
.vd-listen{position:relative;display:inline-flex;align-items:center;gap:9px;background:var(--blue-soft);color:var(--blue-deep);border:1.5px solid var(--blue-line);border-radius:999px;padding:11px 18px;font-size:13.5px;font-weight:700;white-space:nowrap;overflow:hidden}
.vd-listen .pr{position:absolute;left:0;bottom:0;height:2.5px;background:var(--blue);width:0}
.vd-listen.on .pr{animation:vd-lineprog 6s linear infinite}
@keyframes vd-lineprog{to{width:100%}}
.vd-said{font-size:12px;color:var(--mut);display:inline-flex;align-items:center;gap:7px;white-space:nowrap;margin-left:auto}
.vd-said .d{display:inline-flex;gap:4px}
.vd-said .d i{width:6px;height:6px;border-radius:50%;background:#ddd9c9}
.vd-said .d i.f{background:var(--teal)}
.vd-shadow{flex-basis:100%;display:inline-flex;align-items:center;gap:9px;font-size:12.5px;color:var(--mut);font-weight:600;text-align:left}
.vd-shadow .sw{width:34px;height:20px;border-radius:999px;background:var(--teal);position:relative;flex:0 0 auto;transition:background .2s}
.vd-shadow .sw i{position:absolute;top:2.5px;left:17px;width:15px;height:15px;border-radius:50%;background:#fff;transition:left .2s}
.vd-shadow.off .sw{background:#ddd9c9}.vd-shadow.off .sw i{left:2.5px}
.vd-shadow b{color:var(--ink)}
.vd-selrow{margin-top:14px;display:flex;align-items:center;gap:9px;font-size:12px;color:var(--mut);flex-wrap:wrap}
.vd-selcount{font-family:Outfit;font-size:11.5px;font-weight:700;color:var(--teal-deep);background:var(--teal-soft);border-radius:999px;padding:4px 11px;animation:v-settle .5s both}
.vd-list{margin-top:12px;display:flex;flex-direction:column;gap:2px}
.vd-line{position:relative;display:flex;align-items:center;gap:10px;padding:9px 8px;border-radius:13px}
.vd-line.playing{background:var(--blue-soft)}
.vd-line.playing::before{content:"";position:absolute;left:0;top:9px;bottom:9px;width:3px;border-radius:2px;background:var(--blue);animation:v-blink 1.6s ease-in-out infinite}
.vd-sel{width:19px;height:19px;border-radius:6px;border:1.5px solid #d5d1c2;display:grid;place-items:center;color:#fff;flex:0 0 auto;padding:0}
.vd-sel.on{background:var(--teal);border-color:var(--teal)}
.vd-sel.add{border-style:dashed;color:var(--faint);font-size:13px;font-weight:700}
.vd-num{width:19px;height:19px;border-radius:50%;border:1.5px solid var(--teal-line);color:var(--teal-deep);font-size:10px;font-weight:800;display:grid;place-items:center;font-family:Outfit;flex:0 0 auto}
.vd-num.ctx{border-color:transparent}
.vd-av{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:800;flex:0 0 auto;font-family:Outfit}
.vd-av.a{background:var(--teal-soft);color:var(--teal-deep)}
.vd-av.l{background:var(--coral-soft);color:var(--coral-deep)}
.vd-line > div{min-width:0;flex:1 1 auto}
.vd-line .enw{position:relative;display:inline}
.vd-line .en{font-size:15px;font-weight:600;letter-spacing:-.005em;line-height:1.35}
.vd-line .en b{font-weight:800;text-decoration:underline 2.5px oklch(44% .062 192/.3);text-underline-offset:3px}
.vd-line.unsel .en{color:var(--mut)}
.vd-line.unsel .en b{color:var(--mut);text-decoration-color:#d8d4c6}
.vd-line .ko{font-size:11.5px;color:var(--faint);margin-top:2px}
.vd-grow{flex:0 0 auto}
.vd-chip{font-size:10px;font-weight:700;color:var(--teal-deep);white-space:nowrap;font-family:Outfit;flex:0 0 auto}
.vd-cir{width:30px;height:30px;border-radius:50%;border:1.5px solid var(--line);background:var(--card);color:var(--mut);display:grid;place-items:center;flex:0 0 auto;padding:0}
.vd-foot{position:sticky;bottom:0;flex:0 0 auto;background:oklch(97.5% .009 95/.96);backdrop-filter:blur(8px);border-top:1px solid var(--line);padding:12px 20px calc(12px + env(safe-area-inset-bottom));margin:0;max-width:none}
.vd-foot .hh{display:none}
.vd-cta{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:52px;border-radius:14px;font-size:15px;font-weight:700;white-space:nowrap;background:var(--teal);color:#fff;animation:v-breathe 2.6s ease-in-out infinite}
.vd-cta:disabled{opacity:.5;animation:none}
`;

export function renderDialogueV2(host, state, handlers = {}) {
  ensureV2Fonts();
  const sceneEx = state.sentence.explanation || {};
  const lang = state.sentence?.lang || 'en';
  const ttsLang = lang === 'ja' ? 'ja-JP' : 'en-US';
  const subjLabel = lang === 'ja' ? '일본어' : '영어';
  const sceneTitle = sceneEx.sceneTitle || '오늘의 장면';
  const lines = deriveLines(sceneEx, state.cards);
  const exprLines = lines.filter((l) => l.num != null);

  // 선택 상태 — 표현 카드 id Set. 기본 전체 선택(데모 제외 id 반영).
  if (!(state.exprSel instanceof Set)) {
    state.exprSel = new Set(exprLines.map((l) => l.card.id).filter((id) => !(state.exprExclude || []).includes(id)));
  }
  const selCount = () => exprLines.filter((l) => state.exprSel.has(l.card.id)).length;
  let shadowOn = state.shadowOn !== false;
  let shadowed = state.shadowed || 0;

  let listenAll = null, selCountEl = null, ctaEl = null, saidDotsEl = null, listEl = null;

  const refreshSel = () => {
    const n = selCount();
    if (selCountEl) selCountEl.textContent = `학습할 표현 ${n}개 선택됨`;
    if (ctaEl) { ctaEl.textContent = `선택한 표현 ${n}개로 공부 시작 →`; ctaEl.disabled = n === 0; }
  };

  const speak = (t, spk) => { if (t && window.studySpeech?.speak) window.studySpeech.speak(t, { lang: ttsLang, speaker: spk }); };

  const onPlayLine = (l) => {
    speak(l.en, l.spk);
    if (shadowOn && shadowed < lines.length) {
      shadowed += 1; state.shadowed = shadowed; renderSaidDots();
      handlers.saveSceneShadow?.(shadowed); // durable 저장 (다음날 재진입 유지)
    }
  };

  const speakAll = () => {
    let i = 0;
    const stop = () => { listenAll?.classList.remove('on'); }; // 재생 종료 시 진행바 애니 정지
    const next = () => {
      if (i >= lines.length || !window.studySpeech?.speak) { stop(); return; }
      const ln = lines[i++];
      if (!ln.en) { next(); return; }
      window.studySpeech.speak(ln.en, { lang: ttsLang, speaker: ln.spk, onEnd: next });
    };
    listenAll?.classList.add('on');
    next();
  };

  function renderSaidDots() {
    if (!saidDotsEl) return;
    saidDotsEl.innerHTML = '';
    lines.forEach((_, i) => saidDotsEl.appendChild(h('i', { class: i < shadowed ? 'f' : '' })));
    saidDotsEl.parentElement.querySelector('.vd-said-n').textContent = `${shadowed} / ${lines.length}`;
  }

  const lineRow = (l, i) => {
    const isExpr = l.num != null;
    const selected = isExpr && state.exprSel.has(l.card.id);
    const unsel = isExpr && !selected;

    let selBox;
    if (isExpr) {
      selBox = h('button', { class: 'vd-sel' + (selected ? ' on' : ''), type: 'button', 'aria-pressed': String(selected), 'aria-label': '표현 선택' },
        selected ? vCheck({ size: 11, sw: 3.2 }) : null);
      selBox.addEventListener('click', () => {
        if (state.exprSel.has(l.card.id)) state.exprSel.delete(l.card.id); else state.exprSel.add(l.card.id);
        rerenderLines();
        refreshSel();
      });
    } else {
      // 맥락 줄 — + 추가 affordance (best-effort: 클릭 시 표현 후보로 승격).
      selBox = h('button', { class: 'vd-sel add', type: 'button', 'aria-label': '표현으로 추가' }, '+');
      selBox.addEventListener('click', () => { addContextLine(l, i); });
    }

    const numEl = isExpr
      ? h('span', { class: 'vd-num' }, String(l.num))
      : h('span', { class: 'vd-num ctx' });

    const playEl = h('button', { class: 'vd-cir', type: 'button', 'aria-label': '듣기', onClick: () => onPlayLine(l) }, vIcon(VI.PLAY, { size: 11, fill: true }));
    const recEl = h('button', { class: 'vd-cir', type: 'button', 'aria-label': '따라 말하기', onClick: () => onPlayLine(l) }, vIcon(VI.MIC, { size: 13, sw: 2 }));

    return h('div', { class: 'vd-line' + (unsel ? ' unsel' : '') },
      selBox, numEl,
      h('span', { class: 'vd-av ' + (l.spk === 'A' ? 'a' : 'l') }, l.spk),
      h('div', {}, h('span', { class: 'enw' }, h('span', { class: 'en' }, hlFragment(l.en, l.hl))), h('div', { class: 'ko' }, l.ko)),
      h('span', { class: 'vd-grow' }),
      i < shadowed ? h('span', { class: 'vd-chip' }, '발화 ✓') : null,
      playEl, recEl,
    );
  };

  function rerenderLines() {
    if (!listEl) return;
    listEl.innerHTML = '';
    lines.forEach((l, i) => listEl.appendChild(lineRow(l, i)));
  }

  function addContextLine(l, i) {
    // 맥락 줄을 표현 카드로 승격 (해설은 최소 — 온디맨드 생성 미지원 환경).
    const id = 'ctx-' + i;
    if (state.cards.some((c) => c.id === id)) { state.exprSel.add(id); rerenderLines(); refreshSel(); return; }
    const card = { id, lang, sentence: l.en, ko: l.ko, pron: '', speaker: l.spk, explanation: { key: l.en + ' = ' + l.ko } };
    state.cards.push(card);
    l.num = state.cards.filter((c) => c.explanation?.key && !Array.isArray(c.explanation.dialogue)).length;
    l.card = card;
    state.exprSel.add(id);
    exprLines.push(l);
    rerenderLines();
    refreshSel();
  }

  const shadowBtn = h('button', { class: 'vd-shadow' + (shadowOn ? '' : ' off'), type: 'button' },
    h('span', { class: 'sw' }, h('i')), '쉐도잉 ', h('b', {}, shadowOn ? 'ON' : 'OFF'), ' — 한 줄씩 듣고 바로 따라 말해요');
  shadowBtn.addEventListener('click', () => {
    shadowOn = !shadowOn; state.shadowOn = shadowOn;
    shadowBtn.classList.toggle('off', !shadowOn);
    shadowBtn.querySelector('b').textContent = shadowOn ? 'ON' : 'OFF';
  });

  listenAll = h('button', { class: 'vd-listen', type: 'button', onClick: speakAll },
    vIcon(VI.PLAY, { size: 12, fill: true }), '전체 대화 재생', h('span', { class: 'pr' }));

  saidDotsEl = h('span', { class: 'd' });
  const saidWrap = h('span', { class: 'vd-said' }, h('span', {}, '따라 말한 줄'), saidDotsEl, h('span', { class: 'vd-said-n' }, ''));

  selCountEl = h('span', { class: 'vd-selcount' }, '');
  ctaEl = h('button', { class: 'vd-cta', type: 'button' }, '');
  ctaEl.addEventListener('click', () => {
    // 선택한 표현만 학습 큐로 (§2 파이프라인): cards = [scene, ...선택 표현]
    const keptExpr = exprLines.filter((l) => state.exprSel.has(l.card.id)).map((l) => l.card);
    const scene = state.cards.find((c) => Array.isArray(c.explanation?.dialogue));
    state.cards = scene ? [scene, ...keptExpr] : keptExpr;
    state.total = state.cards.length;
    if (handlers.onNext) handlers.onNext();
  });

  listEl = h('div', { class: 'vd-list' });

  const root = h('div', { class: 'vd' },
    v2Style(state.size === 'desktop' ? VD_CSS : VDM_CSS),
    h('div', { class: 'vd-top' }, h('div', { class: 'vd-top-in' },
      h('button', { class: 'vd-home', type: 'button', onClick: handlers.onHome || (() => { window.location.hash = '#/home'; }) }, vIcon(VI.HOME, { size: 14 }), '홈으로'),
      h('span', { class: 'vd-meta' }, `신규 학습 · ${subjLabel} — ${state.time || '00:00'}`),
    )),
    h('div', { class: 'vd-wrap' },
      h('div', { class: 'vd-eyebrow' }, '오늘의 미션 1 — 전체 대화 듣고 표현 고르기'),
      h('h1', { class: 'vd-h1' }, sceneTitle),
      sceneEx.sceneSummary ? h('div', { class: 'vd-sub' }, sceneEx.sceneSummary) : null,
      h('div', { class: 'vd-ctl' }, listenAll, shadowBtn, saidWrap),
      h('div', { class: 'vd-selrow' }, selCountEl,
        h('span', {}, 'AI 추천 표현을 체크로 빼거나, 회색 줄의 ', h('b', { style: 'color:var(--ink)' }, '+'), '로 직접 추가할 수 있어요')),
      listEl,
    ),
    h('div', { class: 'vd-foot' },
      h('span', { class: 'hh' }, '쉐도잉으로 모든 줄을 말하면 표현 학습이 훨씬 쉬워져요.'),
      ctaEl,
    ),
  );

  host.appendChild(root);
  rerenderLines();
  renderSaidDots();
  refreshSel();

  const layout = { update(s) { if (s && 'time' in s) { const m = root.querySelector('.vd-meta'); if (m) m.textContent = `신규 학습 · ${subjLabel} — ${s.time}`; } } };
  return { cleanup: () => { try { window.studySpeech?.cancel?.(); } catch { /* noop */ } host.innerHTML = ''; }, layout };
}
