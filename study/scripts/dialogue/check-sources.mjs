/**
 * 카드 문장의 공급원 대조 — 우선순위대로 골랐는지 센다.
 *   2026-09-26 순위: ① 영상 30패턴 → ② 모두영어 그대로 → ③ 233 뱅크 (작업지시서 §7, 배정표 §1-3)
 *   등급: a = 30패턴이 든 모두영어 그대로 · b = 30패턴 자작 · c = 모두영어 그대로(30패턴 아님) · d = 233 뱅크
 *         e = 셋 밖 (2026-09-29): d 후보인데 카드의 bank 필드가 없거나, 뱅크에 없는 번호거나, 제외 판정
 *   모두영어의 시제·인칭 변형은 카드에 modu("1편 #187")로 원문을 밝히면 c 로 센다(2026-09-30)
 *
 * 사용: node scripts/dialogue/check-sources.mjs <초안.json> [모두영어.md] [233뱅크.md]  — e 가 있으면 exit 1
 * 모두영어 기본 경로: ~/apps/tmp/modu_subs/modu_sentences_user_2026-09-12.md (미추적)
 * 233 뱅크 기본 경로: ~/apps/tmp/2026-09-11-pattern233-review.md (미추적)
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim();
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

export function loadModu(path = `${homedir()}/apps/tmp/modu_subs/modu_sentences_user_2026-09-12.md`) {
  const modu = []; let part = '';
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line.startsWith('## ')) part = line.includes('1편') ? '1편' : '2편';
    const m = line.match(/^(\d+)\. (.+?)\s+[가-힣]/);
    if (m) modu.push({ ref: `${part} #${m[1]}`, n: norm(m[2]) });
  }
  return modu;
}

// 233 뱅크: §1 표(번호·패턴·판정) + §2 추가 기초 패턴 59개(1묶음 I'll ~ · My ~ hurts, 2묶음 Let's ~ 가 §2 로 233 등급).
// 2026-09-29 — d 를 '30패턴·모두영어가 아님' 으로만 매겨, 뱅크에 없는 자작 문장이 233 으로 읽혔다(4묶음 14장).
// 그래서 d 카드는 bank 필드로 항목을 밝힌다: §1 번호 "112" · §2 "추가 14".
export function parseBank(text) {
  const bank = new Map(); let part = '';
  for (const line of String(text).split('\n')) {
    if (line.startsWith('## ')) part = line.startsWith('## 1.') ? '1' : line.startsWith('## 2.') ? '2' : '';
    const m1 = part === '1' && line.match(/^\| (\d{3}) \| (.+?) \| (유지|통합|보류|제외) \|/);
    const m2 = part === '2' && line.match(/^(\d+)\. (.+?) — /);
    if (m1) bank.set(String(Number(m1[1])), { pattern: m1[2], verdict: m1[3] });
    if (m2) bank.set(`추가 ${m2[1]}`, { pattern: m2[2], verdict: '추가' });
  }
  return bank;
}
export const loadBank = (path = `${homedir()}/apps/tmp/2026-09-11-pattern233-review.md`) => parseBank(readFileSync(path, 'utf8'));
const bankId = (v) => { const s = String(v ?? '').trim(); return /^\d+$/.test(s) ? String(Number(s)) : s.replace(/^추가\s*/, '추가 '); };

// 패턴의 첫 빈칸(~ · -ing) 앞 글자가 문장에 있는지. " / " 대안과 Can/Could 같은 빗금 대안을 펼친다.
// 없으면 시제·비교급 변형(had to ← I have to ~)이거나 엉뚱한 항목이라 사람이 확인한다.
function patternHit(pattern, en) {
  const n = ` ${norm(en)} `;
  const heads = pattern.split(' / ').flatMap((alt) => {
    const words = alt.replace(/[?.!]/g, '').trim().split(/\s+/);
    const cut = words.findIndex((w) => w.includes('~') || w.startsWith('-'));
    const head = cut === -1 ? words : words.slice(0, cut);
    const i = head.findIndex((w) => w.includes('/'));
    return i === -1 ? [head] : head[i].split('/').map((w) => [...head.slice(0, i), w, ...head.slice(i + 1)]);
  });
  return heads.some((h) => !h.length || n.includes(` ${norm(h.join(' '))} `));
}

