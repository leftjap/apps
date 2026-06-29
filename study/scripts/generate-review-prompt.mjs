#!/usr/bin/env node
/**
 * generate-review-prompt.mjs — 클로드 음성모드(Haiku 4.5) 영어 복습 프롬프트 생성기.
 *
 * 스터디앱 세션의 학습 표현(study_today_lessons) + 학습자 프로필(~/.config/study/learner-profile.json)
 * → "영어 몰입 음성 대화" 복습 프롬프트를 stdout 출력. 매 새 세션(라우틴 단계 9) + 복습 세션에서 호출.
 *
 * 설계 근거(검증): 영어 주도 대화 + comprehensible(쉽게·천천히) + 전략적 L1 최소(SLA L1 논쟁 — 영어-only 도그마 아님).
 * Voice Mode = Haiku 4.5 → 규칙·예시 명시형.
 *
 * 사용: node scripts/generate-review-prompt.mjs --user-id <uuid> [--mode new|review] [--lang en] [--date YYYY-MM-DD]
 * env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { argv, env, exit } from 'node:process';

function parseArgs(a) {
  const o = { mode: 'new', lang: 'en' };
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === '--user-id') o.userId = a[++i];
    else if (k === '--mode') o.mode = a[++i];
    else if (k === '--lang') o.lang = a[++i];
    else if (k === '--date') o.date = a[++i];
  }
  return o;
}

async function rest(url, key, path) {
  const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

/** 표현 카드 → 학습 대상 청크 (key 의 '=' 앞부분 = 타깃 표현). */
function targetExpr(card) {
  const k = card.explanation?.key || '';
  const left = k.split('=')[0].trim();
  return left || card.sentence || card.id;
}

async function main() {
  const args = parseArgs(argv.slice(2));
  if (!args.userId) { console.error('usage: --user-id <uuid> [--mode new|review] [--lang en]'); exit(1); }
  const url = env.SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); exit(1); }

  const rows = await rest(url, key,
    `/study_today_lessons?user_id=eq.${args.userId}&lang=eq.${args.lang}&select=id,date,order_index,sentence,explanation,completed&order=date.desc,order_index.asc`);
  const exprCards = rows.filter((r) => (r.order_index ?? 0) > 0);
  if (exprCards.length === 0) { console.error('표현 카드 없음 (시드된 세션 없음)'); exit(1); }

  let picked;
  if (args.mode === 'review') {
    // 복습: 완료된 표현 중 오래된 것 우선(spaced retrieval) 최대 8개. 완료 0이면 전체에서.
    const done = exprCards.filter((r) => r.completed);
    picked = (done.length ? done : exprCards).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 8);
  } else {
    // 새 세션: 가장 최근 date 의 표현
    const latest = args.date || exprCards[0].date;
    picked = exprCards.filter((r) => r.date === latest);
  }
  const exprs = [...new Set(picked.map(targetExpr))];

  let p = {};
  try { p = JSON.parse(readFileSync(join(homedir(), '.config', 'study', 'learner-profile.json'), 'utf8')).lang_en || {}; } catch { /* 프로필 부재 시 기본값 */ }
  const goals = (p.goals_priority || ['simple English for traveling', 'understanding dramas without subtitles']).join('; ');
  const household = (p.persona && p.persona.household) || 'I have a wife and a cat';

  const out = `[클로드 음성모드 영어 복습 프롬프트 — 클로드 Project 지시문에 붙여넣고 음파 아이콘 누르세요]

You are my English conversation partner. We talk by VOICE. SPEAK ENGLISH ONLY.

# About me
- Korean man, middle-aged. I read English OK, but my speaking and listening are weak (weaker now with age).
- Goals: ${goals}.
- ${household} — feel free to use them in our chat.

# Today's expressions (I just studied these in my study app)
${exprs.map((e) => `- ${e}`).join('\n')}

# Rules — follow ALL of them, exactly
1. Speak ENGLISH ONLY. Keep every turn SIMPLE, SLOW, and SHORT (1-2 easy sentences). My listening is weak.
2. Make it a natural roleplay in a travel/daily scene (hotel check-in, ordering food, airport, asking directions, chatting about my wife or cat). You lead so I naturally need today's expressions.
3. Target ONE expression at a time; start with the ones I haven't used recently.
4. WAIT for me. If I'm stuck, give a tiny English hint (the first word, or ask again more simply). Never say the answer for me.
5. If I make a mistake, say it back correctly once, slowly ("You can say: ___"), then continue. Don't over-correct.
6. Korean only as a brief, strategic rescue — only if I still don't get it after you simplify twice. One short word, then back to English.
7. When I use a target expression well, praise me briefly ("Nice!", "Sounds natural!").
8. After ~5-10 minutes, wrap up in simple English: which expressions I used well, and one to practice next time.

# Flow
(1) Greet me + set the scene in one short sentence -> (2) lead the roleplay, one expression at a time -> (3) I answer -> (4) brief praise/fix -> (5) next -> (6) wrap up.

Start now with (1). Make your first turn very short. English only.`;
  console.log(out);
}

main().catch((e) => { console.error('FAILED:', e.message); exit(1); });
