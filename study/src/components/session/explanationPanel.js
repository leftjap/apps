/**
 * explanationPanel — 카드 explanation JSONB 렌더 + toggle.
 *
 * 정본:
 *  - 형식 메타 docs/explanation-schema.md
 *  - 렌더 구조 mocks/session.html (deleted, git 13018d1^) renderExplain (L1299)
 *
 * en 필드: key, situation, grammar:[{struct,body}|string], chunks:[[text,kr]|string],
 *          phonemes:[[ipa,word]|string], mistake, similar
 * ja 필드: whenToUse, grammar (string), pronPoints, similar
 *
 * 두 형식 호환 (drift 방어 — schema.md §"현재 drift 상태"). 누락 필드는 섹션 자체 hidden.
 *
 * 반환:
 *   { toggleEl, panelEl, toggle, isOpen }
 *   toggle() — open/close 전환 (.open 클래스 토글, aria-expanded 갱신)
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

function chevron() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG_NS, 'polyline');
  p.setAttribute('points', '6 9 12 15 18 9');
  svg.appendChild(p);
  return svg;
}

function section(label, contentHtml) {
  const s = document.createElement('div');
  s.className = 'ex-section';
  const lab = document.createElement('div');
  lab.className = 'ex-label';
  lab.textContent = label;
  const txt = document.createElement('div');
  txt.className = 'ex-text';
  txt.innerHTML = contentHtml;
  s.append(lab, txt);
  return s;
}

function grammarSection(grammar) {
  const isArr = Array.isArray(grammar);
  const isObj = grammar && typeof grammar === 'object' && !isArr;
  const has = isArr ? grammar.length > 0
    : isObj ? Boolean(grammar.structure || grammar.explanation || grammar.struct || grammar.body)
    : String(grammar || '').trim() !== '';
  if (!has) return null;
  const s = document.createElement('div');
  s.className = 'ex-section';
  const lab = document.createElement('div');
  lab.className = 'ex-label';
  lab.textContent = '문법 뜯어보기';
  s.appendChild(lab);
  if (isArr) {
    grammar.forEach((g) => {
      const block = document.createElement('div');
      block.className = 'grammar-block';
      if (typeof g === 'string') {
        const struct = document.createElement('div');
        struct.className = 'struct';
        struct.textContent = g;
        block.appendChild(struct);
      } else if (g && typeof g === 'object') {
        const struct = document.createElement('div');
        struct.className = 'struct';
        struct.innerHTML = g.struct || '';
        block.appendChild(struct);
        if (g.body) {
          const body = document.createElement('div');
          body.innerHTML = g.body;
          block.appendChild(body);
        }
      }
      s.appendChild(block);
    });
  } else if (isObj) {
    // ja 가이드 §3.3 정본 형식: {structure, explanation, korean_parallel}
    const block = document.createElement('div');
    block.className = 'grammar-block';
    if (grammar.structure || grammar.struct) {
      const struct = document.createElement('div');
      struct.className = 'struct';
      struct.innerHTML = grammar.structure || grammar.struct || '';
      block.appendChild(struct);
    }
    if (grammar.explanation || grammar.body) {
      const body = document.createElement('div');
      body.className = 'ex-text';
      body.innerHTML = grammar.explanation || grammar.body || '';
      block.appendChild(body);
    }
    if (grammar.korean_parallel) {
      const kp = document.createElement('div');
      kp.className = 'ex-text';
      kp.style.cssText = 'color:var(--text-muted);margin-top:6px;font-size:14px;';
      kp.innerHTML = `<span style="color:var(--text-faint);">한국어 어순:</span> ${grammar.korean_parallel}`;
      block.appendChild(kp);
    }
    s.appendChild(block);
  } else {
    const txt = document.createElement('div');
    txt.className = 'ex-text';
    txt.innerHTML = grammar;
    s.appendChild(txt);
  }
  return s;
}

function chunksSection(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) return null;
  const s = document.createElement('div');
  s.className = 'ex-section';
  const lab = document.createElement('div');
  lab.className = 'ex-label';
  lab.textContent = '발음 — 청크 단위';
  const sub = document.createElement('div');
  sub.className = 'ex-text';
  sub.textContent = '덩어리로 연결해서 말하세요.';
  const row = document.createElement('div');
  row.className = 'chunk-row';
  chunks.forEach((c) => {
    const item = document.createElement('div');
    item.className = 'chunk';
    if (typeof c === 'string') {
      const en = document.createElement('span');
      en.className = 'chunk-en';
      en.textContent = c;
      item.appendChild(en);
    } else if (Array.isArray(c)) {
      const en = document.createElement('span');
      en.className = 'chunk-en';
      en.textContent = c[0] || '';
      const kr = document.createElement('span');
      kr.className = 'chunk-kr';
      kr.textContent = c[1] || '';
      item.append(en, kr);
    }
    row.appendChild(item);
  });
  s.append(lab, sub, row);
  return s;
}

function kanjiBreakdownSection(items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const s = document.createElement('div');
  s.className = 'ex-section';
  const lab = document.createElement('div');
  lab.className = 'ex-label';
  lab.textContent = '한자';
  s.appendChild(lab);
  items.forEach((k) => {
    if (!k || typeof k !== 'object') return;
    const row = document.createElement('div');
    row.className = 'ex-text';
    const parts = [];
    if (k.kanji) parts.push(`<strong style="font-size:18px;">${k.kanji}</strong>`);
    if (k.reading) parts.push(`<span style="color:var(--text-muted);">(${k.reading})</span>`);
    if (k.meaning) parts.push(`— ${k.meaning}`);
    if (k.korean_meaning) parts.push(`<span style="color:var(--text-faint); margin-left:6px;">· ${k.korean_meaning}</span>`);
    row.innerHTML = parts.join(' ');
    s.appendChild(row);
  });
  return s;
}

const POLITENESS_LABEL = { casual: '보통체', polite: '정중체', formal: '격식체' };

// ja 가이드 §3.4 정본 pronunciation 객체 분기 — chunks/tips/weak_focus 통합 표시
function pronunciationObjectSection(pron) {
  if (!pron || typeof pron !== 'object') return null;
  const hasAny = pron.chunks || pron.tips || (Array.isArray(pron.weak_focus) && pron.weak_focus.length > 0);
  if (!hasAny) return null;
  const s = document.createElement('div');
  s.className = 'ex-section';
  const lab = document.createElement('div');
  lab.className = 'ex-label';
  lab.textContent = '발음 포인트';
  s.appendChild(lab);
  // chunks
  if (Array.isArray(pron.chunks) && pron.chunks.length > 0) {
    const row = document.createElement('div');
    row.className = 'chunk-row';
    pron.chunks.forEach((c) => {
      const item = document.createElement('div');
      item.className = 'chunk';
      const main = document.createElement('span');
      main.className = 'chunk-en';
      main.textContent = c.ja || c.en || '';
      const kr = document.createElement('span');
      kr.className = 'chunk-kr';
      kr.textContent = c.kr || '';
      item.append(main, kr);
      row.appendChild(item);
    });
    s.appendChild(row);
  }
  // tips
  if (pron.tips) {
    const tips = document.createElement('div');
    tips.className = 'ex-text';
    tips.style.cssText = 'margin-top:8px;';
    tips.innerHTML = pron.tips;
    s.appendChild(tips);
  }
  // weak_focus (패턴 이름 배열)
  if (Array.isArray(pron.weak_focus) && pron.weak_focus.length > 0) {
    const tags = document.createElement('div');
    tags.className = 'phoneme-tags';
    tags.style.cssText = 'margin-top:8px;';
    pron.weak_focus.forEach((wf) => {
      const tag = document.createElement('span');
      tag.className = 'phoneme-tag';
      tag.textContent = String(wf);
      tags.appendChild(tag);
    });
    s.appendChild(tags);
  }
  return s;
}

// ja 가이드 §3.8 정본 similar 객체 배열 분기 — [{expression, politeness, nuance}]
function similarObjectSection(similar) {
  if (!Array.isArray(similar) || similar.length === 0) return null;
  const s = document.createElement('div');
  s.className = 'ex-section';
  const lab = document.createElement('div');
  lab.className = 'ex-label';
  lab.textContent = '비슷한 표현';
  s.appendChild(lab);
  similar.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const row = document.createElement('div');
    row.className = 'ex-text';
    row.style.cssText = 'margin-bottom:6px;';
    const parts = [];
    if (item.expression) parts.push(`<strong>${item.expression}</strong>`);
    if (item.politeness) {
      const lbl = POLITENESS_LABEL[item.politeness] || item.politeness;
      parts.push(`<span style="color:var(--text-faint);font-size:12px;margin-left:6px;">[${lbl}]</span>`);
    }
    if (item.nuance) parts.push(`<span style="color:var(--text-muted);"> — ${item.nuance}</span>`);
    row.innerHTML = parts.join('');
    s.appendChild(row);
  });
  return s;
}

function phonemesSection(phonemes) {
  if (!Array.isArray(phonemes) || phonemes.length === 0) return null;
  const s = document.createElement('div');
  s.className = 'ex-section';
  const lab = document.createElement('div');
  lab.className = 'ex-label';
  lab.textContent = '주의 음소';
  const tags = document.createElement('div');
  tags.className = 'phoneme-tags';
  phonemes.forEach((p) => {
    const tag = document.createElement('span');
    tag.className = 'phoneme-tag';
    if (typeof p === 'string') {
      tag.textContent = p;
    } else if (Array.isArray(p)) {
      tag.textContent = `${p[0] || ''} ${p[1] || ''}`.trim();
    }
    tags.appendChild(tag);
  });
  s.append(lab, tags);
  return s;
}

export function createExplanationPanel({ explanation, lang } = {}) {
  void lang;
  const toggleEl = document.createElement('button');
  toggleEl.type = 'button';
  toggleEl.className = 'explain-toggle';
  toggleEl.setAttribute('aria-expanded', 'false');
  toggleEl.append(document.createTextNode('해설 보기 '), chevron());

  const panelEl = document.createElement('div');
  panelEl.className = 'explain-panel';

  const ex = explanation;
  if (ex && typeof ex === 'object') {
    if (ex.politeness) {
      const label = POLITENESS_LABEL[ex.politeness] || ex.politeness;
      panelEl.appendChild(section('정중도', label));
    }
    if (ex.whenToUse) panelEl.appendChild(section('이런 상황에서 써요', String(ex.whenToUse)));
    if (ex.key) panelEl.appendChild(section('핵심 포인트', String(ex.key)));
    if (ex.situation) panelEl.appendChild(section('이런 상황에서 써요', String(ex.situation)));
    const g = grammarSection(ex.grammar);
    if (g) panelEl.appendChild(g);
    const c = chunksSection(ex.chunks);
    if (c) panelEl.appendChild(c);
    const p = phonemesSection(ex.phonemes);
    if (p) panelEl.appendChild(p);
    // ja 가이드 §3.4 정본 pronunciation 객체 (chunks/tips/weak_focus 통합)
    const po = pronunciationObjectSection(ex.pronunciation);
    if (po) panelEl.appendChild(po);
    if (ex.pronPoints) panelEl.appendChild(section('발음 포인트', String(ex.pronPoints)));
    const kb = kanjiBreakdownSection(ex.kanji_breakdown);
    if (kb) panelEl.appendChild(kb);
    if (ex.mistake) panelEl.appendChild(section('한국인 실수', String(ex.mistake)));
    if (ex.commonMistakes) panelEl.appendChild(section('한국인 실수', String(ex.commonMistakes)));
    // ja 가이드 §3.8 정본 similar 객체 배열
    const so = similarObjectSection(ex.similar);
    if (so) panelEl.appendChild(so);
    else if (ex.similar && typeof ex.similar === 'string') panelEl.appendChild(section('비슷한 표현', String(ex.similar)));
  }

  let isOpen = false;
  function toggle() {
    isOpen = !isOpen;
    toggleEl.classList.toggle('open', isOpen);
    panelEl.classList.toggle('open', isOpen);
    toggleEl.setAttribute('aria-expanded', String(isOpen));
  }
  toggleEl.addEventListener('click', toggle);

  return {
    toggleEl,
    panelEl,
    toggle,
    get isOpen() { return isOpen; },
  };
}
