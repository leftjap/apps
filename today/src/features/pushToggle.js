/**
 * 설정 메뉴 "댓글 알림" 토글 — Web Push 구독 on/off + 상태 반영.
 *
 * mocks #settingsMenu 의 #pushToggleItem(=data-action 없음 → openAccModal 우회) 에 배선.
 * 클릭 시 구독/해제, 라벨(.shortcut)에 켜짐/꺼짐/권한거부/미지원 반영.
 * 테스트: opts 로 doc / enablePush / disablePush / getPushStatus 주입.
 */
import { enablePush as _enablePush, disablePush as _disablePush, getPushStatus as _getPushStatus } from '../services/push.js';

/** 구독 상태 → 메뉴 라벨/동작. 순수 함수. */
export function pushToggleLabel(status) {
  if (!status || !status.supported) return { text: '댓글 알림', sub: '알림 미지원', on: false, disabled: true };
  if (status.permission === 'denied') return { text: '댓글 알림', sub: '권한 거부됨', on: false, disabled: true };
  if (status.subscribed) return { text: '댓글 알림', sub: '켜짐', on: true, disabled: false };
  return { text: '댓글 알림', sub: '꺼짐', on: false, disabled: false };
}

async function applyState(item, getPushStatus) {
  const status = await getPushStatus();
  const label = pushToggleLabel(status);
  item.setAttribute('aria-checked', String(label.on));
  if (label.disabled) item.setAttribute('aria-disabled', 'true');
  else item.removeAttribute && item.removeAttribute('aria-disabled');
  const sub = item.querySelector('.shortcut') || item.querySelector('#pushToggleState');
  if (sub) sub.textContent = label.sub;
  return { status, label };
}

/** #pushToggleItem 에 상태 반영 + 클릭 배선. 반환: { found, label? }. */
export async function mountPushToggle(user, opts = {}) {
  const doc = opts.doc || (typeof document !== 'undefined' ? document : null);
  if (!doc) return { found: false };
  const item = doc.getElementById('pushToggleItem');
  if (!item) return { found: false };

  const enablePush = opts.enablePush || _enablePush;
  const disablePush = opts.disablePush || _disablePush;
  const getPushStatus = opts.getPushStatus || _getPushStatus;

  const { label } = await applyState(item, getPushStatus);

  item.addEventListener('click', async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const cur = await getPushStatus();
    if (pushToggleLabel(cur).disabled) return;
    try {
      if (cur.subscribed) await disablePush();
      else await enablePush(user);
    } catch (err) {
      console.warn('[pushToggle] 토글 실패', err && err.message);
    }
    await applyState(item, getPushStatus);
  });

  return { found: true, label };
}
