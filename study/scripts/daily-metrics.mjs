#!/usr/bin/env node
/**
 * daily-metrics.mjs — daily 트랙 설계 규칙(docs/daily-track-design.md §2) 기계 검증.
 *
 * validate-seed.mjs 는 en 시드 공통 게이트(구조·발음 정합·drills·chain)를 본다.
 * 이 스크립트는 그 위에 daily 트랙 고유 규칙만 본다 — 산출 밴드와 골격 재사용률.
 * 근거: docs/speaking-baseline.md (사용자 실측 평균 3.7단어 · 골격 4종).
 *
 * 사용: node scripts/daily-metrics.mjs [seeds/en-daily-*.json ...]
 * 인자 생략 시 seeds/en-daily-*.json 전부.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argv, exit } from 'node:process';

export const BAND = { sentenceMin: 3, sentenceMax: 6, drillMin: 3, drillMax: 7 };
export const REUSE_FLOOR = 0.7;
export const MINI_TURNS = { min: 2, max: 4 };

/** 단어 수 — validate-seed 의 norm 과 같은 기준(축약형 1단어, 문장부호 제거). */
export const wordCount = (s) =>
  String(s ?? '').toLowerCase().replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim()
    .split(' ').filter(Boolean).length;

/** explanation._skeleton 앞머리 = NEW | OWNED | REUSE. */
const kindOf = (card) => String(card?.explanation?._skeleton ?? '').split(':')[0].trim();

export function measure(payloads) {
  const errors = [];
  const rows = [];
  let cards = 0; let reused = 0;
  const sentWords = []; const drillWords = [];

  for (const p of payloads) {
    const cs = Array.isArray(p.payload?.cards) ? p.payload.cards : [];
    let news = 0;
    for (const c of cs) {
      cards += 1;
      const w = wordCount(c.sentence);
      sentWords.push(w);
      if (w < BAND.sentenceMin || w > BAND.sentenceMax) {
        errors.push(`D-1 ${c.id}: sentence ${w}단어 (밴드 ${BAND.sentenceMin}~${BAND.sentenceMax})`);
      }
      const kind = kindOf(c);
      if (!['NEW', 'OWNED', 'REUSE'].includes(kind)) {
        errors.push(`D-2 ${c.id}: explanation._skeleton 이 NEW|OWNED|REUSE 로 시작하지 않음 ("${c.explanation?._skeleton ?? ''}")`);
      }
      if (kind === 'NEW') news += 1; else reused += 1;

      for (const [i, d] of (c.explanation?.drills ?? []).entries()) {
        const dw = wordCount(d?.en);
        drillWords.push(dw);
        if (dw < BAND.drillMin || dw > BAND.drillMax) {
          errors.push(`D-4 ${c.id}: drills[${i}] ${dw}단어 "${d?.en}" (밴드 ${BAND.drillMin}~${BAND.drillMax})`);
        }
      }
      const turns = (c.explanation?.miniDialogue ?? []).length;
      if (turns < MINI_TURNS.min || turns > MINI_TURNS.max) {
        errors.push(`D-5 ${c.id}: miniDialogue ${turns}턴 (${MINI_TURNS.min}~${MINI_TURNS.max})`);
      }
      if (!c.explanation?._fact) errors.push(`D-7 ${c.id}: _fact 출처 표기 없음`);
    }
    if (news !== 1) errors.push(`D-2 ${p.file}: 신규 골격 ${news}개 (세션당 정확히 1개)`);
    rows.push({ file: basename(p.file), cards: cs.length, news, title: p.payload?.title ?? '' });
  }

  const reuseRate = cards ? reused / cards : 0;
  if (reuseRate < REUSE_FLOOR) {
    errors.push(`D-3 전체 재사용 비율 ${(reuseRate * 100).toFixed(0)}% (하한 ${REUSE_FLOOR * 100}%)`);
  }
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  return {
    ok: errors.length === 0,
    errors,
    rows,
    stats: {
      cards,
      reuseRate,
      sentence: { n: sentWords.length, avg: avg(sentWords), min: Math.min(...sentWords), max: Math.max(...sentWords) },
      drill: { n: drillWords.length, avg: avg(drillWords), min: Math.min(...drillWords), max: Math.max(...drillWords) },
    },
  };
}

const isMain = argv[1] && fileURLToPath(import.meta.url) === argv[1];
if (isMain) {
  const seedsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'seeds');
  const files = argv.slice(2).length
    ? argv.slice(2)
    : readdirSync(seedsDir).filter((f) => /^en-daily-.*\.json$/.test(f)).sort().map((f) => join(seedsDir, f));
  if (!files.length) { console.error('[daily-metrics] seeds/en-daily-*.json 없음'); exit(1); }
  const payloads = files.map((f) => ({ file: f, payload: JSON.parse(readFileSync(f, 'utf8')) }));
  const r = measure(payloads);
  for (const row of r.rows) console.log(`  ${row.file}  카드 ${row.cards} · 신규골격 ${row.news} · ${row.title}`);
  const s = r.stats;
  console.log(`\n  카드 ${s.cards}장 · 재사용 ${(s.reuseRate * 100).toFixed(0)}%`);
  console.log(`  sentence  평균 ${s.sentence.avg.toFixed(1)}단어 (${s.sentence.min}~${s.sentence.max})`);
  console.log(`  drills    평균 ${s.drill.avg.toFixed(1)}단어 (${s.drill.min}~${s.drill.max}) n=${s.drill.n}`);
  if (!r.ok) { for (const e of r.errors) console.error(`[daily-metrics] FAIL: ${e}`); exit(1); }
  console.log('\n[daily-metrics] OK — D-1~D-5·D-7 통과');
}
