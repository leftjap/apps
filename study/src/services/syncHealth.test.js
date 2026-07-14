// @vitest-environment jsdom
/**
 * syncHealth.test.js — 동기화 실패 가시화 (2026-07-14 gym 데이터 소실 사고의 study 판).
 *
 * gym 은 4일간 클라우드 sync 가 멈췄는데(로그인 끊김) 앱은 계속 "정상"으로 보였다.
 * study 는 settings 에 '마지막 동기화 —' 자리(#syncTime)만 있고 채우는 코드가 없었다 (거짓 UI).
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readSyncHealth, recordSyncResult, syncStatus, STALE_MS } from './syncHealth.js';

const USER = 'user-1';
const NOW = 1_760_000_000_000;

describe('syncHealth — 기록/판정', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('기록 없음 → unknown ("—")', () => {
    expect(readSyncHealth(USER)).toBeNull();
    const s = syncStatus(null, NOW);
    expect(s.level).toBe('unknown');
    expect(s.text).toContain('—');
  });

  it('성공 기록 → ok + 상대 시각', () => {
    recordSyncResult(USER, { ok: true, pending: 0, at: NOW });
    const h = readSyncHealth(USER);
    expect(h.lastOkAt).toBe(NOW);
    const s = syncStatus(h, NOW + 5 * 60 * 1000);
    expect(s.level).toBe('ok');
    expect(s.text).toContain('5분 전');
  });

  it('미푸시 대기 + 최근 성공 → pending (경고 아님)', () => {
    recordSyncResult(USER, { ok: true, pending: 0, at: NOW });
    recordSyncResult(USER, { ok: false, pending: 3, error: 'network', at: NOW + 1000 });
    const s = syncStatus(readSyncHealth(USER), NOW + 60 * 1000);
    expect(s.level).toBe('pending');
    expect(s.text).toContain('3건');
  });

  it('미푸시 대기 + 마지막 성공이 24h 초과 → risk (이 기기에만 있음)', () => {
    recordSyncResult(USER, { ok: true, pending: 0, at: NOW });
    recordSyncResult(USER, { ok: false, pending: 2, error: 'auth', at: NOW + STALE_MS + 1000 });
    const s = syncStatus(readSyncHealth(USER), NOW + STALE_MS + 2000);
    expect(s.level).toBe('risk');
    expect(s.text).toContain('이 기기에만');
  });

  it('성공 기록이 아예 없는데 대기분 존재 → risk', () => {
    recordSyncResult(USER, { ok: false, pending: 1, error: 'network', at: NOW });
    const s = syncStatus(readSyncHealth(USER), NOW + 1000);
    expect(s.level).toBe('risk');
  });

  it('대기 0 + 오래된 성공 → ok (쓰기가 없었을 뿐, 경고 금지)', () => {
    recordSyncResult(USER, { ok: true, pending: 0, at: NOW });
    const s = syncStatus(readSyncHealth(USER), NOW + 5 * STALE_MS);
    expect(s.level).toBe('ok');
  });

  it('성공 시 pending 이 0 으로 갱신 (직전 실패 잔상 제거)', () => {
    recordSyncResult(USER, { ok: false, pending: 4, error: 'network', at: NOW });
    recordSyncResult(USER, { ok: true, pending: 0, at: NOW + 1000 });
    const h = readSyncHealth(USER);
    expect(h.pending).toBe(0);
    expect(syncStatus(h, NOW + 2000).level).toBe('ok');
  });

  it('localStorage 접근 불가 → throw 없이 null', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readSyncHealth(USER)).toBeNull();
  });
});
