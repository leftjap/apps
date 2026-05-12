#!/usr/bin/env node
/**
 * Obsidian 2026 일기 (~/cowork/navi/2026/*.md, 74개) → Today `today_entries` (kind='navi') 일괄 import.
 *
 * 동작:
 *   기본(dry-run): 파싱·통계·샘플 3건 stdout 출력. DB 미접속.
 *   --apply      : 백업(handoff/) → leftjap navi 전수 hard-delete → 74건 batch upsert.
 *   --backup-only: 백업만 (handoff/) 생성 후 종료. 삭제·insert 안 함.
 *
 * 환경 (.env.local):
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (RLS 우회. 절대 VITE_ prefix 금지)
 *   USER_ID_LEFTJAP            (옵션. 미지정 시 auth.admin.listUsers 자동 조회)
 *   OBSIDIAN_NAVI_DIR          (기본: ~/cowork/navi/2026)
 *
 * 멱등성:
 *   id = SHA-256("obsidian-navi|leftjap|" + basename) v4 마스킹 → 재실행 시 update.
 *
 * 변환:
 *   파일명 `[YYYY-MM-DD DAY] 제목.md` → title="제목", date=YYYY-MM-DD.
 *   created_at = updated_at = `${date}T00:00:00+09:00`.
 *   본문: frontmatter 제거 + HTML escape + 옵시디언 `\<...\>` backslash 제거 +
 *         단락(`<p>`)·hr·헤더·중첩 ul·인라인 bold/italic 변환.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// ─── CLI 파싱 ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flags = { apply: false, backupOnly: false };
for (const a of args) {
  if (a === '--apply') flags.apply = true;
  else if (a === '--backup-only') flags.backupOnly = true;
  else { console.error(`알 수 없는 플래그: ${a}`); process.exit(1); }
}

// ─── 상수 ─────────────────────────────────────────────────────────────
const BATCH_SIZE = 50;
const KIND = 'navi';
const FILE_NAME_RE = /^\[(\d{4}-\d{2}-\d{2}) (MON|TUE|WED|THU|FRI|SAT|SUN)\](?: (.+))?\.md$/;
const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const DEFAULT_OBSIDIAN_DIR = path.join(process.env.HOME || '', 'cowork/navi/2026');

// ─── 유틸 (import-keep-data.js 동일 패턴) ─────────────────────────────
function deterministicUuid(userKey, sourceId) {
  const hash = crypto.createHash('sha256').update(`${userKey}|${sourceId}`).digest();
  const b = Buffer.from(hash.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = b.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}

function loadEnvLocal() {
  const envPath = path.join(PROJECT_ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (process.env[m[1]] !== undefined) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[m[1]] = val;
  }
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    console.error(`\n환경변수 누락: ${name} (.env.local 확인)`);
    process.exit(1);
  }
  return v;
}

// ─── frontmatter 제거 ─────────────────────────────────────────────────
function splitFrontmatter(raw) {
  if (!raw.startsWith('---\n') && !raw.startsWith('---\r\n')) {
    return { frontmatter: null, body: raw };
  }
  const rest = raw.slice(4);
  const end = rest.indexOf('\n---\n');
  const endCRLF = rest.indexOf('\r\n---\r\n');
  let endIdx = -1; let skip = 0;
  if (end !== -1 && (endCRLF === -1 || end < endCRLF)) { endIdx = end; skip = 5; }
  else if (endCRLF !== -1) { endIdx = endCRLF; skip = 7; }
  if (endIdx === -1) return { frontmatter: null, body: raw };
  return { frontmatter: rest.slice(0, endIdx), body: rest.slice(endIdx + skip) };
}

// ─── 해시태그 추출 ─────────────────────────────────────────────────────
function extractHashtags(body) {
  const lines = body.replace(/\r\n/g, '\n').split('\n').map((l) => l.trimEnd());
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i] === '') continue;
    const tags = lines[i].match(/#[가-힣A-Za-z0-9_]+/g);
    return tags ? tags : [];
  }
  return [];
}

// ─── 마크다운 → HTML ──────────────────────────────────────────────────
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineTransform(s) {
  let out = escapeHtml(s);
  out = out.replace(/\\&lt;/g, '&lt;').replace(/\\&gt;/g, '&gt;');
  out = out.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
  out = out.replace(/\n/g, '<br>');
  return out;
}

function isListLine(line) {
  return /^( {0,3})([*-]) (.+)$/.test(line);
}

function listBlockToHtml(lines) {
  const html = [];
  const stack = [];
  const open = () => { html.push('<ul>'); stack.push(true); };
  const close = () => { html.push('</ul>'); stack.pop(); };
  for (const line of lines) {
    const m = line.match(/^( {0,3})([*-]) (.+)$/);
    if (!m) continue;
    const lead = m[1].length;
    const level = lead >= 2 ? 1 : 0;
    while (stack.length > level + 1) close();
    while (stack.length < level + 1) open();
    html.push(`<li>${inlineTransform(m[3])}</li>`);
  }
  while (stack.length > 0) close();
  return html.join('');
}

function mdToHtml(rawBody) {
  const text = rawBody.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = text.split(/\n\s*\n+/);
  const out = [];
  for (const raw of blocks) {
    const block = raw.replace(/^\n+|\n+$/g, '');
    if (block === '') continue;
    const lines = block.split('\n');
    if (lines.length === 1 && /^---+$/.test(lines[0].trim())) {
      out.push('<hr>');
      continue;
    }
    if (lines.length === 1) {
      const h2 = lines[0].match(/^##\s+(.+)$/);
      if (h2) { out.push(`<h2>${inlineTransform(h2[1])}</h2>`); continue; }
      const h1 = lines[0].match(/^#\s+(.+)$/);
      if (h1 && !/^#[가-힣A-Za-z0-9_]+(\s|$)/.test(lines[0])) {
        out.push(`<h1>${inlineTransform(h1[1])}</h1>`);
        continue;
      }
    }
    if (lines.every((l) => l.trim() === '' || isListLine(l))) {
      out.push(listBlockToHtml(lines.filter((l) => l.trim() !== '')));
      continue;
    }
    out.push(`<p>${inlineTransform(block)}</p>`);
  }
  return out.join('\n');
}

// ─── 파일 → entry 변환 ────────────────────────────────────────────────
function parseFile(filePath, userKey) {
  const filename = path.basename(filePath);
  const m = filename.match(FILE_NAME_RE);
  if (!m) return null;
  const date = m[1];
  const titleFromName = m[3]?.trim() || null;
  const raw = fs.readFileSync(filePath, 'utf8');
  const { frontmatter, body } = splitFrontmatter(raw);
  const hashtags = extractHashtags(body);
  const html = mdToHtml(body);
  const ts = `${date}T00:00:00+09:00`;
  return {
    id: deterministicUuid(userKey, `obsidian-navi|${filename}`),
    kind: KIND,
    title: titleFromName,
    content: html,
    meta: {
      obsidian: {
        basename: filename,
        date,
        hasFrontmatter: !!frontmatter,
        ...(frontmatter ? { frontmatter } : {}),
        hashtags,
      },
    },
    is_shared: true,
    pinned: false,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
    _rawLen: raw.length,
    _htmlLen: html.length,
    _filename: filename,
  };
}

function collectFiles(dir) {
  if (!fs.existsSync(dir)) {
    console.error(`디렉터리 없음: ${dir}`);
    process.exit(1);
  }
  const all = fs.readdirSync(dir);
  return all
    .filter((f) => FILE_NAME_RE.test(f))
    .sort()
    .map((f) => path.join(dir, f));
}

// ─── Supabase admin ───────────────────────────────────────────────────
async function getSupabase(env) {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function resolveLeftjapUserId(supabase) {
  if (process.env.USER_ID_LEFTJAP) return process.env.USER_ID_LEFTJAP;
  console.log('  • USER_ID_LEFTJAP 미지정 — auth.admin.listUsers 자동 조회');
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (error) { console.error('listUsers 실패:', error.message); process.exit(1); }
  for (const u of data.users || []) {
    if (u.email === 'leftjap@gmail.com') return u.id;
  }
  console.error('leftjap@gmail.com 의 auth.users uuid 자동 조회 실패. .env.local 에 USER_ID_LEFTJAP 명시 필요.');
  process.exit(1);
}

async function backupExisting(supabase, ownerId) {
  const { data, error } = await supabase
    .from('today_entries')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('kind', KIND);
  if (error) { console.error('백업 SELECT 실패:', error.message); process.exit(1); }
  const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 13);
  const dir = path.join(PROJECT_ROOT, 'handoff');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `leftjap-navi-backup-${stamp}.json`);
  fs.writeFileSync(filePath, JSON.stringify({
    exportedAt: new Date().toISOString(),
    ownerId, kind: KIND,
    count: data.length,
    rows: data,
  }, null, 2));
  console.log(`  ✓ 백업: ${filePath} (${data.length}건)`);
  return { path: filePath, count: data.length };
}

async function deleteExisting(supabase, ownerId) {
  const { data, error } = await supabase
    .from('today_entries')
    .delete()
    .eq('owner_id', ownerId)
    .eq('kind', KIND)
    .select('id');
  if (error) { console.error('DELETE 실패:', error.message); process.exit(1); }
  console.log(`  ✓ 삭제: ${data.length}건`);
  return data.length;
}

async function upsertBatches(supabase, entries) {
  const results = { ok: 0, fail: 0, errors: [] };
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE).map((e) => {
      const { _rawLen, _htmlLen, _filename, ...row } = e;
      return row;
    });
    const { error } = await supabase
      .from('today_entries')
      .upsert(batch, { onConflict: 'id' });
    if (error) {
      results.fail += batch.length;
      results.errors.push({ batchStart: i, code: error.code, message: error.message, hint: error.hint });
      console.error(`  ✗ batch ${i}-${i + batch.length - 1}: ${error.message}${error.code ? ` (${error.code})` : ''}`);
    } else {
      results.ok += batch.length;
      process.stdout.write(`  ✓ insert ${i + batch.length}/${entries.length}\r`);
    }
  }
  if (entries.length > 0) console.log('');
  return results;
}

// ─── dry-run 출력 ─────────────────────────────────────────────────────
function reportDryRun(entries) {
  const stats = {
    total: entries.length,
    withTitle: entries.filter((e) => e.title).length,
    hasFrontmatter: entries.filter((e) => e.meta.obsidian.hasFrontmatter).length,
    withHashtags: entries.filter((e) => e.meta.obsidian.hashtags.length > 0).length,
    dateRange: entries.length > 0
      ? `${entries[0].meta.obsidian.date} ~ ${entries[entries.length - 1].meta.obsidian.date}`
      : '-',
    avgRawLen: Math.round(entries.reduce((s, e) => s + e._rawLen, 0) / Math.max(1, entries.length)),
    avgHtmlLen: Math.round(entries.reduce((s, e) => s + e._htmlLen, 0) / Math.max(1, entries.length)),
  };
  console.log('─── 통계 ───────────────────────────────────────');
  console.log(`  총 파일: ${stats.total}`);
  console.log(`  날짜 범위: ${stats.dateRange}`);
  console.log(`  제목 있는 파일: ${stats.withTitle}`);
  console.log(`  frontmatter 있는 파일: ${stats.hasFrontmatter}`);
  console.log(`  해시태그 줄 있는 파일: ${stats.withHashtags}`);
  console.log(`  평균 raw: ${stats.avgRawLen} chars / HTML: ${stats.avgHtmlLen} chars`);
  console.log('');
  console.log('─── 샘플 3건 (처음/중간/끝) ──────────────────');
  const samples = [entries[0], entries[Math.floor(entries.length / 2)], entries[entries.length - 1]].filter(Boolean);
  for (const s of samples) {
    console.log(`\n  파일: ${s._filename}`);
    console.log(`  id: ${s.id}`);
    console.log(`  title: ${s.title || '(없음)'}`);
    console.log(`  created_at: ${s.created_at}`);
    console.log(`  hashtags: ${s.meta.obsidian.hashtags.join(' ') || '(없음)'}`);
    console.log(`  HTML 처음 300자:\n    ${s.content.slice(0, 300).replace(/\n/g, '\n    ')}${s.content.length > 300 ? '...' : ''}`);
  }
}

// ─── main ─────────────────────────────────────────────────────────────
async function main() {
  loadEnvLocal();
  const obsidianDir = process.env.OBSIDIAN_NAVI_DIR || DEFAULT_OBSIDIAN_DIR;
  console.log(`Obsidian Navi import — mode: ${flags.apply ? 'APPLY' : flags.backupOnly ? 'BACKUP-ONLY' : 'DRY-RUN'}`);
  console.log(`소스: ${obsidianDir}\n`);

  const files = collectFiles(obsidianDir);
  console.log(`  수집된 파일: ${files.length}건`);

  const entries = [];
  const failures = [];
  for (const f of files) {
    try {
      const e = parseFile(f, 'leftjap');
      if (e) entries.push(e);
    } catch (err) {
      failures.push({ file: f, error: err.message });
    }
  }
  if (failures.length > 0) {
    console.error(`\n파싱 실패 ${failures.length}건:`);
    for (const f of failures) console.error(`  - ${f.file}: ${f.error}`);
  }

  if (!flags.apply && !flags.backupOnly) {
    reportDryRun(entries);
    console.log('\nDRY-RUN 완료. 실제 적용은 --apply, 백업만 원하면 --backup-only');
    return;
  }

  requireEnv('VITE_SUPABASE_URL');
  requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = await getSupabase(process.env);
  const ownerId = await resolveLeftjapUserId(supabase);
  console.log(`  owner_id (leftjap): ${ownerId}\n`);

  console.log('[1/3] 기존 leftjap navi 백업...');
  const backup = await backupExisting(supabase, ownerId);
  if (flags.backupOnly) {
    console.log('\nBACKUP-ONLY 완료. 삭제·insert 안 함.');
    return;
  }

  console.log('\n[2/3] 기존 leftjap navi 삭제...');
  const deletedCount = await deleteExisting(supabase, ownerId);
  if (deletedCount !== backup.count) {
    console.error(`경고: 삭제 수(${deletedCount}) ≠ 백업 수(${backup.count}) — 백업 JSON 으로 복구 가능. 중단.`);
    process.exit(1);
  }

  console.log(`\n[3/3] 옵시디언 ${entries.length}건 upsert...`);
  const entriesForDb = entries.map((e) => ({ ...e, owner_id: ownerId }));
  const result = await upsertBatches(supabase, entriesForDb);

  console.log('\n─── 요약 ───────────────────────────────────────');
  console.log(`  백업: ${backup.path} (${backup.count}건)`);
  console.log(`  삭제: ${deletedCount}건`);
  console.log(`  insert: ok=${result.ok}, fail=${result.fail}`);
  if (result.errors.length > 0) {
    console.error('\n실패 상세:');
    for (const e of result.errors) console.error(`  - batch@${e.batchStart}: ${e.message}${e.code ? ` (${e.code})` : ''}${e.hint ? ` — ${e.hint}` : ''}`);
    process.exit(1);
  }
  console.log('\nAPPLY 완료. 브라우저에서 Today 새로고침 (Dexie wipe 권장) 후 사이드바 "오늘의 네비" 확인.');
}

main().catch((e) => { console.error(e); process.exit(1); });