export function gradeCards(scenes, modu, bank = null) {
  const used30 = new Map(); const tier = { a: 0, b: 0, c: 0, d: 0, e: 0 }; const rows = [];
  let exactN = 0, nearN = 0;
  for (const s of scenes) for (const c of s.cards) {
    const l = s.lines[c.idx]; const n = norm(l.en);
    const hit = P30.filter(([, , re]) => re.test(n)).map(([num, name]) => `#${num} ${name}`);
    const exact = modu.find((m) => m.n === n);
    const near = !exact && modu.find((m) => n.startsWith(m.n) && n.length - m.n.length <= 6);
    if (exact) exactN++; else if (near) nearN++;
    for (const h of hit) used30.set(h, (used30.get(h) || 0) + 1);
    const isModu = !!(exact || near);
    let t = hit.length ? (isModu ? 'a' : 'b') : (isModu ? 'c' : 'd');
    const warn = []; let bankRef = null; let moduRef = exact ? `= ${exact.ref}` : near ? `≈ ${near.ref}` : '-';
    // 카드가 가르치는 표현은 key 다. 문장에 30패턴이 있어도 key 가 관계절이면 드릴은 공급원 밖을 연습한다.
    if ((t === 'a' || t === 'b') && !P30.some(([, , re]) => re.test(norm(String(c.key ?? '').replace(/~/g, ' '))))) {
      warn.push(`key "${c.key}" 가 30패턴이 아님 — 문장의 30패턴을 key 로`);
    }
    // 모두영어 문장의 시제·인칭만 바꾼 카드(I'm not in the mood → I wasn't in the mood)는 일치 검사에 안 걸린다.
    // modu 필드로 원문 번호를 밝히면 모두영어(c)로 세고, 없는 번호면 셋 밖(e).
    if (t === 'd' && c.modu) {
      const m = modu.find((x) => x.ref === String(c.modu).trim());
      if (m) { t = 'c'; moduRef = `≈ ${m.ref} (변형)`; warn.push('모두영어 변형 — 시제·인칭만 다른지 확인'); }
      else { t = 'e'; warn.push(`modu "${c.modu}" 는 모두영어에 없음`); }
    }
    if (t === 'd' && bank) {
      const id = bankId(c.bank); const e = id ? bank.get(id) : null;
      if (!e || e.verdict === '제외') {
        t = 'e';
        warn.push(!c.bank ? 'bank 없음 — 30패턴·모두영어·233 어디에도 없음' : `bank "${c.bank}" ${e ? '는 제외 판정' : '는 뱅크에 없음'}`);
      } else {
        bankRef = `${id} ${e.pattern}`;
        if (!patternHit(e.pattern, l.en)) warn.push(`문장에 "${e.pattern}" 글자가 없음 — 시제·비교급 변형인지 확인`);
      }
    }
    tier[t]++;
    rows.push({ slug: s.slug, tier: t, en: l.en, hit, modu: moduRef, bank: bankRef, warn });
  }
  const dupScenes = [];
  for (const s of scenes) {
    const ks = s.cards.map((c) => norm(String(c.key).replace(/~|\(.*\)/g, '')));
    const dup = ks.filter((k, i) => ks.indexOf(k) !== i);
    if (dup.length) dupScenes.push(`${s.slug}: 한 장면에 같은 패턴 ${dup.join(', ')}`);
  }
  return { rows, tier, exactN, nearN, used30, dupScenes };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const draftPath = process.argv[2];
  if (!draftPath) { console.error('usage: node scripts/dialogue/check-sources.mjs <초안.json> [모두영어.md]'); process.exit(1); }
  const scenes = JSON.parse(readFileSync(draftPath, 'utf8'));
  const g = gradeCards(scenes, loadModu(process.argv[3]), loadBank(process.argv[4]));
  g.rows.forEach((r) => console.log(`${r.slug} | ${r.tier} | ${r.en} | ${r.hit.join('·') || r.bank || '-'} | ${r.modu}${r.warn.length ? ` | ⚠ ${r.warn.join(' · ')}` : ''}`));
  console.log(`\n카드 ${g.rows.length}장 · 등급 a(30∩모두)=${g.tier.a} b(30 자작)=${g.tier.b} c(모두 그대로)=${g.tier.c} d(233)=${g.tier.d} e(셋 밖)=${g.tier.e}`);
  console.log(`30패턴 문장 ${g.tier.a + g.tier.b}/${g.rows.length} · 모두영어 완전 일치 ${g.exactN} · 최소 수정 ${g.nearN}`);
  const distinct = [...g.used30.keys()].sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
  console.log(`30패턴 ${distinct.length}종 (카드 ${[...g.used30.values()].reduce((a, b) => a + b, 0)}장): ${distinct.join(' · ')}`);
  console.log(`두 번 이상: ${[...g.used30].filter(([, v]) => v > 1).map(([k, v]) => `${k} ×${v}`).join(', ') || '없음'}`);
  g.dupScenes.forEach((d) => console.log(`⚠ ${d}`));
  if (g.tier.e) { console.log(`\n✗ 셋 밖 ${g.tier.e}장 — 30패턴·모두영어·233 에서 같은 뜻의 문장을 찾아 바꾼다`); process.exit(1); }
}
