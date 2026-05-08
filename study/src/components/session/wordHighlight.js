/**
 * 단어별 발음 점수 색상 — 옛 mocks/session.html (커밋 e3a36fb 보존본) L107-110 / L1294-1299 / L1593-1614 의
 * 회귀 복원. Azure PronunciationAssessment 의 wordScores 를 받아 문장 span 에 색·물결 밑줄 적용.
 *
 * 임계값 (옛 코드 그대로):
 *   score < 50 → bad  (var(--danger), wavy underline)
 *   score < 70 → ok   (var(--amber))
 *   else       → good (var(--sage))
 */

const COLOR_BAD = 'var(--danger)';
const COLOR_OK = 'var(--amber)';
const COLOR_GOOD = 'var(--sage)';

/** score → { color, deco } 매핑. */
export function classifyScore(score) {
  const s = Number(score);
  if (!Number.isFinite(s)) return { color: '', deco: '', cls: '' };
  if (s < 50) return { color: COLOR_BAD, deco: 'underline wavy', cls: 'bad' };
  if (s < 70) return { color: COLOR_OK, deco: '', cls: 'ok' };
  return { color: COLOR_GOOD, deco: '', cls: 'good' };
}

/**
 * 문장 → `<span class="word">…</span>` 토큰화 HTML.
 * 공백·구두점은 span 밖 (`.word` 인덱스 = wordScores 인덱스 매칭).
 *
 * 일본어: split 정규식이 공백·구두점만 분리 — 공백 없는 일문은 통째 1 word 가 되지만 옛 동작과 동일.
 */
export function wrapWords(sentence) {
  if (!sentence) return '';
  const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return String(sentence)
    .split(/(\s+|[.,!?;:、。！？：；，．・])/)
    .map((tok) => {
      if (!tok) return '';
      if (/^\s+$/.test(tok)) return tok;
      if (/^[.,!?;:、。！？：；，．・]+$/.test(tok)) return escape(tok);
      return `<span class="word" style="transition:color 300ms cubic-bezier(0.4,0,0.2,1);">${escape(tok)}</span>`;
    })
    .join('');
}

/**
 * container 내 `.word` span 들에 점수별 inline 색상 적용.
 * wordScores 부재·길이 불일치 시 처리:
 *   - wordScores 빈 배열/null → 전체 색상 reset (색 + 클릭 핸들러 제거)
 *   - 일부 인덱스 누락 → 해당 span 만 reset
 *
 * 옛 코드는 인덱스 매칭 (i 번째 span ↔ wordScores[i]). 동일 정책.
 *
 * options.onBadClick(word) — bad 클래스 (score<50) 단어 클릭 시 호출. 옛 mocks 의 openWordSheet 회귀 복원.
 */
export function applyWordHighlight(container, wordScores, options = {}) {
  if (!container || typeof container.querySelectorAll !== 'function') return;
  const spans = container.querySelectorAll('.word');
  if (!spans.length) return;
  const list = Array.isArray(wordScores) ? wordScores : [];
  const onBadClick = typeof options.onBadClick === 'function' ? options.onBadClick : null;
  spans.forEach((span, i) => {
    // 이전 호출의 click handler 제거 (멱등성)
    if (span.__wordClickHandler) {
      span.removeEventListener('click', span.__wordClickHandler);
      span.__wordClickHandler = null;
      span.style.cursor = '';
    }
    const entry = list[i];
    if (!entry || typeof entry.score !== 'number') {
      span.style.color = '';
      span.style.textDecoration = '';
      return;
    }
    const { color, deco, cls } = classifyScore(entry.score);
    span.style.color = color;
    span.style.textDecoration = deco;
    if (cls === 'bad' && onBadClick) {
      const handler = () => onBadClick(span.textContent || entry.word || '');
      span.addEventListener('click', handler);
      span.__wordClickHandler = handler;
      span.style.cursor = 'pointer';
    }
  });
}
