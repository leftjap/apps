/**
 * endConfirm.js — 세션 종료 확인 모달 (spec §8-7).
 *
 * showEndConfirm({ onConfirm, onCancel }) — 오버레이 + 모달 DOM 생성, body 에 append.
 * 버튼 클릭 시 자동 close + 콜백 호출.
 *
 * 디자인: 인라인 style. 토큰 (--bg, --text 등) 활용.
 */

export function showEndConfirm({ onConfirm, onCancel } = {}) {
  // 중복 진입 방지 — 이미 떠 있으면 noop
  if (document.querySelector('[data-end-confirm="1"]')) return () => {};

  const overlay = document.createElement('div');
  overlay.dataset.endConfirm = '1';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '학습 종료 확인');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:300;background:rgba(20,20,19,0.4);display:flex;align-items:center;justify-content:center;padding:24px;';

  const card = document.createElement('div');
  card.style.cssText = 'background:var(--surface);border-radius:var(--r-md);padding:28px 24px;max-width:340px;width:100%;box-shadow:var(--shadow-sm);font-family:var(--font-body);';

  const title = document.createElement('div');
  title.style.cssText = 'font-size:18px;font-weight:700;color:var(--text-strong);margin-bottom:8px;';
  title.textContent = '학습을 종료할까요?';
  card.appendChild(title);

  const msg = document.createElement('div');
  msg.style.cssText = 'font-size:14px;color:var(--text-muted);line-height:1.5;margin-bottom:24px;';
  msg.textContent = '진행 중인 학습이 종료되고 요약 화면으로 이동합니다.';
  card.appendChild(msg);

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';

  const close = () => { try { overlay.remove(); } catch { /* noop */ } };

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.dataset.action = 'cancel';
  cancelBtn.textContent = '계속하기';
  cancelBtn.style.cssText = 'background:transparent;border:1px solid var(--border);color:var(--text);padding:10px 18px;border-radius:var(--r-sm);font-size:14px;cursor:pointer;font-family:inherit;';
  cancelBtn.addEventListener('click', () => { close(); onCancel?.(); });

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.dataset.action = 'confirm';
  confirmBtn.textContent = '종료';
  confirmBtn.style.cssText = 'background:var(--accent);border:none;color:#fff;padding:10px 18px;border-radius:var(--r-sm);font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;';
  confirmBtn.addEventListener('click', () => { close(); onConfirm?.(); });

  actions.append(cancelBtn, confirmBtn);
  card.appendChild(actions);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  return close;
}
