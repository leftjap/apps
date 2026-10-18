import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, it, expect } from 'vitest';

async function click(data, windows = []) {
  const handlers = {}, opened = [], navigated = [], focused = [];
  const self = {
    registration: { scope: 'https://example.test/apps/today/' }, navigator: {},
    clients: { matchAll: async () => windows.map((url) => ({ url, focus: async () => focused.push(url), navigate: async (next) => navigated.push(next) })), openWindow: async (url) => opened.push(url) },
    addEventListener: (type, handler) => { handlers[type] = handler; },
  };
  runInNewContext(readFileSync(new URL('../public/push-sw.js', import.meta.url), 'utf8'), { self, URL });
  let task;
  handlers.notificationclick({ notification: { data, close() {} }, waitUntil: (promise) => { task = promise; } });
  await task;
  return { opened, navigated, focused };
}

describe('expense warning navigation', () => {
  it('opens the expense tab when a health alert is tapped', async () => {
    expect((await click({ section: 'expense' })).opened).toEqual(['https://example.test/apps/today/#/expense']);
  });
  it('navigates an existing app window and ignores other pages under the origin', async () => {
    const result = await click({ section: 'expense' }, ['https://example.test/apps/study/', 'https://example.test/apps/today/#/navi']);
    expect(result.navigated).toEqual(['https://example.test/apps/today/#/expense']);
    expect(result.focused).toEqual(['https://example.test/apps/today/#/navi']);
  });
  it('preserves the normal comment/post window focus behavior', async () => {
    const result = await click({ entryId: 'example' }, ['https://example.test/apps/today/#/navi/17']);
    expect(result.focused).toHaveLength(1);
    expect(result.navigated).toEqual([]);
    expect((await click({ entryId: 'example' })).opened).toEqual(['https://example.test/apps/today/']);
  });
});
