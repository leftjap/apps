import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Only the two external boundaries are replaced: Supabase and paid model processes.
// Prompts, files, verification gates and orchestration all run as production code.
const state = vi.hoisted(() => ({ entries: [], comments: [], calls: [], behavior: null, queryError: null, subscribed: null, beforeInsert: null }));
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal();
  const real = actual.default;
  return { ...actual, default: {
    ...real,
    existsSync(p) { return String(p).endsWith('/apps/today/.env.local') || real.existsSync(p); },
    readFileSync(p, ...args) {
      if (String(p).endsWith('/apps/today/.env.local')) return 'SUPABASE_URL=https://test.invalid\nSUPABASE_SERVICE_ROLE_KEY=test-only-key';
      if (String(p).endsWith('/.config/navi-daemon/oauth-token')) return 'test-only-token';
      return real.readFileSync(p, ...args);
    },
    mkdirSync(p, ...args) {
      if (String(p).endsWith('/.local/state/navi-daemon')) return;
      return real.mkdirSync(p, ...args);
    },
  } };
});
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    channel() {
      const channel = { on() { return channel; }, subscribe(fn) { state.subscribed = fn; return channel; } };
      return channel;
    },
    from(table) {
      const filters = [];
      let inserted;
      const query = {
        select() { return query; },
        eq(key, value) { filters.push(r => r[key] === value); return query; },
        is(key, value) { filters.push(r => (r[key] ?? null) === value); return query; },
        in(key, values) { filters.push(r => values.includes(r[key])); return query; },
        gte(key, value) { filters.push(r => r[key] >= value); return query; },
        order() { return query; },
        insert(row) { inserted = row; return query; },
        async single() { const r = await query; return { ...r, data: r.data?.[0] ?? null }; },
        then(resolve, reject) {
          if (state.queryError === table) return Promise.resolve({ data: null, error: { message: 'DB unavailable' } }).then(resolve, reject);
          if (inserted) {
            state.beforeInsert?.(inserted);
            if (state.comments.some(c => c.id === inserted.id)) return Promise.resolve({ data: null, error: { code: '23505' } }).then(resolve, reject);
            const row = { id: 'generated-id', created_at: new Date().toISOString(), deleted_at: null, ...inserted };
            state.comments.push(row);
            return Promise.resolve({ data: [row], error: null }).then(resolve, reject);
          }
          const rows = table === 'today_entries' ? state.entries : state.comments;
          return Promise.resolve({ data: rows.filter(r => filters.every(f => f(r))).map(r => ({ ...r })), error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  }),
}));
vi.mock('node:child_process', () => {
  const run = (...args) => {
    const result = Promise.resolve().then(() => state.behavior(...args));
    result.child = { stdin: { end() {} } };
    return result;
  };
  run[Symbol.for('nodejs.util.promisify.custom')] = run;
  return { execFile: run };
});

const BOT = 'f74a3d8a-f449-4c25-82d1-509dc70a9988';
const originalArgv = process.argv;
let exitSpy;
let logSpy;
let hook;
let claudeFailure;
let onSpy;

function aiComment(overrides = {}) {
  return { id: 'existing-ai', entry_id: 'entry-1', author_id: BOT, body: '기존 댓글', created_at: '2026-01-01T03:00:00Z', deleted_at: null, ...overrides };
}

