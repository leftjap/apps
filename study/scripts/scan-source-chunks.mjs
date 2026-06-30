#!/usr/bin/env node
/**
 * scan-source-chunks.mjs — 소스 대본 구간에서 **기본동사 청크 후보**만 나열.
 *
 * 라우틴(study-daily-9am) 추출 단계 전에 실행 → 화면의 'salient한' 비기본동사 관용구(wrap it up 류)를
 * 집는 대신, 기본동사(go/take/come/call/help/hold…) 구동사·콜로케이션 중에서 고르도록 후보를 surface.
 * (2026-06-30 'wrap it up' 사고 — office-s1e2 #1~50 엔 hold on·help out·come in 등 기본동사 후보 7종이
 *  있었으나, 후보가 #75 한 줄(have to·call back)에만 몰린 71~77 구간에서 추출이 salient한 비기본동사
 *  wrap it up 을 집은 게 원인. 이 도구로 기본동사 후보를 먼저 보고, 후보가 한두 줄에 몰리면 다른 구간을 고른다.)
 *
 * 사용: node scripts/scan-source-chunks.mjs --episode office-s1e2 [--lines 1,50]
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { argv, exit } from 'node:process';
import { BASIC_VERBS, PARTICLES } from './validate-seed.mjs';

const OBJ_PRON = new Set(['it', 'me', 'you', 'him', 'her', 'us', 'them', 'that', 'this']);
const PREP = new Set([...PARTICLES, 'with', 'at', 'for', 'to', 'about', 'of', 'by', 'from', 'into']);
const ARTICLES = new Set(['a', 'an', 'the']);

/** 한 문장 → 기본동사 머리 청크 후보(구동사·전치사동사·콜로케이션). 비기본동사 머리는 제외. */
export function extractBasicVerbChunks(sentence) {
  const w = String(sentence || '').toLowerCase().replace(/[^a-z' ]/g, ' ').split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < w.length; i++) {
    if (!BASIC_VERBS.has(w[i])) continue;
    const v = w[i];
    if (w[i + 1] && PREP.has(w[i + 1])) out.push(`${v} ${w[i + 1]}`);
    else if (w[i + 1] && OBJ_PRON.has(w[i + 1]) && w[i + 2] && PREP.has(w[i + 2])) out.push(`${v} ${w[i + 2]}`);
    else if (w[i + 1] && ARTICLES.has(w[i + 1]) && w[i + 2]) out.push(`${v} ${w[i + 1]} ${w[i + 2]}`);
  }
  return [...new Set(out)];
}

/** 소스 파일 텍스트 → {num, en} 라인 배열 (s1e1 'EN:' + ep2~ 'N. EN' 양식). */
function parseSource(text) {
  const out = [];
  let cur = null;
  for (const raw of String(text).split('\n')) {
    const m = raw.match(/^(\d+)\.\s*(.*)$/);
    if (m) {
      cur = parseInt(m[1], 10);
      const rest = m[2].trim();
      if (rest && !/^EN:/i.test(rest)) { out.push({ num: cur, en: rest }); cur = null; }
      continue;
    }
    const em = raw.match(/^EN:\s*(.*)$/i);
    if (em && cur != null) { out.push({ num: cur, en: em[1].trim() }); cur = null; }
  }
  return out;
}

function parseArgs(a) {
  const o = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--episode') o.episode = a[++i];
    else if (a[i] === '--lines') o.lines = a[++i];
  }
  return o;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = parseArgs(argv.slice(2));
  if (!args.episode) { console.error('usage: --episode office-s1e2 [--lines 1,50]'); exit(1); }
  const seedsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'seeds');
  const show = /^office/i.test(args.episode) ? 'office' : 'parks';
  const ep = String(args.episode).replace(/^office-?/i, '');
  const text = readFileSync(join(seedsDir, 'sources', `realclass-${show}-${ep}.txt`), 'utf8');
  const lines = parseSource(text);
  const [a, b] = (args.lines || '1,9999').split(',').map(Number);
  const counter = new Map();
  console.log(`[기본동사 청크 후보] ${args.episode} #${a}~${b}\n`);
  for (const l of lines) {
    if (l.num < a || l.num > b) continue;
    const chunks = extractBasicVerbChunks(l.en);
    if (chunks.length) {
      console.log(`  #${l.num}: ${chunks.join(' · ')}   ← "${l.en}"`);
      for (const c of chunks) counter.set(c, (counter.get(c) || 0) + 1);
    }
  }
  const top = [...counter.entries()].sort((x, y) => y[1] - x[1]);
  console.log(`\n빈도순 후보 ${top.length}종: ${top.map(([c, n]) => `${c}(${n})`).join(', ') || '(없음 — 다른 구간/화 선택 권장)'}`);
}
