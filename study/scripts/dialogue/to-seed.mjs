/**
 * 개인화 대화 초안(JSON) → 시드 파일. 초안 한 편 = 시드 한 개(= 세션 한 개).
 *
 * 사용: node scripts/dialogue/to-seed.mjs --draft <초안.json> --start-date 2026-09-30 [--out-dir seeds] [--dry-run]
 *
 * 초안 한 편의 모양 (배열로 여러 편):
 *   { slug, date("MM-DD" 일기 날짜), title, situation,
 *     lines: [{ sp:"A"|"B", name, en, ko, kr, src("MM-DD 원문 구절") }] × 6~8,
 *     cards: [{ idx(lines 인덱스, sp==="B"), slug, key, gloss, anchor, mistake, similar,
 *               chunks:[[en조각, kr조각, 뜻]], phonemes:[[음소, 설명]], category, frequency,
 *               drills:[{ en, ko, kr }] × 4+ }] }
 *
 * chunks 는 kr 조각을 공백으로 이으면 카드 문장의 kr 과 완전히 같아야 하고, en 조각을 이으면
 * 문장 전단어를 덮어야 한다 (validate-seed 차단 규칙). 손으로 맞춘다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const draftPath = arg('--draft');
const startDate = arg('--start-date');
const outDir = arg('--out-dir', 'seeds');
const dryRun = process.argv.includes('--dry-run');
if (!draftPath || !startDate) { console.error('usage: --draft <초안.json> --start-date YYYY-MM-DD [--out-dir seeds] [--dry-run]'); process.exit(1); }

const plusDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const scenes = JSON.parse(readFileSync(draftPath, 'utf8'));
const written = [];
scenes.forEach((s, si) => {
  const miniDialogue = s.lines.map((l) => ({ speaker: l.sp, name: l.name, en: l.en, ko: l.ko, kr: l.kr }));
  const cards = s.cards.map((c, n) => {
    const l = s.lines[c.idx];
    if (!l || l.sp !== 'B') throw new Error(`${s.slug}/${c.slug}: cards[].idx 가 지오(B) 줄이 아님`);
    for (const f of ['chunks', 'phonemes', 'category', 'frequency', 'drills']) {
      if (c[f] == null) throw new Error(`${s.slug}/${c.slug}: ${f} 없음`);
    }
    return {
      id: `en-personal-${s.slug}-0${n + 1}-${c.slug}`,
      sentence: l.en, meaning: l.ko, reading: null, phonetic_kr: l.kr, order_index: n + 1,
      explanation: {
        key: `${c.key} = ${c.gloss}`, anchor: c.anchor, situation: s.situation, miniDialogue,
        drills: c.drills.map((d) => ({ en: d.en, ko: d.ko, kr: d.kr })),
        grammar: [{ struct: c.key, body: c.gloss }],
        chunks: c.chunks, phonemes: c.phonemes,
        mistake: c.mistake, similar: c.similar, category: c.category, frequency: c.frequency,
      },
    };
  });
  const date = plusDays(startDate, si);
  const payload = { lang: 'en', track: 'personal', date, cards };
  const out = join(outDir, `en-personal-${date}.json`);
  if (!dryRun) writeFileSync(out, JSON.stringify(payload, null, 1) + '\n');
  written.push(`${date}  ${s.slug.padEnd(14)} 카드 ${cards.length}  ${out}`);
});
console.log(written.join('\n'));
console.log(`${dryRun ? '[dry-run] ' : ''}시드 ${written.length}개`);
