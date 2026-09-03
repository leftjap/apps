/**
 * seed-supabase.test.mjs — 서버 게이트 입력이 id 기준 행을 포함하는지 고정 (2026-09-03).
 *
 * 배경: completed 게이트가 같은 (lang, date) 행만 봐서, 서버 행 날짜가 바뀐 뒤 옛 날짜 파일을 다시 올리면
 * 검사를 건너뛰고 upsert 가 completed=false 로 학습 기록을 되돌렸다 (en 코어100 1~6: 파일 08-26 vs 서버 08-31).
 * 네트워크는 fetch 스텁으로 대신한다. 사후 회귀 테스트 — 수정과 같은 날 dry-run 실측(차단)으로 먼저 검증했다.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchGuardRows } from './seed-supabase.mjs';
import { evaluateServerGuards } from './validate-seed.mjs';

const URL_ = 'https://x.supabase.co';
const payload = { lang: 'en', date: '2026-08-26', cards: [{ id: 'a' }, { id: 'b' }] };

function stubFetch(byDate, byId) {
  const fn = vi.fn(async (url) => {
    const u = String(url);
    const rows = u.includes('date=eq.') ? byDate : u.includes('id=in.') ? byId : [];
    return { ok: true, status: 200, statusText: 'OK', headers: new Headers(), text: async () => JSON.stringify(rows) };
  });
  globalThis.fetch = fn;
  return fn;
}
afterEach(() => { vi.restoreAllMocks(); });

describe('seed-supabase — 서버 게이트 입력은 id 기준 행을 포함한다', () => {
  it('날짜가 다른 완료 행도 게이트에 들어가 completed 게이트가 차단한다 (사고 재현)', async () => {
    stubFetch([], [{ id: 'a', completed: true }, { id: 'b', completed: false }]);
    const { preRows, idRows, guardRows } = await fetchGuardRows(URL_, 'key', 'user', payload);
    expect(preRows).toEqual([]); // 옛 날짜로는 아무 행도 안 잡힌다 — 이게 사고의 원인이었다
    expect(idRows.length).toBe(2);
    const r = evaluateServerGuards({ serverRows: guardRows, payloadIds: new Set(['a', 'b']) });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('completed 게이트: a');
  });

  it('같은 날짜 행과 id 행이 겹치면 한 번만 넣는다', async () => {
    stubFetch([{ id: 'a', completed: false }], [{ id: 'a', completed: false }, { id: 'b', completed: false }]);
    const { guardRows } = await fetchGuardRows(URL_, 'key', 'user', payload);
    expect(guardRows.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('조회는 날짜 1회 + id 목록 1회이며 id 조회는 payload 전 id 를 담는다', async () => {
    const fn = stubFetch([], []);
    await fetchGuardRows(URL_, 'key', 'user', payload);
    expect(fn).toHaveBeenCalledTimes(2);
    const urls = fn.mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toContain('lang=eq.en&date=eq.2026-08-26');
    expect(urls[1]).toContain('id=in.("a","b")');
  });
});
