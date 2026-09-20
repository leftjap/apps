/**
 * 카드 문장의 공급원 대조 — 우선순위대로 골랐는지 센다.
 *   ① 30패턴이 든 모두영어 문장 그대로 → ② 모두영어 그대로 → ③ 30패턴 자작 → ④ 233 뱅크
 * (작업지시서 docs/2026-09-13-dialogue-session-work-order.md §7)
 *
 * 사용: node scripts/dialogue/check-sources.mjs <초안.json> [모두영어.md]
 * 모두영어 기본 경로: ~/apps/tmp/modu_subs/modu_sentences_user_2026-09-12.md (미추적)
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const draftPath = process.argv[2];
const moduPath = process.argv[3] || `${homedir()}/apps/tmp/modu_subs/modu_sentences_user_2026-09-12.md`;
if (!draftPath) { console.error('usage: node scripts/dialogue/check-sources.mjs <초안.json> [모두영어.md]'); process.exit(1); }

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim();
// 영상 FzW2gVf7SCw 의 30패턴 (작업지시서 §7)
export const P30 = [
  [1, "I'm trying to", /\bi'm trying to\b/], [2, "I'm supposed to", /\bi'm supposed to\b/], [3, 'I was about to', /\bi was (just )?about to\b/],
  [4, "I'm here to", /\bi'm here to\b/], [5, "I've been", /\bi've been\b/], [6, 'Let me', /\blet me\b/], [7, 'Can I get', /\bcan i get\b/],
  [8, 'Can you', /\bcan you\b/], [9, 'Do you mind', /\bdo you mind\b/], [10, "I'm not sure if", /\bi'm not sure if\b/], [11, "I don't think", /\bi don't think\b/],
  [12, 'I think you should', /\bi think you should\b/], [13, 'It feels like', /\bit feels like\b/], [14, 'It looks like', /\bit looks like\b/],
  [15, 'It sounds like', /\bit sounds like\b/], [16, "There's", /\bthere's\b|\bthere is\b/], [17, "I'd like to", /\bi'd like to\b/], [18, 'I need you to', /\bi need you to\b/],
  [19, 'I just wanted to', /\bi just wanted to\b/], [20, 'I was wondering if', /\bi was wondering if\b/], [21, 'The thing is', /\bthe thing is\b/],
  [22, 'As far as I know', /\bas far as i know\b/], [23, "You don't have to", /\byou don't have to\b/], [24, 'You might want to', /\byou might want to\b/],
  [25, 'It depends on', /\bit depends on\b/], [26, "I'll let you know", /\bi'll let you know\b/], [27, "I didn't mean to", /\bi didn't mean to\b/],
  [28, "I can't wait to", /\bi can't wait to\b/], [29, "That's why", /\bthat's why\b/], [30, "That's what I mean", /\bthat's what i mean\b/],
];

const modu = []; let part = '';
for (const line of readFileSync(moduPath, 'utf8').split('\n')) {
  if (line.startsWith('## ')) part = line.includes('1편') ? '1편' : '2편';
  const m = line.match(/^(\d+)\. (.+?)\s+[가-힣]/);
  if (m) modu.push({ ref: `${part} #${m[1]}`, n: norm(m[2]) });
}

const scenes = JSON.parse(readFileSync(draftPath, 'utf8'));
const used30 = new Map(); const tier = { a: 0, b: 0, c: 0, d: 0 }; const rows = [];
let exactN = 0, nearN = 0;
for (const s of scenes) for (const c of s.cards) {
  const l = s.lines[c.idx]; const n = norm(l.en);
  const hit = P30.filter(([, , re]) => re.test(n)).map(([num, name]) => `#${num} ${name}`);
  const exact = modu.find((m) => m.n === n);
  const near = !exact && modu.find((m) => n.startsWith(m.n) && n.length - m.n.length <= 6);
  if (exact) exactN++; else if (near) nearN++;
  for (const h of hit) used30.set(h, (used30.get(h) || 0) + 1);
  const t = (exact || near) ? (hit.length ? 'a' : 'b') : (hit.length ? 'c' : 'd');
  tier[t]++;
  rows.push(`${s.slug} | ${t} | ${l.en} | ${hit.join('·') || '-'} | ${exact ? `= ${exact.ref}` : near ? `≈ ${near.ref}` : '-'}`);
}
rows.forEach((r) => console.log(r));
console.log(`\n카드 ${rows.length}장 · 등급 a(30∩모두)=${tier.a} b(모두 그대로)=${tier.b} c(30 자작)=${tier.c} d(233)=${tier.d}`);
console.log(`모두영어 완전 일치 ${exactN} · 최소 수정 ${nearN} · 합계 ${exactN + nearN}/${rows.length}`);
const distinct = [...used30.keys()].sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
console.log(`30패턴 ${distinct.length}종 (카드 ${[...used30.values()].reduce((a, b) => a + b, 0)}장): ${distinct.join(' · ')}`);
console.log(`두 번 이상: ${[...used30].filter(([, v]) => v > 1).map(([k, v]) => `${k} ×${v}`).join(', ') || '없음'}`);
for (const s of scenes) {
  const ks = s.cards.map((c) => norm(String(c.key).replace(/~|\(.*\)/g, '')));
  const dup = ks.filter((k, i) => ks.indexOf(k) !== i);
  if (dup.length) console.log(`⚠ ${s.slug}: 한 장면에 같은 패턴 ${dup.join(', ')}`);
}
