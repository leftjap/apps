#!/usr/bin/env node
/**
 * 오늘의 네비 — 클로드 자동 댓글 Realtime 데몬.
 * service role 로 today_entries INSERT 를 구독하고, 정착(10분) 후 claude -p 헤드리스로
 * routines/ai-navi.md 지침대로 댓글을 단다. launchd KeepAlive 로 상주.
 *
 * env: today/.env.local 의 SUPABASE_URL(또는 VITE_), SUPABASE_SERVICE_ROLE_KEY, AI_COMMENT_TOKEN(워커용).
 *      ~/.config/navi-daemon/oauth-token 의 CLAUDE_CODE_OAUTH_TOKEN(claude 인증, 비용0 구독).
 */
import { createClient } from '@supabase/supabase-js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const execFileP = promisify(execFile);
const HOME = os.homedir();
const TODAY_DIR = path.join(HOME, 'apps/today');
const STATE_DIR = path.join(HOME, '.local/state/navi-daemon');
const LAST_SEEN = path.join(STATE_DIR, 'last_seen');
const TOKEN_FILE = path.join(HOME, '.config/navi-daemon/oauth-token');
const CLAUDE = '/opt/homebrew/bin/claude';
const SETTLE_MS = 10 * 60 * 1000;
const NAVI_KINDS = ['navi', 'soyoun_navi'];

function loadEnv(p) {
  const e = {};
  if (!fs.existsSync(p)) return e;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    e[m[1]] = v;
  }
  return e;
}

function log(...a) { console.log(new Date().toISOString(), ...a); }

const env = loadEnv(path.join(TODAY_DIR, '.env.local'));
const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
let OAUTH_TOKEN = '';
try { OAUTH_TOKEN = fs.readFileSync(TOKEN_FILE, 'utf8').trim(); } catch { log('WARN: oauth-token 파일 없음'); }
if (!SUPABASE_URL || !SERVICE_KEY) { log('FATAL: SUPABASE_URL / SERVICE_ROLE_KEY 누락'); process.exit(1); }

fs.mkdirSync(STATE_DIR, { recursive: true });

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const seen = new Set();

function readLastSeen() { try { return fs.readFileSync(LAST_SEEN, 'utf8').trim(); } catch { return null; } }
function writeLastSeen(ts) { try { fs.writeFileSync(LAST_SEEN, ts); } catch (e) { log('last_seen write err', e.message); } }

function schedule(row) {
  if (!row || !NAVI_KINDS.includes(row.kind)) return;
  if (seen.has(row.id)) return;
  seen.add(row.id);
  const age = Date.now() - new Date(row.created_at).getTime();
  const delay = Math.max(0, SETTLE_MS - age);
  log(`schedule ${row.id} kind=${row.kind} delay=${Math.round(delay / 1000)}s`);
  setTimeout(() => { runClaude(row); }, delay);
}

async function runClaude(row) {
  log(`run ${row.id}`);
  const prompt = [
    '너는 투데이 앱 "오늘의 네비" 댓글 봇 클로드다.',
    `${TODAY_DIR}/routines/ai-navi.md 의 지침을 읽고 그대로 따른다. 대상 글 entry_id=${row.id}.`,
    `절차: (1) \`node scripts/ai-navi-comment.mjs fetch --entry ${row.id}\` 실행해 대상과 mode(initial|reply)를 확인한다. 결과가 빈 배열이면 이미 처리된 글이니 아무것도 하지 말고 즉시 종료한다.`,
    '(2) ai-navi.md 의 두 지침(유머·개그·과장·비유 피드백 + 최신 연구/학문 보강)대로 댓글 본문을 직접 작성한다. mode 가 reply 면 comments 이력을 이어 사람의 마지막 댓글에 답한다.',
    `(3) \`node scripts/ai-navi-comment.mjs insert --entry ${row.id} --body "<작성한 댓글>"\` 로 등록한다. 댓글 텍스트는 네가 직접 쓴다(스크립트는 DB 입출력만).`,
  ].join('\n');
  try {
    const { stdout } = await execFileP(
      CLAUDE,
      ['-p', prompt, '--allowedTools', 'Read,Bash', '--permission-mode', 'bypassPermissions'],
      {
        cwd: TODAY_DIR,
        env: { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: OAUTH_TOKEN, HOME, PATH: '/opt/homebrew/bin:/usr/bin:/bin' },
        timeout: 300000,
        maxBuffer: 10 * 1024 * 1024,
      }
    );
    log(`done ${row.id}: ${String(stdout).slice(-300)}`);
    writeLastSeen(row.created_at);
  } catch (e) {
    log(`ERROR ${row.id}: ${e.message}`);
    seen.delete(row.id);
  }
}

async function catchUp() {
  const last = readLastSeen();
  // 첫 실행(last_seen 없음): 기존 글 보호 위해 catchup 건너뛰고 기준 시각만 기록. 이후 새 글만 처리.
  if (!last) { writeLastSeen(new Date().toISOString()); log('first run: last_seen 초기화 — catchup 건너뜀(기존 글 보호)'); return; }
  const { data, error } = await sb.from('today_entries')
    .select('id,kind,created_at').in('kind', NAVI_KINDS)
    .gt('created_at', last).order('created_at', { ascending: true });
  if (error) { log('catchup err', error.message); return; }
  log(`catchup: ${data.length} entries (since ${last})`);
  for (const row of data) schedule(row);
}

sb.channel('navi-daemon')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'today_entries' }, (p) => {
    log('INSERT', p.new?.id, p.new?.kind);
    schedule(p.new);
  })
  .subscribe((s) => { log('realtime:', s); if (s === 'SUBSCRIBED') catchUp(); });

process.on('SIGTERM', () => { log('SIGTERM'); process.exit(0); });
process.on('SIGINT', () => { log('SIGINT'); process.exit(0); });
log('navi-daemon started');