beforeEach(() => {
  vi.resetModules();
  state.entries = [{ id: 'entry-1', kind: 'navi', title: '일기', content: '오늘 산책했다.', is_shared: true, deleted_at: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }];
  state.comments = [];
  state.calls = [];
  state.queryError = null;
  state.beforeInsert = null;
  hook = () => {};
  claudeFailure = 'error';
  state.behavior = async (file, args, options) => {
    const codex = file.endsWith('/codex');
    const prompt = codex ? args.at(-1) : args[1];
    const work = path.dirname(prompt.match(/\S+\/entry\.txt|\S+\/draft\.txt/)[0]);
    const output = codex ? args[args.indexOf('--output-last-message') + 1]
      : path.join(work, prompt.includes('verdict-fact.json') ? 'verdict-fact.json' : prompt.includes('verdict-tone.json') ? 'verdict-tone.json' : 'draft.txt');
    state.calls.push({ codex, args, options, output });
    if (!codex && claudeFailure === 'error') throw new Error('subscription inactive');
    if (!codex && claudeFailure === 'empty') return { stdout: '', stderr: '' };
    const text = /verdict-/.test(output)
      ? JSON.stringify({ ok: !(!codex && claudeFailure === 'fact'), problems: [], fix: '' })
      : '산책 한 번에 오늘의 기분도 한 바퀴 돌았네요.';
    fs.writeFileSync(output, text);
    hook({ codex, output });
    return { stdout: text, stderr: '' };
  };
  exitSpy = vi.spyOn(process, 'exit').mockImplementation(code => { throw new Error(`test exit ${code}`); });
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  process.argv = originalArgv;
  exitSpy.mockRestore();
  logSpy.mockRestore();
  onSpy?.mockRestore();
  onSpy = null;
  vi.clearAllTimers();
  vi.useRealTimers();
});
async function run(mode = '--once', extra = []) {
  process.argv = ['node', '/Users/gio_c/apps/today/scripts/navi-realtime-daemon.mjs', mode, 'entry-1', ...extra];
  await import('./navi-realtime-daemon.mjs').catch(e => {
    if (!/^test exit \d+$/.test(e.message)) throw e;
  });
}

