#!/usr/bin/env node
/**
 * 모두영어 전진 체크 — launchd 일회성 (com.gio.study-advance-check, 5분 간격).
 *
 * 배경(2026-07-28 사용자 보고): 구 방식(스케줄드 태스크 2h×7회/일)은 no-op 이어도 매 실행이
 * 사이드바에 세션을 만들어 하루 6~7개가 쌓였다(최근 50개 세션 중 33개). 세션 생성은 하네스
 * 레벨이라 프롬프트로 못 막는다 → 감지를 로컬로 내리고, 저작할 때만 headless claude 를 부른다.
 *
 * 구조 (best-daily 의 'launchd 주 실행기 + 루틴 백업' 패턴):
 *  - 폴링이 보장: next-moduyeongeo --dry-run(Supabase SELECT 1회)으로 커서 확인. wait/none → 즉시 종료.
 *    Realtime 구독은 publication 여부를 무해하게 검증할 수 없어(가짜 user_id 는 FK 로 불가,
 *    실사용자 더미행은 pull-only 동기화의 유령행 리스크) 의존하지 않는다.
 *  - NEXT_EP=<n> → headless `claude -p` 로 advance SKILL 3~6단계(저작·게이트·시드·커밋) 실행.
 *    navi-realtime-daemon 검증 패턴 그대로: OAuth 토큰 파일 + bypassPermissions.
 *    실측(2026-07-28): CLI 기본 인증은 만료(401) — 토큰 파일 경유가 필수. headless 실행은
 *    사이드바 세션을 만들지 않음(실측).
 *  - 백업: 스케줄드 태스크 study-moduyeongeo-advance 는 1일 1회로 축소해 안전망으로 유지.
 *
 * 테스트 훅: STUDY_ADVANCE_FORCE_EP=<n>(dry-run 생략하고 트리거 경로 강제),
 *           STUDY_ADVANCE_STUB=ok|fail(claude 대신 스텁 — 시뮬 검증용).
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const execFileP = promisify(execFile);
const HOME = os.homedir();
const STUDY = path.join(HOME, 'apps/study');
const CLAUDE = '/opt/homebrew/bin/claude';
const TOKEN_FILE = path.join(HOME, '.config/navi-daemon/oauth-token'); // navi 와 공유(같은 계정 장수명 토큰)
const SKILL = path.join(HOME, '.claude/scheduled-tasks/study-moduyeongeo-advance/SKILL.md');
const STATE = path.join(HOME, '.local/state/study-advance-check');
const LOCK = path.join(STATE, 'lock');
const LOCK_STALE_MS = 40 * 60 * 1000; // 저작 실측 ~4분 — 40분 넘은 락은 죽은 실행으로 간주

const log = (...a) => console.log(new Date().toISOString(), ...a);

function loadStudyEnv() {
  const env = { ...process.env };
  const raw = fs.readFileSync(path.join(HOME, '.config/study/.env'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

function kstToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

function acquireLock() {
  fs.mkdirSync(STATE, { recursive: true });
  try {
    fs.mkdirSync(LOCK); // 원자적 — 이미 있으면 throw
    return true;
  } catch {
    const age = Date.now() - fs.statSync(LOCK).mtimeMs;
    if (age > LOCK_STALE_MS) { fs.rmdirSync(LOCK); fs.mkdirSync(LOCK); log('stale lock 회수', Math.round(age / 60000) + 'min'); return true; }
    return false;
  }
}
const releaseLock = () => { try { fs.rmdirSync(LOCK); } catch { /* noop */ } };

function notify(msg) {
  try {
    execFile('osascript', ['-e', `display notification ${JSON.stringify(msg)} with title "스터디 전진 체크" sound name "Funk"`]);
  } catch { /* noop */ }
}

async function main() {
  const env = loadStudyEnv();
  const userId = JSON.parse(fs.readFileSync(path.join(STUDY, 'seeds/.user-defaults.json'), 'utf8')).default.user_id;

  let ep = process.env.STUDY_ADVANCE_FORCE_EP || null;
  if (!ep) {
    const { stdout } = await execFileP(process.execPath,
      ['scripts/next-moduyeongeo.mjs', '--user-id', userId, '--date', kstToday(), '--dry-run'],
      { cwd: STUDY, env, timeout: 60000 });
    const m = stdout.trim().split('\n').pop().match(/^NEXT_EP=(.+)$/);
    if (!m) { log('커서 출력 파싱 실패'); notify('전진 체크 실패 — 커서 출력 파싱 불가'); process.exit(1); }
    if (m[1] === 'wait' || m[1] === 'none') { log('no-op:', m[1]); return; } // 대부분 여기서 끝 — 흔적은 로그 1줄
    ep = m[1];
  }

  if (!acquireLock()) { log('locked — 다른 실행 진행 중, 종료'); return; }
  try {
    log(`NEXT_EP=${ep} → 저작 시작`);
    const stub = process.env.STUDY_ADVANCE_STUB;
    if (stub) { // 시뮬 전용 — claude 미호출
      log('STUB 모드:', stub);
      if (stub === 'fail') throw new Error('stub 강제 실패');
      log(`SEEDED ep${ep} (stub)`);
      return;
    }
    const token = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
    const prompt = [
      `cwd 는 ~/apps/study 다. ${SKILL} 를 Read 해 그 절차의 3~6단계(방출·저작·게이트·시드·커밋)를 그대로 수행하라.`,
      `커서 확인은 끝났고 NEXT_EP=${ep} 다 (--dry-run 재확인은 해도 된다).`,
      `게이트([validate] OK / [seed] OK) 없이 시드 금지. 성공 시 마지막 줄에 'SEEDED ep${ep}', 실패 시 'FAILED: <사유>' 를 출력하라.`,
    ].join('\n');
    const { stdout } = await execFileP(CLAUDE,
      ['-p', prompt, '--allowedTools', 'Bash,Read,Write,Edit,Grep,Glob', '--permission-mode', 'bypassPermissions'],
      {
        cwd: STUDY,
        env: { ...env, CLAUDE_CODE_OAUTH_TOKEN: token, HOME, PATH: '/opt/homebrew/bin:/usr/bin:/bin' },
        timeout: 25 * 60 * 1000,
        maxBuffer: 10 * 1024 * 1024,
      });
    const last = stdout.trim().split('\n').pop();
    log('claude 종료:', last);
    if (/^SEEDED/.test(last)) notify(`모두영어 다음 편 준비됨 — ${last}`);
    else { notify(`전진 저작 실패 — ${last.slice(0, 80)}`); process.exitCode = 1; }
  } catch (e) {
    log('실패:', e.message);
    notify(`전진 체크 실패 — ${String(e.message).slice(0, 80)}`);
    process.exitCode = 1;
  } finally {
    releaseLock();
  }
}

main().catch((e) => { log('FATAL:', e.message); notify('전진 체크 FATAL — 로그 확인'); process.exit(1); });
