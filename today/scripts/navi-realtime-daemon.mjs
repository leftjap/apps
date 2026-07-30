#!/usr/bin/env node
/**
 * 오늘의 네비 — 클로드 자동 댓글 Realtime 데몬.
 * service role 로 today_entries INSERT 구독 + catchUp(미답 글 재포착). 정착(1시간) 후 claude -p 로
 * 초안 작성 → 독립 fact/tone 검증(검증 통과까지 사실 교정 재작성) → 통과 시 댓글 insert. launchd 상주.
 * 지침은 routines/ai-navi.md(불변), 검증은 navi-verify.mjs(순수 게이트)·daemon 오케스트레이션이 강제.
 *
 * env: today/.env.local 의 SUPABASE_URL(또는 VITE_), SUPABASE_SERVICE_ROLE_KEY.
 *      ~/.config/navi-daemon/oauth-token 의 CLAUDE_CODE_OAUTH_TOKEN(claude 인증, 비용0 구독).
 */
import { createClient } from '@supabase/supabase-js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { selectPendingInitial, selectPendingReplies } from './navi-pending.mjs';
import { parseVerdict, gateDecision, buildFixText } from './navi-verify.mjs';
import { nameFor } from '../supabase/functions/ai-comment/logic.js';

const execFileP = promisify(execFile);
const HOME = os.homedir();
const TODAY_DIR = path.join(HOME, 'apps/today');
const STATE_DIR = path.join(HOME, '.local/state/navi-daemon');
const TOKEN_FILE = path.join(HOME, '.config/navi-daemon/oauth-token');
const CLAUDE = '/opt/homebrew/bin/claude';
// 자동댓글 모델 고정(사용자 결정 2026-07-30). alias 미사용 이유: CLI 업데이트 시 최신 Opus 로 조용히
// 바뀌는 드리프트 차단. 이 모델 은퇴(빨라야 2027-05-28, 최소 60일 사전 공지) 등 실패 시 opus(최신)로 1회 폴백.
const CLAUDE_MODEL = 'claude-opus-4-8';
const SETTLE_MS = Number(process.env.NAVI_SETTLE_MS) || 60 * 60 * 1000;
const NAVI_KINDS = ['navi', 'soyoun_navi'];
// 클로드 자동 댓글 author (supabase/migrations 의 CLAUDE id 와 동일).
const CLAUDE_AUTHOR_ID = 'f74a3d8a-f449-4c25-82d1-509dc70a9988';
// catchUp 재포착 윈도 — 클라우드 함수 today_ai_has_pending() 과 동일한 최근 3일.
const CATCHUP_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
// 자동댓글 fact 검증 실패 시 사실 교정 재작성 최대 횟수.
const MAX_REVISE = 2;

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
const seen = new Set();       // 초기 댓글 in-flight (entry id)
const replying = new Set();   // 대댓글 in-flight (entry id) — 초기와 상호배타(초기=클로드댓글無, 대댓글=有)
let DRY_RUN = false; // --dry-run: 검증만 하고 댓글 insert 는 생략(통합 테스트용).

function schedule(row) {
  if (!row || !NAVI_KINDS.includes(row.kind)) return;
  if (seen.has(row.id)) return;
  seen.add(row.id);
  const age = Date.now() - new Date(row.created_at).getTime();
  const delay = Math.max(0, SETTLE_MS - age);
  log(`schedule ${row.id} kind=${row.kind} delay=${Math.round(delay / 1000)}s`);
  setTimeout(() => { runClaude(row); }, delay);
}

// 대댓글은 settle gate 없음(사람 댓글엔 즉시 응답). 중복 발사만 replying 으로 막는다.
function scheduleReply(row) {
  if (!row || !NAVI_KINDS.includes(row.kind)) return;
  if (replying.has(row.id) || seen.has(row.id)) return;
  replying.add(row.id);
  log(`schedule-reply ${row.id} kind=${row.kind}`);
  processPipeline(row, { mode: 'reply' }).finally(() => replying.delete(row.id));
}

// 사람 댓글 INSERT 즉시 경로: 해당 글이 대댓글 대상이면 발사 (순수 selectPendingReplies 재사용).
async function checkReplyForEntry(entryId) {
  const { data: e } = await sb.from('today_entries')
    .select('id,kind,is_shared,deleted_at,created_at').eq('id', entryId).single();
  if (!e || e.deleted_at || e.is_shared !== true || !NAVI_KINDS.includes(e.kind)) return;
  const { data: cmts } = await sb.from('today_comments')
    .select('entry_id,author_id,created_at').eq('entry_id', entryId).is('deleted_at', null);
  const replies = selectPendingReplies([e], new Map([[entryId, cmts || []]]), { claudeId: CLAUDE_AUTHOR_ID });
  if (replies.length) scheduleReply(e);
}

