#!/usr/bin/env node
/**
 * pick 추천 — 로컬 Realtime 데몬 (Today navi-realtime-daemon 미러).
 * service role 로 DB 를 구독하다가 트리거가 오면 `claude -p` 헤드리스를 띄워
 * routines/pick-reco.md 지침대로 추천을 재생성한다. launchd KeepAlive 로 상주.
 *
 * 트리거:
 *   - pick_reco_requests INSERT  → home("다시 추천" 버튼) 또는 branch(상세페이지 갈래, kind+source_work)
 *   - pick_ratings INSERT         → 홈 재생성(디바운스) + ★3.0+ 새 평가면 그 작품 갈래 생성
 * 키별 코얼레싱(연타 흡수)은 reco-scheduler.js(단위테스트), 동시 claude -p 1개로 전역 직렬화(rate limit 보호).
 *
 * 비용 0: claude 인증은 CLAUDE_CODE_OAUTH_TOKEN(지오 구독). Anthropic API 키 아님.
 *
 * env (파일에서 자동 로드):
 *   ~/.config/study/.env      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (공유 프로젝트)
 *   ~/.config/pick/.env      PICK_RECO_TOKEN (edge fn 저권한 토큰 — claude 에 전달)
 *   pick/.env.local          VITE_SUPABASE_ANON_KEY (게이트웨이 공개 키 — claude 에 전달)
 *   ~/.config/navi-daemon/oauth-token   CLAUDE_CODE_OAUTH_TOKEN (구독 인증, Today 와 공유)
 */
import { createClient } from '@supabase/supabase-js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createScheduler } from './reco-scheduler.js';

const execFileP = promisify(execFile);
const HOME = os.homedir();
const PICK_DIR = path.join(HOME, 'apps/pick');
const STATE_DIR = path.join(HOME, '.local/state/pick-reco-daemon');
const TOKEN_FILE = path.join(HOME, '.config/navi-daemon/oauth-token');
const CLAUDE = '/opt/homebrew/bin/claude';
const RATING_DEBOUNCE_MS = Number(process.env.PICK_RATING_DEBOUNCE_MS) || 90 * 1000;
const RUN_TIMEOUT_MS = 12 * 60 * 1000;   // claude -p 1회 상한(WebSearch 실재검증 ~10건이 오래 걸림)

