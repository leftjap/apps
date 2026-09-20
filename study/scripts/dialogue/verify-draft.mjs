/**
 * 개인화 대화 초안 검증 — 시드로 만들기 전에 돌린다.
 *   (1) 출처 게이트: 줄마다 src 가 있어야 하고, src 날짜 = 장면의 일기 날짜 (장면 하나 = 일기 한 편)
 *   (2) 시드 형식: to-seed 와 같은 모양으로 조립해 validate-seed 의 검사를 그대로 받는다
 *
 * 사용: node scripts/dialogue/verify-draft.mjs <초안.json>
 */
import { readFileSync } from 'node:fs';
import { validateSeedContent } from '../validate-seed.mjs';

const draftPath = process.argv[2];
if (!draftPath) { console.error('usage: node scripts/dialogue/verify-draft.mjs <초안.json>'); process.exit(1); }
const scenes = JSON.parse(readFileSync(draftPath, 'utf8'));

const srcErrors = [];
for (const s of scenes) {
  if (!s.date) srcErrors.push(`${s.slug}: 장면에 date 없음`);
  s.lines.forEach((l, i) => {
    if (!l.src || !String(l.src).trim()) srcErrors.push(`${s.slug} ${i + 1}줄 "${l.en}": src 없음 → 창작`);
    else if (!String(l.src).startsWith(s.date)) srcErrors.push(`${s.slug} ${i + 1}줄: src 날짜(${String(l.src).slice(0, 5)}) ≠ 장면 날짜(${s.date}) → 다른 날 사건 혼합`);
  });
}

const cards = [];
for (const s of scenes) {
  const miniDialogue = s.lines.map((l) => ({ speaker: l.sp, name: l.name, en: l.en, ko: l.ko, kr: l.kr }));
  s.cards.forEach((c, n) => {
    const l = s.lines[c.idx];
    cards.push({ id: `en-personal-${s.slug}-0${n + 1}-${c.slug}`, sentence: l.en, meaning: l.ko, reading: null,
      phonetic_kr: l.kr, order_index: n + 1,
      explanation: { key: `${c.key} = ${c.gloss}`, anchor: c.anchor, situation: s.situation, miniDialogue,
        drills: c.drills, grammar: [{ struct: c.key, body: c.gloss }], chunks: c.chunks, phonemes: c.phonemes,
        mistake: c.mistake, similar: c.similar, category: c.category, frequency: c.frequency } });
  });
}
const r = validateSeedContent({ lang: 'en', track: 'personal', date: '2026-01-01', cards }, {});
const boundary = (x) => /문장 경계 있음/.test(x);

console.log(`장면 ${scenes.length}편 · 카드 ${cards.length}장`);
console.log(`\n### 출처 게이트 ERROR (${srcErrors.length})`);
srcErrors.forEach((e) => console.log('  ', e));
console.log(`\n### 시드 형식 ERROR (${r.errors.length})`);
r.errors.forEach((e) => console.log('  ', e));
const warn = [...new Set(r.warnings.filter((x) => !boundary(x)))];
console.log(`\n### WARN — 문장 경계 건 제외, 중복 제거 (${warn.length})`);
warn.forEach((e) => console.log('  ', e));
process.exit(srcErrors.length + r.errors.length > 0 ? 1 : 0);
