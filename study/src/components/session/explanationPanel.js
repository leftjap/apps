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
  const has = Array.isArray(grammar) ? grammar.length > 0 : String(grammar || '').trim() !== '';
  if (!has) return null;
  const s = document.createElement('div');
  s.className = 'ex-section';
  const lab = document.createElement('div');
  lab.className = 'ex-label';
  lab.textContent = '문법 뜯어보기';
  s.appendChild(lab);
  if (Array.isArray(grammar)) {
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
    if (ex.whenToUse) panelEl.appendChild(section('이런 상황에서 써요', String(ex.whenToUse)));
    if (ex.key) panelEl.appendChild(section('핵심 포인트', String(ex.key)));
    if (ex.situation) panelEl.appendChild(section('이런 상황에서 써요', String(ex.situation)));
    const g = grammarSection(ex.grammar);
    if (g) panelEl.appendChild(g);
    const c = chunksSection(ex.chunks);
    if (c) panelEl.appendChild(c);
    const p = phonemesSection(ex.phonemes);
    if (p) panelEl.appendChild(p);
    if (ex.pronPoints) panelEl.appendChild(section('발음 포인트', String(ex.pronPoints)));
    if (ex.mistake) panelEl.appendChild(section('한국인 실수', String(ex.mistake)));
    if (ex.similar) panelEl.appendChild(section('비슷한 표현', String(ex.similar)));
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
