/**
 * wordSheet.js — 단어 클릭 시 음소 점수 + 약점 음소 표시 (spec §8 — 옛 mocks/session.html 회귀 복원).
 *
 * showWordSheet({ word, phonemeScores, onClose })
 *   - word          : string (구두점 제거 후 매칭)
 *   - phonemeScores : [{ symbol, word, score }, ...] — Azure analyzeWavRest 결과
 *   - onClose       : optional callback
 *
 * 단어의 음소 평균 + 70 미만 음소 (약점) 표시.
 * endConfirm.js modal 패턴 답습 — overlay + card + body append.
 */

export function showWordSheet({ word, phonemeScores, onClose } = {}) {
  if (document.querySelector('[data-word-sheet="1"]')) return () => {};

  const clean = String(word || '').replace(/[.,!?;:、。！？：；，．・]/g, '').trim();
  const list = Array.isArray(phonemeScores) ? phonemeScores : [];
  const matched = list.filter((p) => {
    if (!p?.word) return false;
    return p.word === clean || p.word.toLowerCase() === clean.toLowerCase();
  });

  let sub;
  if (matched.length > 0) {
    const avg = Math.floor(matched.reduce((s, p) => s + (Number(p.score) || 0), 0) / matched.length);
    const weak = matched.filter((p) => (Number(p.score) || 0) < 70).map((p) => p.symbol).filter(Boolean);
    sub = weak.length > 0 ? `평균 ${avg} / 100 · 약점 음소 ${weak.join(', ')}` : `평균 ${avg} / 100`;
  } else {
    sub = '음소 점수 없음';
  }

  const overlay = document.createElement('div');
  overlay.dataset.wordSheet = '1';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', `${clean} 음소 점수`);
  overlay.style.cssText = 'position:fixed;inset:0;z-index:300;background:rgba(20,20,19,0.4);display:flex;align-items:flex-end;justify-content:center;';

  const card = document.createElement('div');
  card.style.cssText = 'background:var(--surface);border-radius:var(--r-md) var(--r-md) 0 0;padding:24px 20px 32px;max-width:430px;width:100%;box-shadow:var(--shadow-sm);font-family:var(--font-body);';

  const title = document.createElement('div');
  title.dataset.role = 'word-title';
  title.style.cssText = 'font-size:20px;font-weight:700;color:var(--text-strong);margin-bottom:6px;';
  title.textContent = `"${clean}"`;
  card.appendChild(title);

  const subEl = document.createElement('div');
  subEl.dataset.role = 'word-sub';
  subEl.style.cssText = 'font-size:13px;color:var(--text-muted);line-height:1.5;margin-bottom:20px;';
  subEl.textContent = sub;
  card.appendChild(subEl);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.dataset.action = 'close';
  closeBtn.textContent = '닫기';
  closeBtn.style.cssText = 'background:var(--accent);border:none;color:#fff;padding:10px 18px;border-radius:var(--r-sm);font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;width:100%;';

  const close = () => { try { overlay.remove(); } catch { /* noop */ } };
  closeBtn.addEventListener('click', () => { close(); onClose?.(); });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) { close(); onClose?.(); } });

  card.appendChild(closeBtn);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  return close;
}
