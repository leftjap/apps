#!/usr/bin/env node
/**
 * 오늘의 네비 — 클로드 자동 댓글 Realtime 데몬.
 * service role 로 today_entries INSERT 를 구독하고, 정착(1시간) 후 claude -p 헤드리스로
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
import { selectPendingInitial } from './navi-pending.mjs';

const execFileP = promisify(execFile);
const HOME = os.homedir();
const TODAY_DIR = path.join(HOME, 'apps/today');
const STATE_DIR = path.join(HOME, '.local/state/navi-daemon');
const TOKEN_FILE = path.join(HOME, '.config/navi-daemon/oauth-token');
const CLAUDE = '/opt/homebrew/bin/claude';
const SETTLE_MS = Number(process.env.NAVI_SETTLE_MS) || 60 * 60 * 1000;
const NAVI_KINDS = ['navi', 'soyoun_navi'];
// 클로드 자동 댓글 author (supabase/migrations 의 CLAUDE id 와 동일).
const CLAUDE_AUTHOR_ID = 'f74a3d8a-f449-4c25-82d1-509dc70a9988';
// catchUp 재포착 윈도 — 클라우드 함수 today_ai_has_pending() 과 동일한 최근 3일.
const CATCHUP_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

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
  // settle 재확인: 마지막 수정(updated_at) 후 SETTLE_MS 경과해야 정착. 작성 중이면 재스케줄.
  const { data: cur, error: ce } = await sb.from('today_entries').select('updated_at, deleted_at').eq('id', row.id).single();
  if (ce || !cur || cur.deleted_at) { log(`skip ${row.id} (삭제/조회 실패)`); seen.delete(row.id); return; }
  const sinceUpdate = Date.now() - new Date(cur.updated_at).getTime();
  if (sinceUpdate < SETTLE_MS) {
    const wait = SETTLE_MS - sinceUpdate;
    log(`reschedule ${row.id}: 마지막 수정 후 ${Math.round(sinceUpdate / 1000)}s → 정착까지 ${Math.round(wait / 1000)}s 대기`);
    setTimeout(() => { runClaude(row); }, wait);
    return;
  }
  log(`run ${row.id}`);
  const prompt = [
    '너는 투데이 앱 "오늘의 네비" 댓글 봇 클로드다.',
    `${TODAY_DIR}/routines/ai-navi.md 의 지침과 절차를 읽고 그대로 따른다. 대상 글 entry_id=${row.id}.`,
    '환경변수 SUPABASE_URL, AI_COMMENT_TOKEN, SUPABASE_ANON_KEY 는 이미 설정돼 있다 — ai-navi.md 의 edge fn `ai-comment` curl 을 그대로 쓴다(별도 워커 스크립트 호출 금지).',
    `절차: (1) context 호출 — 본문 {"action":"context","entry_id":"${row.id}"}. 대상과 mode(initial|reply)를 확인한다. 빈 배열이면 이미 처리된 글이니 아무것도 하지 말고 즉시 종료한다.`,
    '(2) ai-navi.md 의 두 지침(유머·개그·과장·비유 피드백 + 최신 연구/학문 보강)대로 댓글 본문을 직접 작성한다. mode 가 reply 면 comments 이력을 이어 사람의 마지막 댓글에 답한다.',
    `(3) submit 호출 — 본문 {"action":"submit","entry_id":"${row.id}","body":"<작성한 댓글>"} (jq 로 안전 인코딩). 댓글 텍스트는 네가 직접 쓴다.`,
  ].join('\n');
  try {
    const { stdout } = await execFileP(
      CLAUDE,
      ['-p', prompt, '--allowedTools', 'Read,Bash', '--permission-mode', 'bypassPermissions'],
      {
        cwd: TODAY_DIR,
        env: {
          ...process.env,
          CLAUDE_CODE_OAUTH_TOKEN: OAUTH_TOKEN,
          // edge fn ai-comment 호출용(저권한 토큰·공개 anon·URL). service role 키는 주입 안 함(함수 안에만).
          SUPABASE_URL,
          AI_COMMENT_TOKEN: env.AI_COMMENT_TOKEN || '',
          SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '',
          HOME,
          PATH: '/opt/homebrew/bin:/usr/bin:/bin',
        },
        timeout: 300000,
        maxBuffer: 10 * 1024 * 1024,
      }
    );
    log(`done ${row.id}: ${String(stdout).slice(-300)}`);
  } catch (e) {
    log(`ERROR ${row.id}: ${e.message}`);
  } finally {
    // 시도 완료(성공/빈결과/에러) → in-flight 해제. 다음 catchUp 이 '실제 클로드 댓글 유무' 로
    // 재판단하므로 첫 시도가 댓글을 못 만들어도 다음 스캔에서 자동 재시도된다(회귀 수정).
    seen.delete(row.id);
  }
}

async function catchUp() {
  // 회귀 수정(2026-06-22): last_seen 고수위 대신 '클로드 댓글 없는 적격 글' 을 실제 DB 상태로 재포착.
  // (구버전은 created_at > last_seen 라, 첫 시도 실패로 last_seen 이 그 글 시각까지 전진하면 영구 누락)
  const since = new Date(Date.now() - CATCHUP_WINDOW_MS).toISOString();
  const { data: entries, error } = await sb.from('today_entries')
    .select('id,kind,created_at,is_shared,content,deleted_at')
    .in('kind', NAVI_KINDS).is('deleted_at', null).eq('is_shared', true)
    .gte('created_at', since).order('created_at', { ascending: true });
  if (error) { log('catchup err', error.message); return; }
  const ids = entries.map((e) => e.id);
  let commented = new Set();
  if (ids.length) {
    // 삭제 이력 포함 클로드 댓글(일부러 지운 댓글은 부활 금지) → deleted_at 필터 없음.
    const { data: cmts, error: ce } = await sb.from('today_comments')
      .select('entry_id').eq('author_id', CLAUDE_AUTHOR_ID).in('entry_id', ids);
    if (ce) { log('catchup comments err', ce.message); return; }
    commented = new Set(cmts.map((c) => c.entry_id));
  }
  const pending = selectPendingInitial(entries, commented, { windowMs: CATCHUP_WINDOW_MS, nowMs: Date.now() });
  log(`catchup: navi ${entries.length}건 중 미답 ${pending.length}건`);
  const byId = new Map(entries.map((e) => [e.id, e]));
  for (const id of pending) schedule(byId.get(id));
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
