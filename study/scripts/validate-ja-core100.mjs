#!/usr/bin/env node
/**
 * validate-ja-core100.mjs — 일본어 코어100 시드 콘텐츠 게이트.
 *
 * 배경: `validate-seed.mjs` 는 `lang === 'en'` 에서만 상세 검사를 돌린다(구조 검증만 통과하면 ja 는 무사통과).
 * ja-core100 은 초보 학습자용이라 reading·음차·drills 4필드가 빠지면 카드가 통째로 못 읽히는 물건이 된다
 * → guide-ja §14-5 체크리스트를 기계화해 INSERT 전에 막는다.
 *
 * 사용: node scripts/validate-ja-core100.mjs seeds/ja-core100-*.json
 */
import { readFileSync } from 'node:fs';
import { argv, exit } from 'node:process';

const KANJI = /[一-鿿]/;
const KATAKANA = /[ァ-ヺー]/;
/** 커리큘럼 §7-1 학습 한자 26자 — 2회 이상 등장분. 이 글자가 있으면 kanji_breakdown 의무. */
export const STUDY_KANJI = new Set('願行何少食一日言帰大丈夫好本語電写真撮予約名上持待来'.split(''));
const REQUIRED_EXPL = ['key', 'whenToUse', 'grammar', 'chunks', 'drills', 'kanji_breakdown', 'katakana_gloss', 'mistake', 'similar', 'politeness', 'category', 'frequency'];
const POLITENESS = new Set(['casual', 'polite', 'formal']);

