/**
 * 개인화 대화 초안 검증 — 시드로 만들기 전에 돌린다.
 *   (1) 출처 게이트: 줄마다 src 가 있어야 한다. 장면에 date 가 있으면(실제 있었던 날) src 날짜 = 장면 날짜.
 *       date 없는 장면(교재형 창작, 2026-09-26 규칙)은 src 존재만 본다 — 근거는 인물 시트 항목이거나 "(일반 대사)".
 *   (2) 시드 형식: to-seed 와 같은 모양으로 조립해 validate-seed 의 검사를 그대로 받는다
 *   (3) 2026-09-26 규칙(경고): 지오 반응형 줄 편당 2 이하 · 관계사/삽입절 편당 2줄 이상, 지오 줄에 1줄 이상.
 *       둘 다 어림 판정이라 줄에 react:true/false · rel:true/false 를 붙여 덮을 수 있다.
 *
 * 사용: node scripts/dialogue/verify-draft.mjs <초안.json>
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSeedContent } from '../validate-seed.mjs';

// 2묶음(2026-09-20)에서 카드를 채웠던 반응 문장들. 상황을 말하지 않고 앞 줄에 맞장구만 치는 줄.
const REACTIVE = /^(yes\b|no\b|yeah\b|yep\b|right\b|exactly\b|absolutely\b|of course\b|me too\b|same here\b|i agree\b|got it\b|i understand\b|makes sense\b|that's it\b|that sounds\b|sounds (good|great)|i feel the same|you might be right|i didn't expect that|i couldn't agree more|no harm done|it's (not that bad|worth (a try|it)|finally over|better than nothing|up to you)|i'm not sure yet|let me think about it|that's (great|a relief|okay|fine|true)|i see\b|okay\b|sure\b|fair enough|don't worry about it|leave it to me|i'm up for anything|it was worth the wait|i can't get enough of it|i owe you|thanks?\b|thank you\b|good idea|no problem)/i;
export const isReactive = (en) => REACTIVE.test(String(en || '').trim());

// 관계사·삽입절 어림. 문두 Where/What 의문문은 세지 않는다. 접촉절(the room I booked)은 못 잡으므로 rel:true 로 표시한다.
const REL = [
  /\b\w+['’]?\w*,?\s+(who|whom|whose|which|where|when)\b/i,                        // "the bus which…", "know where…", "my wife, who's…"
  /\b(what|whatever)\s+(i|you|we|they|he|she|it)\b/i,                               // "what I mean"
  /\b(the|this|that|a|an|any|every|some|no)\s+\w+\s+(that|who|which)\s+\w+/i,       // "the bus that goes"
  /\b(know|sure|tell me|ask|wonder(ing)?|remember|find out|see|check|heard?)\s+(if|whether|where|when|what|which|who|how)\b/i, // 삽입 의문절
  /\b(the|this|that|these|those|my|our|your|his|her|their|a|an|any|every|some|no)\s+\w+(\s+\w+)?\s+(i|you|we|they|he|she|i'm|you're|we're|they're|he's|she's)\b/i, // 접촉절(명사구 1~2단어) "the seat I picked", "the hotel I'm staying at" (2026-09-26 보강)
];
export const hasRelClause = (en) => { const s = String(en || '').trim(); return REL.some((re) => re.test(s)); };

export function checkDraft(scenes) {
  const srcErrors = []; const extraWarnings = [];
  for (const s of scenes) {
    s.lines.forEach((l, i) => {
      if (!l.src || !String(l.src).trim()) srcErrors.push(`${s.slug} ${i + 1}줄 "${l.en}": src 없음 → 근거 없는 줄`);
      else if (s.date && !String(l.src).startsWith(s.date)) srcErrors.push(`${s.slug} ${i + 1}줄: src 날짜(${String(l.src).slice(0, 5)}) ≠ 장면 날짜(${s.date}) → 다른 날 사건 혼합`);
    });
    const gio = s.lines.filter((l) => l.sp === 'B');
    const reactive = gio.filter((l) => l.react === true || (l.react !== false && isReactive(l.en)));
    if (reactive.length > 2) extraWarnings.push(`${s.slug}: 지오 반응형 줄 ${reactive.length}개 — 편당 2 이하 (${reactive.map((l) => `"${l.en}"`).join(' ')})`);
    const rel = s.lines.filter((l) => l.rel === true || (l.rel !== false && hasRelClause(l.en)));
    if (rel.length < 2) extraWarnings.push(`${s.slug}: 관계사·삽입절 줄 ${rel.length}개 — 편당 2줄 이상 (접촉절은 rel:true 로 표시)`);
    if (!rel.some((l) => l.sp === 'B')) extraWarnings.push(`${s.slug}: 지오 줄에 관계사·삽입절이 없음 — 카드 하나는 관계사 문장으로`);
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
  return { srcErrors, extraWarnings, cards, errors: r.errors, warnings: r.warnings };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const draftPath = process.argv[2];
  if (!draftPath) { console.error('usage: node scripts/dialogue/verify-draft.mjs <초안.json>'); process.exit(1); }
  const scenes = JSON.parse(readFileSync(draftPath, 'utf8'));
  const r = checkDraft(scenes);
  const boundary = (x) => /문장 경계 있음/.test(x);
  console.log(`장면 ${scenes.length}편 · 카드 ${r.cards.length}장`);
  console.log(`\n### 출처 게이트 ERROR (${r.srcErrors.length})`); r.srcErrors.forEach((e) => console.log('  ', e));
  console.log(`\n### 시드 형식 ERROR (${r.errors.length})`); r.errors.forEach((e) => console.log('  ', e));
  console.log(`\n### 2026-09-26 규칙 WARN (${r.extraWarnings.length}) — 반응형·관계사`); r.extraWarnings.forEach((e) => console.log('  ', e));
  const warn = [...new Set(r.warnings.filter((x) => !boundary(x)))];
  console.log(`\n### WARN — 문장 경계 건 제외, 중복 제거 (${warn.length})`); warn.forEach((e) => console.log('  ', e));
  process.exit(r.srcErrors.length + r.errors.length > 0 ? 1 : 0);
}
