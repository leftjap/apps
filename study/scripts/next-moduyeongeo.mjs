/**
 * next-moduyeongeo.mjs — study-daily-9am 루틴 en 소스(모두영어 순차 전달)의 결정적 커서.
 *
 * 배경: en 일일 루틴을 Parks/Office 마이닝 → 모두영어 #1~#105 순차 전달로 교체(사용자 결정).
 * 105편은 seeds/moduyeongeo/ep001~ep105.json 로 이미 완성. 이 스크립트는
 *  1) Supabase 에서 이미 시드된 en-moduyeongeo 편을 조회 → 다음 미시드 편 번호를 결정(결정적, 즉흥 X)
 *  2) 그 편 파일에 오늘 date 를 붙여 seeds/en-moduyeongeo-<date>.json 로 방출
 *  3) 다음 편 번호를 stdout 마지막 줄에 `NEXT_EP=<n>` (또는 `NEXT_EP=none`) 로 출력
 * 이후 루틴은 seed-supabase.mjs 로 그 payload 를 시드(게이트가 track:moduyeongeo 예외로 통과).
 * 105편 소진 시 NEXT_EP=none → 루틴이 기존 Parks/Office 마이닝으로 폴백.
 *
 * CLI: node scripts/next-moduyeongeo.mjs --user-id <uuid> --date <YYYY-MM-DD> [--dry-run]
 *   --dry-run: payload 파일을 쓰지 않고 다음 편 번호만 출력(Supabase SELECT 만).
 * env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (set -a && source ~/.config/study/.env).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { argv, env, exit } from 'node:process';

export const TRACK = 'moduyeongeo';
export const MAX_EP = 105;

/** 카드 id (en-moduyeongeo-ep<N>-slug) 에서 편 번호 추출. 형식 불일치 시 null. */
export function parseEpFromId(id) {
  const m = String(id ?? '').match(/^en-moduyeongeo-ep(\d+)-/);
  return m ? parseInt(m[1], 10) : null;
}

/** 이미 시드된 편 번호 집합 → 다음 미시드 편(1부터 최저 빈 번호). 전부 소진이면 null. */
export function computeNextEp(usedEpNums, max = MAX_EP) {
  const used = new Set((usedEpNums ?? []).filter((n) => Number.isInteger(n)));
  for (let n = 1; n <= max; n += 1) if (!used.has(n)) return n;
  return null;
}

/**
 * 완료-후-진행 정책(사용자 결정 2026-07-08 "학습하면 그 다음 #2"): rows=[{id,completed}] →
 *  - 미완료 편이 있으면 { action:'wait', ep }  (그 편을 다 학습할 때까지 새 편 생성 안 함)
 *  - 없으면 다음 미생성 편 { action:'create', ep }  (없으면 최저 미생성)
 *  - 105편 전부 완료·소진 { action:'done', ep:null }  (Parks/Office 폴백 신호)
 */
export function decideNext(rows, max = MAX_EP) {
  const byEp = new Map();
  for (const r of rows ?? []) {
    const ep = parseEpFromId(r?.id);
    if (ep == null) continue;
    const cur = byEp.get(ep) ?? { allDone: true };
    if (r?.completed !== true) cur.allDone = false;
    byEp.set(ep, cur);
  }
  const created = [...byEp.keys()];
  const incomplete = created.filter((ep) => !byEp.get(ep).allDone).sort((a, b) => a - b);
  if (incomplete.length) return { action: 'wait', ep: incomplete[0] };
  const next = computeNextEp(created, max);
  return next == null ? { action: 'done', ep: null } : { action: 'create', ep: next };
}

/** ep 파일 payload + 오늘 date → seed-supabase 용 dated payload (track 유지 = 게이트 예외). */
export function buildDatedPayload(epPayload, dateISO) {
  return { ...epPayload, date: dateISO };
}

/** PostgREST content-range 응답이 아니라 id 배열을 받아 used 편 번호 도출(순수 — 테스트용). */
export function usedEpsFromRows(rows) {
  return [...new Set((rows ?? []).map((r) => parseEpFromId(r?.id)).filter((n) => n != null))];
}

function parseArgs(a) {
  const out = {};
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === '--user-id') out.userId = a[i + 1];
    else if (a[i] === '--date') out.date = a[i + 1];
    else if (a[i] === '--dry-run') out.dryRun = true;
  }
  return out;
}

async function fetchModuRows(supabaseUrl, serviceKey, userId) {
  const path = `/study_today_lessons?select=id,completed&user_id=eq.${userId}&lang=eq.en&id=like.en-moduyeongeo-ep*`;
  const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1${path}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SELECT moduyeongeo rows → ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function main() {
  const args = parseArgs(argv.slice(2));
  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) { console.error('Missing env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY'); exit(1); }
  if (!args.userId || !/^\d{4}-\d{2}-\d{2}$/.test(args.date || '')) {
    console.error('usage: node scripts/next-moduyeongeo.mjs --user-id <uuid> --date <YYYY-MM-DD> [--dry-run]');
    exit(1);
  }
  const rows = await fetchModuRows(supabaseUrl, serviceKey, args.userId);
  const used = usedEpsFromRows(rows).sort((a, b) => a - b);
  const decision = decideNext(rows);
  console.log(`[next-moduyeongeo] 생성된 편: [${used.join(', ')}] | 결정: ${decision.action}${decision.ep != null ? ' ep' + decision.ep : ''}`);
  if (decision.action === 'wait') {
    console.log(`[next-moduyeongeo] ep${decision.ep} 미완료 — 학습 완료 전까지 새 편 생성 안 함(완료-후-진행)`);
    console.log('NEXT_EP=wait'); return;
  }
  if (decision.action === 'done') {
    console.log('[next-moduyeongeo] 105편 전부 완료·소진 — Parks/Office 폴백');
    console.log('NEXT_EP=none'); return;
  }
  const next = decision.ep;
  const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
  const nnn = String(next).padStart(3, '0');
  const epPayload = JSON.parse(readFileSync(join(rootDir, 'seeds', 'moduyeongeo', `ep${nnn}.json`), 'utf8'));
  const dated = buildDatedPayload(epPayload, args.date);
  const outPath = join(rootDir, 'seeds', `en-moduyeongeo-${args.date}.json`);
  if (!args.dryRun) {
    writeFileSync(outPath, JSON.stringify(dated, null, 2));
    console.log(`[next-moduyeongeo] payload 방출: seeds/en-moduyeongeo-${args.date}.json (ep${next}, cards=${dated.cards.length})`);
  } else {
    console.log(`[next-moduyeongeo] dry-run — ep${next} (cards=${dated.cards.length}) 방출 생략`);
  }
  console.log(`NEXT_EP=${next}`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main().catch((e) => { console.error(`[next-moduyeongeo] FAILED: ${e.message}`); exit(1); });
