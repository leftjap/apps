/**
 * Wave 11.7.3c-1 — 알림 미읽음 배지 wiring e2e
 *
 * 검증 (page.evaluate root 직접 만들기):
 *   - window.todayNotifications 노출
 *   - findAlertBellButton — .alert-dot 자식 가진 button 매칭
 *   - updateAlertBadge — recipient_id null / button 미존재 / 정상 동작 (Dexie 미접근 케이스)
 *   - applyBadge — count 0/3 → 클래스 + title 변경 (실 DOM)
 *
 * 비대상 (사용자 환경):
 *   - 실 RLS 통과 leftjap 알림 fetch (DB trigger 의존)
 *   - 실 Realtime INSERT → 배지 갱신 (별 wave)
 */
import { test, expect } from '@playwright/test';

test.describe('Wave 11.7.3c-1 알림 배지 wiring', () => {
  test('window.todayNotifications 노출 — 5 멤버', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const exposed = await page.evaluate(() => {
      const n = window.todayNotifications;
      const required = [
        'findAlertBellButton', 'updateAlertBadge', 'applyBadge',
        'mountNotificationsView', 'refreshAlertBadge',
        // Wave 11.7.3c-2
        'formatRelativeTime', 'buildNotifRowHtml',
        'injectNotifDropdownStyles', 'injectNotifDropdown',
        'renderNotifDropdown',
        'openNotifDropdown', 'closeNotifDropdown', 'toggleNotifDropdown',
        'markAllReadAndRefresh', 'installBellClickHandler',
        // Wave 11.7.3c-3
        'handleNotifClick',
        // Wave 11.7.3c-4
        'handleRealtimeNotificationChange',
      ];
      const missing = required.filter((k) => !(k in (n || {})));
      return { hasModule: !!n, missing };
    });
    expect(exposed.hasModule).toBe(true);
    expect(exposed.missing).toEqual([]);
  });

  test('findAlertBellButton — .alert-dot 자식 가진 button 매칭', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => {
      // mocks 구조 시뮬 — sb__top 안 3 button (검색 / 알림 / 사이드바 토글)
      const sbTop = document.createElement('div');
      sbTop.className = 'sb__top';
      sbTop.innerHTML = `
        <button class="sb__icon-btn" id="testSearch">
          <svg></svg>
        </button>
        <button class="sb__icon-btn sb__icon-btn--has-alert" id="testAlert">
          <svg></svg>
          <span class="alert-dot"></span>
        </button>
        <button class="sb__icon-btn" id="testToggle">
          <svg></svg>
        </button>
      `;
      document.body.appendChild(sbTop);
      const found = window.todayNotifications.findAlertBellButton();
      const result = { foundId: found?.id, allButtonCount: sbTop.querySelectorAll('button').length };
      sbTop.remove();
      return result;
    });
    expect(result.allButtonCount).toBe(3);
    expect(result.foundId).toBe('testAlert');
  });

  test('findAlertBellButton — .alert-dot 없는 환경 → null', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => {
      // 기존 sb__top 안 알림 벨 우선 비활성화 — 모든 button 의 alert-dot 제거
      const dots = [...document.querySelectorAll('.sb__top .alert-dot')];
      const removed = dots.map((d) => ({ parent: d.parentElement, dot: d }));
      removed.forEach(({ dot }) => dot.remove());
      const found = window.todayNotifications.findAlertBellButton();
      // 복구
      removed.forEach(({ parent, dot }) => parent.appendChild(dot));
      return { found: found ? found.tagName : null };
    });
    expect(result.found).toBeNull();
  });

  test('applyBadge — count > 0 → has-alert 클래스 + title 갱신', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => {
      const btn = document.createElement('button');
      btn.className = 'sb__icon-btn';
      document.body.appendChild(btn);
      const ok = window.todayNotifications.applyBadge(btn, 5);
      const result = {
        ok,
        hasClass: btn.classList.contains('sb__icon-btn--has-alert'),
        title: btn.getAttribute('title'),
      };
      btn.remove();
      return result;
    });
    expect(result.ok).toBe(true);
    expect(result.hasClass).toBe(true);
    expect(result.title).toBe('새 알림 5개');
  });

  test('applyBadge — count 0 → 클래스 제거 + title "알림"', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => {
      const btn = document.createElement('button');
      btn.className = 'sb__icon-btn sb__icon-btn--has-alert';
      btn.setAttribute('title', '새 알림 3개');
      document.body.appendChild(btn);
      window.todayNotifications.applyBadge(btn, 0);
      const result = {
        hasClass: btn.classList.contains('sb__icon-btn--has-alert'),
        title: btn.getAttribute('title'),
      };
      btn.remove();
      return result;
    });
    expect(result.hasClass).toBe(false);
    expect(result.title).toBe('알림');
  });

  test('updateAlertBadge — recipientId null → reason no_user', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(async () => {
      return await window.todayNotifications.updateAlertBadge(null);
    });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('no_user');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Wave 11.7.3c-2 — 드롭다운 UI
// ───────────────────────────────────────────────────────────────────────────

test.describe('Wave 11.7.3c-2 알림 드롭다운', () => {
  test('injectNotifDropdownStyles + injectNotifDropdown — DOM 주입 (idempotent)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => {
      // 기존 #notifDropdown 제거 + sb__top 신규 root
      document.querySelector('#notifDropdown')?.remove();
      const existing = document.querySelector('.sb__top');
      if (existing) existing.remove();
      const sbTop = document.createElement('div');
      sbTop.className = 'sb__top';
      sbTop.innerHTML = `<button class="sb__icon-btn"><span class="alert-dot"></span></button>`;
      document.body.appendChild(sbTop);
      const ok1 = window.todayNotifications.injectNotifDropdownStyles();
      const ok2 = window.todayNotifications.injectNotifDropdown();
      const dropdown = document.getElementById('notifDropdown');
      const ok3 = window.todayNotifications.injectNotifDropdown(); // idempotent
      const dropdownCount = document.querySelectorAll('#notifDropdown').length;
      const styleCount = document.querySelectorAll('#today-notif-dropdown-styles').length;
      const result = {
        ok1, ok2, ok3,
        dropdownExists: !!dropdown,
        dropdownHidden: dropdown?.hasAttribute('hidden'),
        dropdownClass: dropdown?.className,
        hasHeader: !!dropdown?.querySelector('.notif-dropdown__header'),
        hasMarkAllAction: !!dropdown?.querySelector('[data-action="mark-all-read"]'),
        hasList: !!dropdown?.querySelector('#notifDropdownList'),
        dropdownCount,
        styleCount,
        // sb__top 의 직접 자식인지
        parentClass: dropdown?.parentNode?.className,
      };
      sbTop.remove();
      return result;
    });
    expect(result.ok1).toBe(true);
    expect(result.ok2).toBe(true);
    expect(result.ok3).toBe(true);
    expect(result.dropdownExists).toBe(true);
    expect(result.dropdownHidden).toBe(true); // default hidden
    expect(result.dropdownClass).toContain('notif-dropdown');
    expect(result.hasHeader).toBe(true);
    expect(result.hasMarkAllAction).toBe(true);
    expect(result.hasList).toBe(true);
    expect(result.dropdownCount).toBe(1); // idempotent
    expect(result.styleCount).toBe(1);
    expect(result.parentClass).toBe('sb__top');
  });

  test('injectNotifDropdown — sb__top 없는 환경 → false', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => {
      // 기존 sb__top 임시 제거
      const existing = document.querySelector('.sb__top');
      const removed = existing ? { node: existing, parent: existing.parentNode } : null;
      const existingDrop = document.querySelector('#notifDropdown');
      existingDrop?.remove();
      if (removed) removed.node.remove();
      const ok = window.todayNotifications.injectNotifDropdown();
      // 복구
      if (removed) removed.parent.appendChild(removed.node);
      return ok;
    });
    expect(result).toBe(false);
  });

  test('renderNotifDropdown — 빈 알림 → "새 알림 없음"', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => {
      const root = document.createElement('div');
      root.innerHTML = `<div id="notifDropdownList"></div>`;
      document.body.appendChild(root);
      const ok = window.todayNotifications.renderNotifDropdown([]);
      const text = document.getElementById('notifDropdownList').textContent;
      const hasEmpty = !!document.querySelector('.notif-dropdown__empty');
      root.remove();
      return { ok, text, hasEmpty };
    });
    expect(result.ok).toBe(true);
    expect(result.hasEmpty).toBe(true);
    expect(result.text).toContain('새 알림 없음');
  });

  test('renderNotifDropdown — 알림 N건 → 행 N개 + preview/time + read 클래스', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => {
      const root = document.createElement('div');
      root.innerHTML = `<div id="notifDropdownList"></div>`;
      document.body.appendChild(root);
      const now = Date.now();
      const notifs = [
        { id: 'n1', entry_id: 'e1', preview: '미읽음 1', created_at: new Date(now - 5 * 60 * 1000).toISOString(), read_at: null },
        { id: 'n2', entry_id: 'e2', preview: '미읽음 2', created_at: new Date(now - 30 * 60 * 1000).toISOString(), read_at: null },
        { id: 'n3', entry_id: 'e3', preview: '읽음', created_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(), read_at: new Date(now).toISOString() },
      ];
      window.todayNotifications.renderNotifDropdown(notifs);
      const rows = [...document.querySelectorAll('.notif-dropdown__row')];
      const result = {
        rowCount: rows.length,
        ids: rows.map(r => r.getAttribute('data-notif-id')),
        entryIds: rows.map(r => r.getAttribute('data-entry-id')),
        previews: rows.map(r => r.querySelector('.notif-dropdown__preview')?.textContent),
        unreadDots: rows.map(r => r.querySelector('.notif-dropdown__unread-dot')?.classList.contains('is-read')),
      };
      root.remove();
      return result;
    });
    expect(result.rowCount).toBe(3);
    expect(result.ids).toEqual(['n1', 'n2', 'n3']);
    expect(result.entryIds).toEqual(['e1', 'e2', 'e3']);
    expect(result.previews).toEqual(['미읽음 1', '미읽음 2', '읽음']);
    expect(result.unreadDots).toEqual([false, false, true]); // n1, n2 미읽음 / n3 읽음
  });

  test('handleNotifClick — entry_id 매치 row 하이라이트 + 드롭다운 닫힘', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(async () => {
      document.querySelector('#recentsList')?.remove();
      document.querySelector('#notifDropdown')?.remove();
      const oldSbItem = document.querySelector('.sb__item[data-category="navi"]');
      oldSbItem?.remove();
      // sb__item navi (active 상태) — handleNotifClick 의 isAlreadyNavi 분기 통과
      const sbItem = document.createElement('div');
      sbItem.className = 'sb__item sb__item--active';
      sbItem.setAttribute('data-category', 'navi');
      document.body.appendChild(sbItem);
      // recents list with target row
      const sb = document.createElement('div');
      sb.className = 'sb__group';
      sb.innerHTML = `
        <div id="recentsList">
          <div class="sb__item sb__item--recent" data-doc-id="entry-other">다른 글</div>
          <div class="sb__item sb__item--recent" data-doc-id="entry-target">대상 글</div>
        </div>
      `;
      document.body.appendChild(sb);
      let sbTop = document.querySelector('.sb__top');
      let createdSbTop = false;
      if (!sbTop) {
        sbTop = document.createElement('div');
        sbTop.className = 'sb__top';
        document.body.appendChild(sbTop);
        createdSbTop = true;
      }
      window.todayNotifications.injectNotifDropdown();
      const dropdown = document.getElementById('notifDropdown');
      dropdown.removeAttribute('hidden');
      const ret = await window.todayNotifications.handleNotifClick({
        id: 'notif-test',
        entry_id: 'entry-target',
        read_at: null,
      });
      const target = document.querySelector('[data-doc-id="entry-target"]');
      const targetHighlighted = target?.classList.contains('notif-highlight');
      const dropdownHidden = dropdown.hasAttribute('hidden');
      sbItem.remove();
      sb.remove();
      if (createdSbTop) sbTop.remove();
      else dropdown.remove();
      return { ret, targetHighlighted, dropdownHidden };
    });
    expect(result.ret.ok).toBe(true);
    expect(result.ret.scrolled).toBe(true);
    expect(result.ret.entry_id).toBe('entry-target');
    expect(result.targetHighlighted).toBe(true);
    expect(result.dropdownHidden).toBe(true);
  });

  test('handleNotifClick — entry_id 미존재 row → scrolled false', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(async () => {
      document.querySelector('#recentsList')?.remove();
      document.querySelector('#notifDropdown')?.remove();
      const oldSbItem = document.querySelector('.sb__item[data-category="navi"]');
      oldSbItem?.remove();
      const sbItem = document.createElement('div');
      sbItem.className = 'sb__item sb__item--active';
      sbItem.setAttribute('data-category', 'navi');
      document.body.appendChild(sbItem);
      const sb = document.createElement('div');
      sb.className = 'sb__group';
      sb.innerHTML = `<div id="recentsList"><div class="sb__item sb__item--recent" data-doc-id="entry-A">A</div></div>`;
      document.body.appendChild(sb);
      let sbTop = document.querySelector('.sb__top');
      let createdSbTop = false;
      if (!sbTop) {
        sbTop = document.createElement('div');
        sbTop.className = 'sb__top';
        document.body.appendChild(sbTop);
        createdSbTop = true;
      }
      window.todayNotifications.injectNotifDropdown();
      const ret = await window.todayNotifications.handleNotifClick({
        id: 'n2',
        entry_id: 'entry-MISSING',
        read_at: null,
      });
      sbItem.remove();
      sb.remove();
      if (createdSbTop) sbTop.remove();
      return { ret };
    });
    expect(result.ret.ok).toBe(true);
    expect(result.ret.scrolled).toBe(false);
  });

  test('handleRealtimeNotificationChange — table mismatch / not_recipient / refreshed', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(async () => {
      // 사전 셋업 — sb__top 보장 (login 화면에선 mocks sidebar 부재)
      let sbTop = document.querySelector('.sb__top');
      let createdSbTop = false;
      if (!sbTop) {
        sbTop = document.createElement('div');
        sbTop.className = 'sb__top';
        sbTop.innerHTML = '<button class="sb__icon-btn"><span class="alert-dot"></span></button>';
        document.body.appendChild(sbTop);
        createdSbTop = true;
      }
      const fakeUser = { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' };
      await window.todayNotifications.mountNotificationsView(fakeUser);

      // 1. table mismatch
      const r1 = await window.todayNotifications.handleRealtimeNotificationChange({
        table: 'today_entries',
        new: { id: 'x' },
      });

      // 2. not_recipient (다른 user 알림)
      const r2 = await window.todayNotifications.handleRealtimeNotificationChange({
        table: 'today_notifications',
        new: { id: 'n1', recipient_id: 'OTHER-USER', preview: 'p', read_at: null },
      });

      // 3. recipient 본인 + 드롭다운 닫힌 상태 → refreshed but dropdownReloaded=false
      const r3 = await window.todayNotifications.handleRealtimeNotificationChange({
        table: 'today_notifications',
        new: { id: 'n2', recipient_id: fakeUser.id, preview: 'p', read_at: null },
      });

      // 4. 드롭다운 열린 상태 → dropdownReloaded=true
      const dropdown = document.getElementById('notifDropdown');
      const dropdownExists = !!dropdown;
      dropdown?.removeAttribute('hidden');
      const r4 = await window.todayNotifications.handleRealtimeNotificationChange({
        table: 'today_notifications',
        new: { id: 'n3', recipient_id: fakeUser.id, preview: 'p', read_at: null },
      });
      dropdown?.setAttribute('hidden', '');

      // cleanup
      if (createdSbTop) {
        dropdown?.remove();
        sbTop.remove();
      }

      return { r1, r2, r3, r4, dropdownExists };
    });
    expect(result.r1.applied).toBe(false);
    expect(result.r1.reason).toBe('table_mismatch');
    expect(result.r2.applied).toBe(false);
    expect(result.r2.reason).toBe('not_recipient');
    expect(result.r3.applied).toBe(true);
    expect(result.r3.dropdownReloaded).toBe(false);
    expect(result.r4.applied).toBe(true);
    expect(result.r4.dropdownReloaded).toBe(true);
  });

  test('closeNotifDropdown — hidden 추가', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => {
      // login 화면엔 sb__top 없음 → 동적 주입 후 dropdown injection
      document.querySelector('#notifDropdown')?.remove();
      let sbTop = document.querySelector('.sb__top');
      let createdSbTop = false;
      if (!sbTop) {
        sbTop = document.createElement('div');
        sbTop.className = 'sb__top';
        document.body.appendChild(sbTop);
        createdSbTop = true;
      }
      window.todayNotifications.injectNotifDropdown();
      const dropdown = document.getElementById('notifDropdown');
      dropdown.removeAttribute('hidden'); // 강제 open 상태
      const beforeHidden = dropdown.hasAttribute('hidden');
      const ok = window.todayNotifications.closeNotifDropdown();
      const afterHidden = dropdown.hasAttribute('hidden');
      // cleanup
      dropdown.remove();
      if (createdSbTop) sbTop.remove();
      return { beforeHidden, ok, afterHidden };
    });
    expect(result.beforeHidden).toBe(false);
    expect(result.ok).toBe(true);
    expect(result.afterHidden).toBe(true);
  });
});