function loadEnvFile(p) {
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

const study = loadEnvFile(path.join(HOME, '.config/study/.env'));
const pickCfg = loadEnvFile(path.join(HOME, '.config/pick/.env'));
const envLocal = loadEnvFile(path.join(PICK_DIR, '.env.local'));

const SUPABASE_URL = study.SUPABASE_URL || envLocal.VITE_SUPABASE_URL;
const SERVICE_KEY = study.SUPABASE_SERVICE_ROLE_KEY;
const PICK_RECO_TOKEN = pickCfg.PICK_RECO_TOKEN;
const ANON_KEY = envLocal.VITE_SUPABASE_ANON_KEY;
let OAUTH_TOKEN = '';
try { OAUTH_TOKEN = fs.readFileSync(TOKEN_FILE, 'utf8').trim(); } catch { log('WARN: oauth-token 파일 없음 — claude 인증 실패할 수 있음'); }

if (!SUPABASE_URL || !SERVICE_KEY) { log('FATAL: SUPABASE_URL / SERVICE_ROLE_KEY 누락'); process.exit(1); }
if (!PICK_RECO_TOKEN || !ANON_KEY) { log('FATAL: PICK_RECO_TOKEN / ANON_KEY 누락'); process.exit(1); }

fs.mkdirSync(STATE_DIR, { recursive: true });
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ── 작업(job) 추적 + 코얼레싱 키 ───────────────────────────────────────
// home = owner 1개. branch = owner×출발작품(source_work). 키로 같은 작품 중복 생성 방지.
const jobs = new Map();   // key → { ownerId, kind, sourceWork }
function keyFor(ownerId, kind, sourceWork) {
  return kind === 'branch' ? `branch::${ownerId}::${sourceWork}` : `home::${ownerId}`;
}
function enqueue(ownerId, kind, sourceWork, source) {
  if (!ownerId) return;
  const k = kind === 'branch' ? 'branch' : 'home';
  if (k === 'branch' && !sourceWork) return;
  const key = keyFor(ownerId, k, sourceWork || '');
  jobs.set(key, { ownerId, kind: k, sourceWork: sourceWork || null, low: source === 'backfill' });
  scheduler.request(key);
}

// claude -p 공통 인자. MCP·user 설정 미로드(--strict-mcp-config/--setting-sources project) → 헤드리스 집중·기동 단축.
const claudeArgs = (prompt) => ['-p', prompt,
  '--allowedTools', 'Read,Bash,WebSearch',
  '--permission-mode', 'bypassPermissions',
  '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
  '--setting-sources', 'project'];

function homePrompt(ownerId) {
  return [
    '너는 pick 앱의 개인 취향 추천 엔진 클로드다. 아래 4단계만 수행하고 종료한다(다른 작업·스킬 호출 금지).',
    `${PICK_DIR}/routines/pick-reco.md 의 원칙·검증·호출법을 따른다. 대상 owner_id=${ownerId}. 이번엔 홈 추천만(kind=home).`,
    `(1) pick-reco context 를 owner_id=${ownerId} 로 호출해 평가를 받는다(빈 배열이면 즉시 종료).`,
    '(2) ★3.5+ positive / ★2↓·0.5 negative 패턴을 분석해 홈 후보를 만든다: 영화·드라마 6 + 책 4 (총 10) 정도.',
    '(3) 각 후보를 WebSearch 로 실재검증(제목+연도)하고 포스터 URL 을 확보한다. 검증 실패작은 폐기(환각 0).',
    '(4) pick-reco submit 으로 등록: 각 rec kind="home", replace={"kind":"home"} (홈만 교체, 갈래 보존). edge fn 은 DB 입출력만.',
    '환경변수 SUPABASE_URL, PICK_RECO_TOKEN, SUPABASE_ANON_KEY 는 주입돼 있다.',
  ].join('\n');
}
function branchPrompt(ownerId, sourceWork) {
  return [
    '너는 pick 앱의 개인 취향 추천 엔진 클로드다. 아래만 수행하고 종료한다(다른 작업·스킬 호출 금지).',
    `${PICK_DIR}/routines/pick-reco.md 의 원칙·검증·호출법을 따른다. 대상 owner_id=${ownerId}. 이번엔 작품별 갈래(kind=branch)만.`,
    `출발 작품 source_work="${sourceWork}" (형식 "제목|연도").`,
    `(1) pick-reco context 를 owner_id=${ownerId} 로 호출. 평가작 중 source_work 와 일치하는 작품을 찾아 media_type·결을 확인(없으면 제목·연도로 진행).`,
    '(2) 그 작품에서 이어지는 추천 3개를 만든다 — 출발작의 톤·주제·창작자 결을 잇고 owner 취향(positive/negative) 반영, 이미 평가한 작품 제외.',
    '(3) 각 후보를 WebSearch 로 실재검증(제목+연도)하고 포스터 URL 확보. 검증 실패작 폐기(환각 0).',
    `(4) pick-reco submit: 각 rec 에 kind="branch", source_work="${sourceWork}". replace={"kind":"branch","source_work":"${sourceWork}"} 로 그 작품 갈래만 교체.`,
    '환경변수 SUPABASE_URL, PICK_RECO_TOKEN, SUPABASE_ANON_KEY 는 주입돼 있다.',
  ].join('\n');
}

// claude -p 헤드리스 실행. key 의 job(kind/source_work)에 따라 home/branch.
async function runClaude(key) {
  const job = jobs.get(key);
  if (!job) { log(`run ${key}: job 메타 없음 skip`); return; }
  const { ownerId, kind, sourceWork } = job;
  const startedIso = new Date().toISOString();
  const label = kind === 'branch' ? `branch ${ownerId} ${sourceWork}` : `home ${ownerId}`;
  log(`run ${label} 시작`);
  const prompt = kind === 'branch' ? branchPrompt(ownerId, sourceWork) : homePrompt(ownerId);
  const runLog = path.join(STATE_DIR, 'last-run.log');
  try {
    const { stdout, stderr } = await execFileP(CLAUDE, claudeArgs(prompt), {
      cwd: PICK_DIR,
      env: { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: OAUTH_TOKEN, SUPABASE_URL, PICK_RECO_TOKEN, SUPABASE_ANON_KEY: ANON_KEY, HOME, PATH: '/opt/homebrew/bin:/usr/bin:/bin' },
      timeout: RUN_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024,
    });
    try { fs.writeFileSync(runLog, `OK ${startedIso} ${label}\n==STDOUT==\n${stdout}\n==STDERR==\n${stderr || ''}`); } catch (_) { /* noop */ }
    log(`done ${label}: ${String(stdout).slice(-200).replace(/\s+/g, ' ')}`);
    // 성공 시 해당 요청행만 정리(범위 한정).
    let del = sb.from('pick_reco_requests').delete().eq('owner_id', ownerId).lte('created_at', startedIso);
    del = kind === 'branch' ? del.eq('kind', 'branch').eq('source_work', sourceWork) : del.eq('kind', 'home');
    try { await del; } catch (e) { log(`cleanup err ${label}: ${e.message}`); }
  } catch (e) {
    const out = String(e.stdout || ''); const err = String(e.stderr || '');
    try { fs.writeFileSync(runLog, `ERROR ${startedIso} ${label}: ${e.message} killed=${e.killed} signal=${e.signal}\n==STDOUT==\n${out}\n==STDERR==\n${err}`); } catch (_) { /* noop */ }
    log(`ERROR ${label}: ${e.message} killed=${e.killed} signal=${e.signal} | out:${out.slice(-200).replace(/\s+/g, ' ')}`);
  }
}

// 우선순위 직렬화 — 동시 claude -p 1개(머신·구독 rate limit 보호). 인터랙티브(detail/rating/button)는 highQ,
// 백필은 lowQ → 백필이 깔려 있어도 새 평가·버튼이 먼저 처리됨. 키별 코얼레싱은 scheduler 가 유지.
const highQ = [], lowQ = [];
const _resolve = new Map();
let _working = false;
function dispatch(key) {
  return new Promise((resolve) => {
    const job = jobs.get(key);
    (job && job.low ? lowQ : highQ).push(key);
    _resolve.set(key, resolve);
    pump();
  });
}
async function pump() {
  if (_working) return;
  _working = true;
  while (highQ.length || lowQ.length) {
    const key = highQ.length ? highQ.shift() : lowQ.shift();
    try { await runClaude(key); } catch (_) { /* runClaude 가 자체 로깅 */ }
    const r = _resolve.get(key); _resolve.delete(key); if (r) r();
  }
  _working = false;
}
const scheduler = createScheduler(dispatch);

// 평가 INSERT — (a) 홈 재생성 디바운스(연속 평가 1회로 흡수), (b) ★3.0+ 새 평가는 그 작품 갈래 생성.
const ratingTimers = new Map();
function onRating(row) {
  const ownerId = row?.owner_id;
  if (!ownerId) return;
  clearTimeout(ratingTimers.get(ownerId));
  ratingTimers.set(ownerId, setTimeout(() => {
    ratingTimers.delete(ownerId);
    log(`rating-debounce fire ${ownerId}`);
    enqueue(ownerId, 'home');
  }, RATING_DEBOUNCE_MS));
  if (Number(row.rating) >= 3.0 && row.title) {
    const sw = `${row.title}|${row.year ?? ''}`;
    log(`rating→branch ${ownerId} ${sw}`);
    enqueue(ownerId, 'branch', sw);
  }
}

// 재시작 시 대기 요청 전체 재개 — 성공분은 행이 삭제되므로 남은 행 = 미처리분(백필 포함). 키별 1회씩.
async function catchUp() {
  const { data, error } = await sb.from('pick_reco_requests')
    .select('owner_id,kind,source_work,source,created_at').order('created_at', { ascending: true }).limit(2000);
  if (error) { log('catchup err', error.message); return; }
  const seen = new Set();
  for (const r of (data || [])) {
    const kind = r.kind === 'branch' ? 'branch' : 'home';
    const key = keyFor(r.owner_id, kind, r.source_work || '');
    if (seen.has(key)) continue;
    seen.add(key);
    enqueue(r.owner_id, kind, r.source_work, r.source);
  }
  if (seen.size) log(`catchup: ${seen.size} 작업 보충`);
}

// realtime 구독 — 끊기면(CHANNEL_ERROR/TIMED_OUT/CLOSED) 5초 후 재연결.
// (Today 데몬은 launchd KeepAlive 재시작에 의존하지만, 여기선 자체 재연결로 다운타임 0.)
let currentChannel = null;
let reconnectPending = false;
function subscribeChannel() {
  reconnectPending = false;
  const ch = sb.channel('pick-reco-daemon');
  currentChannel = ch;
  ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pick_reco_requests' }, (p) => {
      const r = p.new || {};
      log('request', r.owner_id, r.kind || 'home', r.source_work || '', r.source || '');
      enqueue(r.owner_id, r.kind || 'home', r.source_work || null, r.source);
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pick_ratings' }, (p) => {
      log('rating', p.new?.owner_id, p.new?.rating);
      onRating(p.new);
    })
    .subscribe((s) => {
      log('realtime:', s);
      if (s === 'SUBSCRIBED') { catchUp(); return; }
      if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
        if (ch !== currentChannel || reconnectPending) return;   // 옛 채널/중복 예약 무시
        reconnectPending = true;
        try { sb.removeChannel(ch); } catch (_) { /* noop */ }
        log('재연결 예약(5초)');
        setTimeout(subscribeChannel, 5000);
      }
    });
}
subscribeChannel();
setInterval(() => {}, 60000);   // 이벤트 루프 유지 — 소켓 일시 종료에도 프로세스 안 죽게.
setInterval(() => catchUp(), 3 * 60 * 60 * 1000);   // 주기적 재큐잉 — 백필이 rate-limit 으로 실패한 분을 3시간마다 재시도.

process.on('SIGTERM', () => { log('SIGTERM'); process.exit(0); });
process.on('SIGINT', () => { log('SIGINT'); process.exit(0); });
log('pick-reco-daemon started');
