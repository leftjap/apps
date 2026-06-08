import { describe, it, expect } from 'vitest';
import { createScheduler } from './reco-scheduler.js';

// 제어 가능한 run: 각 호출의 resolve 를 외부에서 당겨 완료 시점을 통제.
function deferredRun() {
  const calls = [];
  const run = (ownerId) => new Promise((resolve) => { calls.push({ ownerId, resolve }); });
  return { run, calls };
}
// loop 의 do/while 연속(await 사이 동기 구간)을 흘려보내는 마이크로태스크 플러시.
async function tick() { for (let i = 0; i < 4; i++) await Promise.resolve(); }

describe('reco-scheduler 코얼레싱', () => {
  it('idle 요청 1회 → run 1회, 완료 후 idle', async () => {
    const { run, calls } = deferredRun();
    const s = createScheduler(run);
    s.request('A');
    expect(calls.length).toBe(1);
    expect(s.isRunning('A')).toBe(true);
    calls[0].resolve(); await tick();
    expect(s.isRunning('A')).toBe(false);
  });

  it('실행 중 다중 요청(연타) → 추가 run 정확히 1회로 흡수', async () => {
    const { run, calls } = deferredRun();
    const s = createScheduler(run);
    s.request('A');           // run #1 시작
    s.request('A');           // 진행 중 → pending
    s.request('A');           // 흡수(여전히 pending 1개)
    expect(calls.length).toBe(1);
    expect(s.isPending('A')).toBe(true);
    calls[0].resolve(); await tick();   // #1 완료 → pending 으로 #2
    expect(calls.length).toBe(2);
    calls[1].resolve(); await tick();   // #2 완료 → pending 없음 → 종료
    expect(calls.length).toBe(2);
    expect(s.isRunning('A')).toBe(false);
  });

  it('완료 후 재요청 → 별도 run (직렬)', async () => {
    const { run, calls } = deferredRun();
    const s = createScheduler(run);
    s.request('A'); calls[0].resolve(); await tick();
    s.request('A');
    expect(calls.length).toBe(2);
  });

  it('owner 격리 — A 실행 중 B 요청은 즉시 run', async () => {
    const { run, calls } = deferredRun();
    const s = createScheduler(run);
    s.request('A');           // run #1 (A)
    s.request('B');           // run #2 (B) — 격리, 즉시
    expect(calls.length).toBe(2);
    expect(calls.map((c) => c.ownerId)).toEqual(['A', 'B']);
  });

  it('run 이 throw 해도 다음 pending 은 처리 (데몬 안 죽음)', async () => {
    let n = 0;
    const run = () => { n++; return n === 1 ? Promise.reject(new Error('boom')) : Promise.resolve(); };
    const s = createScheduler(run);
    s.request('A');           // #1 reject
    s.request('A');           // pending → #2
    await tick();
    expect(n).toBe(2);
    expect(s.isRunning('A')).toBe(false);
  });
});
