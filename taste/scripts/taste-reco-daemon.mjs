#!/usr/bin/env node
/**
 * taste 추천 — 로컬 Realtime 데몬 (Today navi-realtime-daemon 미러).
 * service role 로 DB 를 구독하다가 트리거가 오면 `claude -p` 헤드리스를 띄워
 * routines/taste-reco.md 지침대로 추천을 재생성한다. launchd KeepAlive 로 상주.
 *
 * 트리거 두 가지:
 *   - taste_reco_requests INSERT  → 즉시 ("다시 추천" 버튼 / 평가 후 enqueue)
 *   - taste_ratings INSERT         → 디바운스 후 (연속 평가는 1회로 흡수)
 * 동시실행 방지·연타 흡수는 reco-scheduler.js (단위테스트됨).
 *
 * 비용 0: claude 인증은 CLAUDE_CODE_OAUTH_TOKEN(지오 구독). Anthropic API 키 아님.
 *
 * env (파일에서 자동 로드):
 *   ~/.config/study/.env      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (공유 프로젝트)
 *   ~/.config/taste/.env      TASTE_RECO_TOKEN (edge fn 저권한 토큰 — claude 에 전달)
 *   taste/.env.local          VITE_SUPABASE_ANON_KEY (게이트웨이 공개 키 — claude 에 전달)
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
const TASTE_DIR = path.join(HOME, 'apps/taste');
const STATE_DIR = path.join(HOME, '.local/state/taste-reco-daemon');
const TOKEN_FILE = path.join(HOME, '.config/navi-daemon/oauth-token');
const CLAUDE = '/opt/homebrew/bin/claude';
const RATING_DEBOUNCE_MS = Number(process.env.TASTE_RATING_DEBOUNCE_MS) || 90 * 1000;
const CATCHUP_MS = 15 * 60 * 1000;       // 데몬 다운 중 들어온 최근 요청 보충
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
const tasteCfg = loadEnvFile(path.join(HOME, '.config/taste/.env'));
const envLocal = loadEnvFile(path.join(TASTE_DIR, '.env.local'));

const SUPABASE_URL = study.SUPABASE_URL || envLocal.VITE_SUPABASE_URL;
const SERVICE_KEY = study.SUPABASE_SERVICE_ROLE_KEY;
const TASTE_RECO_TOKEN = tasteCfg.TASTE_RECO_TOKEN;
const ANON_KEY = envLocal.VITE_SUPABASE_ANON_KEY;
let OAUTH_TOKEN = '';
try { OAUTH_TOKEN = fs.readFileSync(TOKEN_FILE, 'utf8').trim(); } catch { log('WARN: oauth-token 파일 없음 — claude 인증 실패할 수 있음'); }

if (!SUPABASE_URL || !SERVICE_KEY) { log('FATAL: SUPABASE_URL / SERVICE_ROLE_KEY 누락'); process.exit(1); }
if (!TASTE_RECO_TOKEN || !ANON_KEY) { log('FATAL: TASTE_RECO_TOKEN / ANON_KEY 누락'); process.exit(1); }

fs.mkdirSync(STATE_DIR, { recursive: true });
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// claude -p 헤드리스로 owner 추천 재생성. 버튼 응답이므로 홈 추천만 빠르게(갈래 생략).
// MCP·user 설정 미로드(--strict-mcp-config / --setting-sources project) → 헤드리스 작업 집중·기동 단축.
async function runClaude(ownerId) {
  const startedIso = new Date().toISOString();
  log(`run ${ownerId} 시작`);
  const prompt = [
    '너는 taste 앱의 개인 취향 추천 엔진 클로드다. 아래 4단계만 수행하고 종료한다(다른 작업·스킬 호출 금지).',
    `${TASTE_DIR}/routines/taste-reco.md 의 원칙·검증·호출법을 따른다. 대상 owner_id=${ownerId}. 이번엔 홈 추천만(kind=home), 갈래(branch)는 생략.`,
    `(1) taste-reco context 를 owner_id=${ownerId} 로 호출해 평가를 받는다(빈 배열이면 즉시 종료).`,
    '(2) ★3.5+ positive / ★2↓·0.5 negative 패턴을 분석해 홈 후보를 만든다: 영화·드라마 6 + 책 4 (총 10) 정도.',
    '(3) 각 후보를 WebSearch 로 실재검증(제목+연도)하고 포스터 URL 을 확보한다. 검증 실패작은 폐기(환각 0).',
    '(4) taste-reco submit 으로 owner 추천을 교체 등록한다(kind 전부 home). edge fn 은 DB 입출력만, 추천·검증은 네가 직접.',
    '환경변수 SUPABASE_URL, TASTE_RECO_TOKEN, SUPABASE_ANON_KEY 는 주입돼 있다.',
  ].join('\n');
  const runLog = path.join(STATE_DIR, 'last-run.log');
  try {
    const { stdout, stderr } = await execFileP(
      CLAUDE,
      ['-p', prompt,
        '--allowedTools', 'Read,Bash,WebSearch',
        '--permission-mode', 'bypassPermissions',
        '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
        '--setting-sources', 'project'],
      {
        cwd: TASTE_DIR,
        env: {
          ...process.env,
          CLAUDE_CODE_OAUTH_TOKEN: OAUTH_TOKEN,
          SUPABASE_URL,
          TASTE_RECO_TOKEN,
          SUPABASE_ANON_KEY: ANON_KEY,
          HOME,
          PATH: '/opt/homebrew/bin:/usr/bin:/bin',
        },
        timeout: RUN_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
      }
    );
    try { fs.writeFileSync(runLog, `OK ${startedIso} ${ownerId}\n==STDOUT==\n${stdout}\n==STDERR==\n${stderr || ''}`); } catch (_) { /* noop */ }
    log(`done ${ownerId}: ${String(stdout).slice(-200).replace(/\s+/g, ' ')}`);
    // 성공 시에만 요청행 정리(무한증가 방지). 실패면 남겨 다음 트리거/재시도 여지.
    try { await sb.from('taste_reco_requests').delete().eq('owner_id', ownerId).lte('created_at', startedIso); }
    catch (e) { log(`cleanup err ${ownerId}: ${e.message}`); }
  } catch (e) {
    const out = String(e.stdout || ''); const err = String(e.stderr || '');
    try { fs.writeFileSync(runLog, `ERROR ${startedIso} ${ownerId}: ${e.message} killed=${e.killed} signal=${e.signal}\n==STDOUT==\n${out}\n==STDERR==\n${err}`); } catch (_) { /* noop */ }
    log(`ERROR ${ownerId}: ${e.message} killed=${e.killed} signal=${e.signal} | out:${out.slice(-200).replace(/\s+/g, ' ')}`);
  }
}