/** 카드 1장 검사 → 에러 문자열 배열. */
export function validateJaCard(c) {
  const e = [];
  const id = c?.id || '(id 없음)';
  for (const f of ['id', 'sentence', 'meaning', 'phonetic_kr']) {
    if (!c?.[f]) e.push(`${id}: ${f} 누락`);
  }
  if (!Number.isInteger(c?.order_index)) e.push(`${id}: order_index 정수 아님`);
  const ex = c?.explanation;
  if (!ex || typeof ex !== 'object') { e.push(`${id}: explanation 누락`); return e; }
  for (const f of REQUIRED_EXPL) {
    if (ex[f] === undefined || ex[f] === null) e.push(`${id}: explanation.${f} 누락`);
  }

  const sentence = String(c.sentence ?? '');
  const hasKanji = KANJI.test(sentence);
  // reading — 한자 있으면 의무, 없으면 null (있으면 화면에 같은 줄이 두 번 뜬다)
  if (hasKanji && !c.reading) e.push(`${id}: 한자가 있는데 reading 누락 (초보는 한자를 못 읽는다)`);
  if (!hasKanji && c.reading) e.push(`${id}: 한자 0개인데 reading 이 있다 → null 이어야 한다 (중복 표시)`);
  if (c.reading && KANJI.test(String(c.reading))) e.push(`${id}: reading 에 한자가 남아 있다`);

  // chunks — 문장 전체 커버 + phonetic_kr 정합
  const chunks = Array.isArray(ex.chunks) ? ex.chunks : [];
  if (!chunks.length) e.push(`${id}: chunks 비어 있음`);
  else {
    const bad = chunks.findIndex((k) => !Array.isArray(k) || k.length < 2 || !k[0] || !k[1]);
    if (bad >= 0) e.push(`${id}: chunks[${bad}] 형식 오류 ([표기, 한글음차] 이어야 함)`);
    const strip = (s) => String(s).replace(/[\s、。！？]/g, '');
    if (strip(chunks.map((k) => k[0]).join('')) !== strip(sentence)) {
      e.push(`${id}: chunks 가 문장 전체를 덮지 않음 — "${chunks.map((k) => k[0]).join('')}" vs "${sentence}"`);
    }
    const joined = chunks.map((k) => k[1]).join(' ');
    if (joined !== c.phonetic_kr) e.push(`${id}: phonetic_kr 불일치 — chunks 이어붙임 "${joined}" ≠ "${c.phonetic_kr}"`);
  }

  // drills — 4~8개, ja/kana/ko/kr 4필드, 원문 그대로 베끼기 금지, 서로 중복 금지
  const drills = Array.isArray(ex.drills) ? ex.drills : [];
  if (drills.length < 4 || drills.length > 8) e.push(`${id}: drills 는 4~8개 (현재 ${drills.length})`);
  const seen = new Set();
  drills.forEach((d, i) => {
    for (const f of ['ja', 'kana', 'ko', 'kr']) {
      if (!d?.[f]) e.push(`${id}: drills[${i}].${f} 누락 (ja 는 kana 포함 4필드 의무)`);
    }
    const key = String(d?.ja ?? '').replace(/[\s、。！？]/g, '');
    if (key && seen.has(key)) e.push(`${id}: drills[${i}] 중복 — "${d.ja}"`);
    seen.add(key);
    if (key && key === sentence.replace(/[\s、。！？]/g, '')) {
      e.push(`${id}: drills[${i}] 가 원문과 동일 — 변주가 아니다`);
    }
    if (d?.kana && KANJI.test(String(d.kana))) e.push(`${id}: drills[${i}].kana 에 한자가 남아 있다`);
  });

  // kanji_breakdown — 학습 한자 26자 포함 시 의무
  const kb = Array.isArray(ex.kanji_breakdown) ? ex.kanji_breakdown : [];
  const studyHits = [...new Set(sentence.split('').filter((ch) => STUDY_KANJI.has(ch)))];
  for (const ch of studyHits) {
    if (!kb.some((k) => k?.kanji === ch)) e.push(`${id}: 학습 한자 '${ch}' 의 kanji_breakdown 누락`);
  }
  kb.forEach((k, i) => {
    for (const f of ['kanji', 'reading', 'meaning', 'korean_meaning']) {
      if (!k?.[f]) e.push(`${id}: kanji_breakdown[${i}].${f} 누락 (korean_meaning = 한국 한자 훈음)`);
    }
  });

  // katakana_gloss — 가타카나 단어 있으면 의무
  const kg = Array.isArray(ex.katakana_gloss) ? ex.katakana_gloss : [];
  const kataWords = [...new Set((sentence.match(/[ァ-ヺー]+/g) || []))];
  for (const w of kataWords) {
    if (!kg.some((g) => String(g?.word ?? '').includes(w) || w.includes(String(g?.word ?? '')))) {
      e.push(`${id}: 가타카나 '${w}' 의 katakana_gloss 누락 (학습자가 가타카나를 자꾸 잊는다)`);
    }
  }
  kg.forEach((g, i) => {
    for (const f of ['word', 'origin', 'hiragana', 'kr']) {
      if (!g?.[f]) e.push(`${id}: katakana_gloss[${i}].${f} 누락`);
    }
    if (g?.hiragana && KATAKANA.test(String(g.hiragana))) e.push(`${id}: katakana_gloss[${i}].hiragana 가 가타카나다`);
  });

  // grammar — korean_parallel 의무 (일본어는 어순이 한국어와 같아 초보에게 가장 강한 설명)
  const g = ex.grammar;
  if (!g || typeof g !== 'object' || Array.isArray(g)) e.push(`${id}: grammar 는 {structure, explanation, korean_parallel} 객체여야 함`);
  else for (const f of ['structure', 'explanation', 'korean_parallel']) {
    if (!g[f]) e.push(`${id}: grammar.${f} 누락`);
  }

  // similar / politeness / frequency
  const sim = Array.isArray(ex.similar) ? ex.similar : [];
  if (!sim.length) e.push(`${id}: similar 비어 있음`);
  sim.forEach((s, i) => {
    for (const f of ['expression', 'politeness', 'nuance']) if (!s?.[f]) e.push(`${id}: similar[${i}].${f} 누락`);
    if (s?.politeness && !POLITENESS.has(s.politeness)) e.push(`${id}: similar[${i}].politeness 값 오류 (${s.politeness})`);
  });
  if (ex.politeness && !POLITENESS.has(ex.politeness)) e.push(`${id}: politeness 값 오류 (${ex.politeness})`);
  if (!(Number(ex.frequency) >= 1 && Number(ex.frequency) <= 10)) e.push(`${id}: frequency 는 1~10`);

  // 금지 필드
  if (ex.chain) e.push(`${id}: chain 은 ja-core100 에서 미사용 (사용자 지시)`);
  for (const f of ['skitId', 'scene_id', 'scene_order', 'is_stretch']) {
    if (ex[f] !== undefined) e.push(`${id}: 콩트 메타 ${f} 는 미사용`);
  }
  return e;
}

/** payload 전체 검사. */
export function validateJaPayload(p) {
  const e = [];
  if (p?.lang !== 'ja') e.push(`lang 은 'ja' 여야 함 (현재 ${p?.lang})`);
  if (p?.track !== 'ja-core100') e.push(`track 은 'ja-core100' 이어야 함 (현재 ${p?.track})`);
  if (!p?.date) e.push('date 누락');
  const cards = Array.isArray(p?.cards) ? p.cards : [];
  if (!cards.length) e.push('cards 비어 있음');
  const ids = new Set();
  for (const c of cards) {
    if (ids.has(c?.id)) e.push(`ID 중복: ${c?.id}`);
    ids.add(c?.id);
    e.push(...validateJaCard(c));
  }
  return e;
}

const isMain = argv[1] && argv[1].endsWith('validate-ja-core100.mjs');
if (isMain) {
  const files = argv.slice(2);
  if (!files.length) { console.error('사용: node scripts/validate-ja-core100.mjs <seed.json ...>'); exit(2); }
  let total = 0;
  for (const f of files) {
    const errs = validateJaPayload(JSON.parse(readFileSync(f, 'utf8')));
    if (errs.length) {
      console.error(`\n[FAIL] ${f} — ${errs.length}건`);
      errs.forEach((x) => console.error('  -', x));
      total += errs.length;
    } else {
      console.log(`[OK] ${f}`);
    }
  }
  exit(total ? 1 : 0);
}