function readMaybe(p) { try { return fs.readFileSync(p, 'utf8').trim(); } catch { return ''; } }

// claude -p 1패스 실행 → stdout 반환. 에이전트엔 토큰 미주입(파일 Read + WebSearch 만).
// CLAUDE_MODEL 고정 실행, 실패 시 opus(최신 alias)로 1회 폴백 — 발동 시 MODEL-FALLBACK 로그.
async function claudePass(prompt, allowedTools, cwd) {
  const run = (model) => execFileP(
    CLAUDE,
    ['-p', prompt, '--model', model, '--allowedTools', allowedTools, '--permission-mode', 'bypassPermissions'],
    {
      cwd,
      env: { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: OAUTH_TOKEN, HOME, PATH: '/opt/homebrew/bin:/usr/bin:/bin' },
      timeout: 300000,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  try {
    const { stdout } = await run(CLAUDE_MODEL);
    return stdout;
  } catch (e) {
    log(`MODEL-FALLBACK: ${CLAUDE_MODEL} 실패 → opus 재시도 (원인: ${String(e.message).split('\n').slice(0, 3).join(' | ').slice(0, 300)})`);
    const { stdout } = await run('opus');
    return stdout;
  }
}

// 검증 통과한 댓글을 클로드 author 로 직접 insert(service role). DB 트리거(realtime·알림)는 insert 에 발화.
async function submitComment(entryId, body) {
  if (DRY_RUN) { log(`[dry-run] submit ${entryId} (${body.length}자): ${body.slice(0, 60)}…`); return { id: 'dry-run' }; }
  const { data, error } = await sb.from('today_comments')
    .insert({ entry_id: entryId, author_id: CLAUDE_AUTHOR_ID, body }).select('id').single();
  if (error) throw new Error(`submit insert: ${error.message}`);
  return data;
}

// 검증 파이프라인 프롬프트 (실글 시뮬로 검증한 형태). 지침(ai-navi.md)은 그대로 읽되 검증을 코드가 강제.
const draftPrompt = (work) =>
  [`너는 투데이 "오늘의 네비" 댓글 봇 클로드다. ${TODAY_DIR}/routines/ai-navi.md 의 지침을 Read 로 읽고 그대로 따른다.`,
    `${work}/entry.txt (대상 일기)를 Read 로 읽고, 두 지침(유머·개그·과장·비유 + 최신 연구/학문 보강)대로 댓글 본문을 작성하라.`,
    `작성한 댓글 전문만 ${work}/draft.txt 에 기록하라(Bash). 제출하지 마라.`].join('\n');

// 대댓글용 초안 — 일기 + 지금까지의 댓글 스레드를 읽고, 마지막 사람 댓글에 답한다(새 주제 시작 아님).
const replyDraftPrompt = (work) =>
  [`너는 투데이 "오늘의 네비" 댓글 봇 클로드다. ${TODAY_DIR}/routines/ai-navi.md 의 지침을 Read 로 읽고 그대로 따른다.`,
    `${work}/entry.txt (대상 일기)와 ${work}/thread.txt (지금까지의 댓글 대화)를 Read 로 읽어라.`,
    'thread 의 "마지막 사람 댓글"에 대댓글로 답하라 — 새 주제를 시작하지 말고 그 말에 직접 반응·답변한다. 지적/농담/반문이면 거기에 맞게 응수. 지침(유머·개그·과장·비유, 필요 시 최신 연구)은 유지하되 대화 흐름에 자연스럽게.',
    `작성한 대댓글 전문만 ${work}/draft.txt 에 기록하라(Bash). 제출하지 마라.`].join('\n');

const factPrompt = (work) =>
  [`너는 독립 팩트체커다(작성자 아님, 초안을 의심). ${work}/entry.txt 와 ${work}/draft.txt 를 Read 로 읽어라.`,
    '초안이 인용한 모든 연구·학술 주장을 WebSearch 로 검증하라: 실재? 저자·출처 정확? 적용·분류 정확(과장·느슨/반대 분류 아님)?',
    '날조·오귀속·과장·틀린 분류가 하나라도 있으면 ok=false, 불확실해도 ok=false(보수적).',
    `결과를 ${work}/verdict-fact.json 에 JSON 한 줄만 기록하라(Bash): {"ok": true|false, "problems": ["..."], "fix": "..."}`].join('\n');

const tonePrompt = (work) =>
  [`너는 댓글 톤 검토자다. ${work}/entry.txt 와 ${work}/draft.txt 를 Read 로 읽어라.`,
    'ai-navi.md 지침 ①(유머·개그·과장·비유)이 살아있고 일기와 자연스럽게 연결되는가? 억지·과교정·무미건조면 ok=false.',
    `결과를 ${work}/verdict-tone.json 에 JSON 한 줄만 기록하라(Bash): {"ok": true|false, "problems": ["..."], "fix": "..."}`].join('\n');

const revisePrompt = (work) =>
  [`너는 "오늘의 네비" 댓글 작성자다. ${work}/draft.txt(초안)와 ${work}/fix.txt(지적·수정지시)를 Read 로 읽어라.`,
    '지적된 사실 오류만 정확히 교정하라. 유머·톤·구조·길이 유지, 무리한 새 연구 추가 금지.',
    `교정된 댓글 전문만 ${work}/draft.txt 에 덮어써라(Bash). 설명 없이 본문만.`].join('\n');

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
  await processPipeline(row);
}

// DRAFT → VERIFY(fact+tone) → GATE → (REVISE) → SUBMIT. settle 통과 후/단발(--once/--reply) 에서 호출.
// mode: 'initial'(기본) | 'reply'. reply 는 thread.txt(댓글 대화)를 추가로 주입해 마지막 사람 댓글에 응답.
async function processPipeline(row, { mode = 'initial' } = {}) {
  const work = path.join(os.tmpdir(), `navi-verify-${row.id}-${Date.now()}`);
  try {
    fs.mkdirSync(work, { recursive: true });
    // 대상 일기 → entry.txt (에이전트 입력)
    const { data: ent } = await sb.from('today_entries').select('title,content').eq('id', row.id).single();
    if (!ent) { log(`skip ${row.id} (entry 없음)`); return; }
    const plain = String(ent.content || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim();
    fs.writeFileSync(path.join(work, 'entry.txt'), `제목: ${ent.title || ''}\n\n${plain}`);

    // reply 모드: 비삭제 댓글 스레드를 시간순으로 thread.txt 에 기록(작성자 이름 라벨).
    if (mode === 'reply') {
      const { data: cmts } = await sb.from('today_comments')
        .select('author_id,body,created_at').eq('entry_id', row.id).is('deleted_at', null)
        .order('created_at', { ascending: true });
      if (!cmts || cmts.length === 0) { log(`skip reply ${row.id} (댓글 없음)`); return; }
      if (cmts[cmts.length - 1].author_id === CLAUDE_AUTHOR_ID) { log(`skip reply ${row.id} (마지막이 클로드 — 응답 불필요)`); return; }
      const thread = cmts.map((c) => {
        const who = nameFor(c.author_id, CLAUDE_AUTHOR_ID);
        const body = String(c.body || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim();
        return `${who}: ${body}`;
      }).join('\n\n');
      fs.writeFileSync(path.join(work, 'thread.txt'), thread);
    }

    // DRAFT — 지침대로 (대)댓글 작성(제출 안 함)
    await claudePass((mode === 'reply' ? replyDraftPrompt : draftPrompt)(work), 'Read,Bash', TODAY_DIR);
    let draft = readMaybe(path.join(work, 'draft.txt'));
    if (!draft) { log(`draft 비어있음 ${row.id} — 미게시(재시도)`); return; }

    // VERIFY(독립 fact+tone) → GATE → (REVISE) 루프
    for (let revisesLeft = MAX_REVISE; ; revisesLeft--) {
      const factOut = await claudePass(factPrompt(work), 'Read,Bash,WebSearch', work);
      const toneOut = await claudePass(tonePrompt(work), 'Read,Bash', work);
      const verdicts = {
        fact: parseVerdict(readMaybe(path.join(work, 'verdict-fact.json')) || factOut),
        tone: parseVerdict(readMaybe(path.join(work, 'verdict-tone.json')) || toneOut),
      };
      const decision = gateDecision(verdicts, { revisesLeft });
      log(`gate ${row.id}: ${decision.action} (${decision.reason})`);
      if (decision.action === 'submit') {
        const r = await submitComment(row.id, draft);
        log(`submit ${row.id}: ${JSON.stringify(r)}`);
        break;
      }
      if (decision.action === 'hold') break; // self-heal catchUp 이 다음 스캔에서 재시도
      // REVISE — 지적된 사실만 교정 재작성
      fs.writeFileSync(path.join(work, 'fix.txt'), buildFixText(verdicts));
      ['verdict-fact.json', 'verdict-tone.json'].forEach((f) => { try { fs.rmSync(path.join(work, f)); } catch {} });
      await claudePass(revisePrompt(work), 'Read,Bash', work);
      draft = readMaybe(path.join(work, 'draft.txt')) || draft;
    }
  } catch (e) {
    log(`ERROR ${row.id}: ${e.message}`);
  } finally {
    try { fs.rmSync(work, { recursive: true, force: true }); } catch {}
    // 시도 완료 → in-flight 해제. 다음 catchUp 이 '실제 클로드 댓글 유무' 로 재판단(미게시 시 자동 재시도).
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
  const commented = new Set();           // 초기용: 삭제 이력 포함 클로드 댓글 있는 entry(부활 금지)
  const commentsByEntry = new Map();     // 대댓글용: 비삭제 댓글(마지막-저자 판정)
  if (ids.length) {
    const { data: cmts, error: ce } = await sb.from('today_comments')
      .select('entry_id,author_id,created_at,deleted_at').in('entry_id', ids);
    if (ce) { log('catchup comments err', ce.message); return; }
    for (const c of cmts) {
      if (c.author_id === CLAUDE_AUTHOR_ID) commented.add(c.entry_id);
      if (!c.deleted_at) {
        if (!commentsByEntry.has(c.entry_id)) commentsByEntry.set(c.entry_id, []);
        commentsByEntry.get(c.entry_id).push(c);
      }
    }
  }
  const pending = selectPendingInitial(entries, commented, { windowMs: CATCHUP_WINDOW_MS, nowMs: Date.now() });
  const replies = selectPendingReplies(entries, commentsByEntry, { claudeId: CLAUDE_AUTHOR_ID });
  log(`catchup: navi ${entries.length}건 중 미답 ${pending.length}건, 대댓글대기 ${replies.length}건`);
  const byId = new Map(entries.map((e) => [e.id, e]));
  for (const id of pending) schedule(byId.get(id));
  for (const id of replies) scheduleReply(byId.get(id));
}

// CLI 단발 실행 (테스트·수동 트리거):
//   초기 댓글: node navi-realtime-daemon.mjs --once  <entry_id> [--dry-run]
//   대댓글:    node navi-realtime-daemon.mjs --reply <entry_id> [--dry-run]
const _argv = process.argv.slice(2);
const _onceMode = _argv.includes('--reply') ? 'reply' : (_argv.includes('--once') ? 'initial' : null);
if (_onceMode) {
  DRY_RUN = _argv.includes('--dry-run');
  const flag = _onceMode === 'reply' ? '--reply' : '--once';
  const id = _argv[_argv.indexOf(flag) + 1];
  if (!id) { log(`usage: ${flag} <entry_id> [--dry-run]`); process.exit(1); }
  const { data: row, error } = await sb.from('today_entries').select('id,kind,created_at,updated_at').eq('id', id).single();
  if (error || !row) { log(`entry ${id} 없음`); process.exit(1); }
  log(`${flag} ${id} dry-run=${DRY_RUN} (settle 무시)`);
  await processPipeline(row, { mode: _onceMode });
  process.exit(0);
}

sb.channel('navi-daemon')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'today_entries' }, (p) => {
    log('INSERT', p.new?.id, p.new?.kind);
    schedule(p.new);
  })
  // 사람 댓글 INSERT 즉시 반응(대댓글). 클로드 자신의 insert 는 checkReplyForEntry 가 걸러 무한루프 방지.
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'today_comments' }, (p) => {
    const c = p.new;
    if (!c || c.author_id === CLAUDE_AUTHOR_ID) return;
    log('COMMENT INSERT', c.entry_id, String(c.author_id || '').slice(0, 8));
    checkReplyForEntry(c.entry_id).catch((e) => log(`checkReply err ${c.entry_id}: ${e.message}`));
  })
  .subscribe((s) => { log('realtime:', s); if (s === 'SUBSCRIBED') catchUp(); });

process.on('SIGTERM', () => { log('SIGTERM'); process.exit(0); });
process.on('SIGINT', () => { log('SIGINT'); process.exit(0); });
log('navi-daemon started');