const scheduler = createScheduler(runClaude);

// 평가 INSERT 디바운스 — 연속 평가는 마지막 후 RATING_DEBOUNCE_MS 지나 1회만 트리거.
const ratingTimers = new Map();
function onRating(ownerId) {
  if (!ownerId) return;
  clearTimeout(ratingTimers.get(ownerId));
  ratingTimers.set(ownerId, setTimeout(() => {
    ratingTimers.delete(ownerId);
    log(`rating-debounce fire ${ownerId}`);
    scheduler.request(ownerId);
  }, RATING_DEBOUNCE_MS));
}

// 데몬 다운 중 눌린 버튼 보충 — 최근 요청 owner 들을 1회씩.
async function catchUp() {
  const since = new Date(Date.now() - CATCHUP_MS).toISOString();
  const { data, error } = await sb.from('taste_reco_requests')
    .select('owner_id,created_at').gt('created_at', since).order('created_at', { ascending: true });
  if (error) { log('catchup err', error.message); return; }
  const owners = [...new Set((data || []).map((r) => r.owner_id))];
  if (owners.length) log(`catchup: ${owners.length} owner 보충`);
  for (const o of owners) scheduler.request(o);
}

// realtime 구독 — 끊기면(CHANNEL_ERROR/TIMED_OUT/CLOSED) 5초 후 재연결.
// (Today 데몬은 launchd KeepAlive 재시작에 의존하지만, 여기선 자체 재연결로 다운타임 0.)
let currentChannel = null;
let reconnectPending = false;
function subscribeChannel() {
  reconnectPending = false;
  const ch = sb.channel('taste-reco-daemon');
  currentChannel = ch;
  ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'taste_reco_requests' }, (p) => {
      log('request', p.new?.owner_id, p.new?.source);
      scheduler.request(p.new?.owner_id);
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'taste_ratings' }, (p) => {
      log('rating', p.new?.owner_id);
      onRating(p.new?.owner_id);
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

process.on('SIGTERM', () => { log('SIGTERM'); process.exit(0); });
process.on('SIGINT', () => { log('SIGINT'); process.exit(0); });
log('taste-reco-daemon started');