describe('automatic comment fallback and submission guards', () => {
  it.each(['navi', 'soyoun_navi'])('uses Sol 6.1 for %s when Claude cannot run', async kind => {
    state.entries[0].kind = kind;
    await run();
    expect(state.comments).toHaveLength(1);
    expect(state.comments[0].body).toBe('[GPT‑6.1 Sol]\n\n산책 한 번에 오늘의 기분도 한 바퀴 돌았네요.');
    const calls = state.calls.filter(c => c.codex);
    expect(calls).toHaveLength(3);
    expect(calls.every(c => c.args[c.args.indexOf('--model') + 1] === 'gpt-6.1-sol')).toBe(true);
    expect(calls.every(c => c.args[c.args.indexOf('--sandbox') + 1] === 'read-only')).toBe(true);
    expect(calls.every(c => !c.options.env.CLAUDE_CODE_OAUTH_TOKEN && !c.options.env.SUPABASE_SERVICE_ROLE_KEY)).toBe(true);
  });
  it('keeps successful Claude comments and does not call Sol', async () => {
    claudeFailure = null;
    await run();
    expect(state.comments).toHaveLength(1);
    expect(state.comments[0].body).not.toContain('GPT');
    expect(state.calls.filter(c => c.codex)).toHaveLength(0);
  });
  it.each(['empty', 'fact'])('falls back when Claude produces %s output', async failure => {
    claudeFailure = failure;
    await run();
    expect(state.comments).toHaveLength(1);
    expect(state.comments[0].body).toContain('[GPT‑6.1 Sol]');
  });
  it.each([null, '2026-01-01T04:00:00Z'])('does not recreate an existing or deleted AI comment (%s)', async deleted_at => {
    state.comments = [aiComment({ deleted_at })];
    await run();
    expect(state.comments).toHaveLength(1);
    expect(state.calls).toHaveLength(0);
  });
  it('discards a draft if another AI comment arrives during generation', async () => {
    hook = ({ codex }) => { if (codex && !state.comments.length) state.comments.push(aiComment()); };
    await run();
    expect(state.comments.map(c => c.id)).toEqual(['existing-ai']);
  });
  it('discards a draft if the entry changes during generation', async () => {
    hook = ({ codex }) => { if (codex) state.entries[0].updated_at = '2026-01-01T05:00:00Z'; };
    await run();
    expect(state.comments).toHaveLength(0);
    expect(state.calls.filter(c => c.codex)).toHaveLength(3);
  });
  it.each([{ is_shared: false }, { deleted_at: '2026-01-01T05:00:00Z' }, { kind: 'memo' }, { content: '<p></p>' }])('does not generate for an ineligible entry %o', async change => {
    Object.assign(state.entries[0], change);
    await run();
    expect(state.comments).toHaveLength(0);
    expect(state.calls).toHaveLength(0);
  });
  it('fails closed when the comments query fails', async () => {
    state.queryError = 'today_comments';
    await run();
    expect(state.comments).toHaveLength(0);
    expect(state.calls).toHaveLength(0);
  });
  it('uses Sol for a pending human reply and prevents another reply to itself', async () => {
    state.comments = [aiComment(), aiComment({ id: 'human-reply', author_id: 'human', created_at: '2026-01-01T04:00:00Z' })];
    await run('--reply');
    expect(state.comments).toHaveLength(3);
    expect(state.comments[2].body).toContain('[GPT‑6.1 Sol]');
    vi.resetModules();
    await run('--reply');
    expect(state.comments).toHaveLength(3);
  });
  it('does not publish when Sol fact verification also fails', async () => {
    hook = ({ codex, output }) => {
      if (codex && output.endsWith('verdict-fact.json')) fs.writeFileSync(output, '{"ok":false,"problems":["unverified"]}');
    };
    await run();
    expect(state.comments).toHaveLength(0);
    expect(state.calls.filter(c => c.codex)).not.toHaveLength(0);
  });
  it('dry run verifies but does not insert', async () => {
    await run('--once', ['--dry-run']);
    expect(state.calls.filter(c => c.codex)).toHaveLength(3);
    expect(state.comments).toHaveLength(0);
  });
  it('treats a concurrent deterministic-ID insert as already submitted', async () => {
    state.beforeInsert = row => state.comments.push({ ...aiComment(), ...row });
    await run();
    expect(state.comments).toHaveLength(1);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
  it('does not publish a stale reply when a new human message arrives', async () => {
    state.comments = [aiComment(), aiComment({ id: 'reply-1', author_id: 'human', created_at: '2026-01-01T04:00:00Z' })];
    hook = ({ codex }) => {
      if (codex && state.comments.length === 2) state.comments.push(aiComment({ id: 'reply-2', author_id: 'human', created_at: '2026-01-01T05:00:00Z' }));
    };
    await run('--reply');
    expect(state.comments.map(c => c.id)).toEqual(['existing-ai', 'reply-1', 'reply-2']);
  });
  it('does not recreate an intentionally deleted legacy AI reply', async () => {
    state.comments = [
      aiComment(),
      aiComment({ id: 'human-reply', author_id: 'human', created_at: '2026-01-01T04:00:00Z' }),
      aiComment({ id: 'legacy-random-id', created_at: '2026-01-01T05:00:00Z', deleted_at: '2026-01-01T06:00:00Z' }),
    ];
    await run('--reply');
    expect(state.comments).toHaveLength(3);
    expect(state.calls).toHaveLength(0);
  });
});

describe('daemon scheduling', () => {
  async function start() {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T02:00:00Z'));
    onSpy = vi.spyOn(process, 'on').mockReturnValue(process);
    process.argv = ['node', '/Users/gio_c/apps/today/scripts/navi-realtime-daemon.mjs'];
    await import('./navi-realtime-daemon.mjs');
    state.subscribed('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(1);
  }
  it('waits one hour after the last edit, even when creation was earlier', async () => {
    state.entries[0].updated_at = '2026-01-01T01:30:00Z';
    await start();
    await vi.advanceTimersByTimeAsync(29 * 60 * 1000);
    expect(state.calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(60 * 1000);
    expect(state.comments).toHaveLength(1);
  });
  it('retries missed comments on the next scan without a reconnect', async () => {
    const success = state.behavior;
    state.behavior = async () => { throw new Error('all providers temporarily unavailable'); };
    await start();
    expect(state.comments).toHaveLength(0);
    state.behavior = success;
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(state.comments).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(state.comments).toHaveLength(1);
  });
});
