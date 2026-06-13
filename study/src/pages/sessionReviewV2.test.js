// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderSessionReviewV2 } from './sessionReviewV2.js';

function renderEmpty(size) {
  document.body.innerHTML = '<div id="root"></div>';
  const host = document.getElementById('root');
  renderSessionReviewV2(host, { cards: [], total: 0, step: 1, size }, {});
  return host;
}

describe('renderSessionReviewV2 — 빈 상태(total=0) 반응형', () => {
  it('모바일(phone) 빈 상태는 데스크톱 레일(.vr-rail) 대신 모바일 셸(.m-topb)을 렌더한다', () => {
    const host = renderEmpty('phone');
    expect(host.querySelector('.vr-rail')).toBeNull();        // 데스크톱 88px 레일 없어야
    expect(host.querySelector('.vr-main')).toBeNull();        // width:760px 본문 없어야 (375 팽창 원인)
    expect(host.querySelector('.m-topb')).not.toBeNull();     // 모바일 상단바 있어야
    expect(host.textContent).toContain('복습할 문장이 없어요'); // 메시지 유지
  });

  it('데스크톱(desktop) 빈 상태는 기존 레일(.vr-rail)을 그대로 유지한다', () => {
    const host = renderEmpty('desktop');
    expect(host.querySelector('.vr-rail')).not.toBeNull();
    expect(host.textContent).toContain('복습할 문장이 없어요');
  });
});
