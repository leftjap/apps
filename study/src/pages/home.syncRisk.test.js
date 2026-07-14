// @vitest-environment jsdom
/**
 * home.syncRisk.test.js — 홈 동기화 위험 배너 (2026-07-15).
 * 거짓 경보 금지: 미푸시 대기분이 있고 24h 넘게 성공하지 못한 경우에만 노출.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const health = { value: null };
vi.mock('../db/sync.js', () => ({
  Sync: { currentSyncHealth: () => health.value },
}));

const { showSyncRisk } = await import('./home.js');
const { STALE_MS } = await import('../services/syncHealth.js');

describe('home — 동기화 위험 배너', () => {
  let host;
  beforeEach(() => {
    host = document.createElement('div');
    host.appendChild(document.createElement('main'));
    document.body.innerHTML = '';
    document.body.appendChild(host);
    health.value = null;
  });

  it('건강 기록 없음 → 배너 없음', () => {
    expect(showSyncRisk(host)).toBeNull();
    expect(host.querySelector('.sync-risk')).toBeNull();
  });

  it('대기 0 → 배너 없음 (오래 안 썼을 뿐)', () => {
    health.value = { lastOkAt: Date.now() - 10 * STALE_MS, pending: 0 };
    expect(showSyncRisk(host)).toBeNull();
  });

  it('대기 있음 + 최근 성공 → 배너 없음 (곧 올라감)', () => {
    health.value = { lastOkAt: Date.now() - 60_000, pending: 3 };
    expect(showSyncRisk(host)).toBeNull();
  });

  it('대기 있음 + 24h 넘게 실패 → 배너 노출 + 클릭 시 설정 이동', () => {
    health.value = { lastOkAt: Date.now() - (STALE_MS + 60_000), pending: 2 };
    const el = showSyncRisk(host);
    expect(el).toBeTruthy();
    expect(host.firstChild).toBe(el); // 최상단
    expect(el.textContent).toContain('이 기기에만');
    el.click();
    expect(window.location.hash).toBe('#/settings');
  });

  it('재호출 시 중복 배너 없음', () => {
    health.value = { lastOkAt: null, pending: 1 };
    showSyncRisk(host);
    showSyncRisk(host);
    expect(host.querySelectorAll('.sync-risk')).toHaveLength(1);
  });

  it('demo 모드 → 배너 없음', () => {
    health.value = { lastOkAt: null, pending: 5 };
    expect(showSyncRisk(host, true)).toBeNull();
  });
});
