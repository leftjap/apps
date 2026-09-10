// 알라딘 클라이언트 오류 문구 — 프록시(pick/supabase/functions/aladin/index.ts)가 상류(알라딘)를 8초에 끊고 카카오 페일오버도
// 실패하면 504·502 JSON 을 주는 계약(2026-09-11). add-edit.js 가 e.message 를 그대로 화면에 보인다.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { searchBooks, lookupByIsbn } from './aladin.js';

const realFetch = global.fetch;
function mockStatus(status) {
  global.fetch = vi.fn(async () => ({ ok: status < 400, status, json: async () => ({ error: 'aladin upstream timeout' }) }));
}
afterEach(() => { global.fetch = realFetch; });

describe('프록시 오류 상태 → 문구', () => {
  it('504(상류 시간 초과) → "알라딘 응답 없음"', async () => {
    mockStatus(504);
    await expect(searchBooks('서성이다')).rejects.toThrow('알라딘 응답 없음');
  });
  it('502(상류 연결 실패) → "알라딘 응답 없음"', async () => {
    mockStatus(502);
    await expect(lookupByIsbn('9791167903792')).rejects.toThrow('알라딘 응답 없음');
  });
  it('그 밖의 실패 상태(알라딘 자체 503)는 기존 문구 유지', async () => {
    mockStatus(503);
    await expect(searchBooks('서성이다')).rejects.toThrow('알라딘 API 응답 503');
  });
});
