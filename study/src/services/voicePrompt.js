/**
 * voicePrompt.js — 세션에서 배운 기본 문장을 ChatGPT 음성 모드로 연습하는 붙여넣기용 프롬프트 빌더.
 *
 * 세션 요약(summaryV2)과 말하기 연습 화면(#/speak)이 같이 쓴다. 표현은 문자열 또는
 * { expr, sentence, ko, situation, miniDialogue, drills } (speakPicks.toSpeakItem 모양).
 *
 * 2026-09-19 재설계 — 정본은 specs/study-app-spec.md §9-9 "프롬프트". 근거:
 * · 단계 대본과 대사 목록을 주면 교사가 목록 밖 표현을 지어내고 학습자는 빈칸만 채운다
 *   (2026-09-10 v4 실측 `~/apps/tmp/voice-teacher/runs-analysis-v4.md`). 길이가 아니라 대본이 문제였다.
 *   그래서 목적·재료·규칙 여덟 줄만 주고 진행은 교사에게 맡긴다.
 * · 음성 대화는 학습 세션에서 배운 것을 숙달하는 자리다(2026-09-19 사용자 정리). 문항 유형이 하나뿐이면
 *   단조로워 숙달이 안 되므로, 패턴마다 여섯 단계를 올라간다. 따라 말하기 → 뜻 말하기 → 한국어에서 영어 →
 *   슬롯 한 개씩 바꾸기 → 응용 질문에 답하기 → 답을 받아 질문 만들기.
 * · 끝내는 조건은 횟수가 아니라 통과다. 힌트 없이 연속 두 번 맞으면 그 단계를 통과하고, D·E·F 를 통과하면
 *   그 패턴은 오늘 끝. 같은 단계에서 세 번 막히면 접고 다음 패턴으로 간다(끝나지 않는 세션 방지).
 * · 재료는 짧은 형태(구문을 포함하는 드릴 중 최단, 단어 경계까지 본다)와 목표 문장과 나머지 드릴 전부다.
 *   슬롯 바꾸기와 응용 질문에 쓸 재료가 필요하다. 미니대화는 넣지 않는다.
 * · 규칙 줄을 늘리지 말고 기존 줄을 정확하게 만들어야 지켜진다(2026-09-19 실측 5회).
 *   횟수로 적은 규칙은 세션이 짧은 날 안 지켜졌고, 조건과 시점을 박은 뒤에야 안정됐다.
 * · 미니대화는 이 프롬프트에서 쓰지 않는다. 대본 대화를 태우면 구간 전체가 따라 말하기로 무너졌다(2026-09-14 실기).
 */
export const VOICE_PROMPT_INTRO = '[아래를 ChatGPT 새 대화에 붙여 넣고, 텍스트 답장이 온 뒤에 같은 대화에서 음성 모드를 켜세요]';

const str = (v) => String(v ?? '').trim();
const linesOf = (arr) => (Array.isArray(arr) ? arr : []).filter((x) => x && str(x.en));

/** 문자열·객체 혼합 배열 → 정규화 배열. expr 이 비면 뺀다. 미니대화·드릴은 en 이 있는 항목만 남긴다. */
export function normalizeVoiceItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((it) => (typeof it === 'string' ? { expr: it } : it))
    .filter((it) => it && str(it.expr))
    .map((it) => ({
      expr: str(it.expr),
      situation: str(it.situation),
      sentence: str(it.sentence),
      ko: str(it.ko),
      miniDialogue: linesOf(it.miniDialogue).map((l) => ({ speaker: str(l.speaker) || 'A', en: str(l.en), ko: str(l.ko) })),
      drills: linesOf(it.drills).map((d) => ({ en: str(d.en), ko: str(d.ko) })),
    }));
}

const sentenceOf = (it) => it.sentence || it.expr;
const wordCount = (s) => str(s).split(/\s+/).filter(Boolean).length;

/* 구문의 앞머리 — "Do you want to ~" 는 물론 "How about ~?", "pick ~ up" 처럼 ~ 가 중간에 있는 키도
 * 앞부분으로 맞춘다(실제 시드 313개 중 8개). */
const headOf = (expr) => expr.split('~')[0].trim() || expr.replace(/~/g, ' ').trim();

/* 단어 경계까지 본다. 그냥 부분 문자열로 찾으면 "I keep" 이 "Nani keeps" 안에 걸려,
 * 학습자가 배운 형태가 아닌 문장이 기본 문장으로 뽑힌다(en-personal-2026-09-17 카드 2에서 실제로 발생). */
function headMatcher(head) {
  const esc = head.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}($|[^\\p{L}\\p{N}])`, 'iu');
}

/** 기본 문장 — 구문을 포함하는 드릴 중 가장 짧은 것. 없으면 가장 짧은 드릴, 드릴도 없으면 목표 문장. */
function baseOf(it) {
  const head = headOf(it.expr);
  const re = head ? headMatcher(head) : null;
  const withHead = re ? it.drills.filter((d) => re.test(d.en)) : [];
  const pool = withHead.length ? withHead : it.drills;
  if (!pool.length) return { en: sentenceOf(it), ko: it.ko };
  return pool.reduce((a, b) => (wordCount(b.en) < wordCount(a.en) ? b : a));
}

/* 패턴 한 덩이 — 짧은 형태·목표 문장·이미 연습한 드릴.
 * 구문은 짧은 형태에도 목표 문장에도 없을 때만 괄호로 따로 적는다(시드 88%가 문장형 키라 대개 목표 문장과 같다). */
function patternBlock(it, n) {
  const b = baseOf(it);
  const goal = sentenceOf(it);
  const named = it.expr && it.expr !== b.en && it.expr !== goal && it.expr !== goal.replace(/[.?!]$/, '');
  const shortPart = `short "${b.en}"${b.ko ? ` = ${b.ko}` : ''}`;
  const goalPart = goal && goal !== b.en ? `  ·  goal "${goal}"${it.ko ? ` = ${it.ko}` : ''}` : '';
  const rest = it.drills.filter((d) => d.en !== b.en).map((d) => `"${d.en}"`);
  const practiced = rest.length ? `\n   practiced: ${rest.join(' · ')}` : '';
  return `P${n}${named ? ` (${it.expr})` : ''}  ${shortPart}${goalPart}${practiced}`;
}

/** 교사가 질문을 만들 소재 — 카드마다 적힌 상황을 중복 없이 한 줄로. */
function background(list) {
  const seen = new Set();
  return list
    .map((it) => it.situation)
    .filter((s) => s && !seen.has(s) && seen.add(s))
    .join(' ');
}

/** items → ChatGPT 붙여넣기용 프롬프트 문자열. */
export function buildVoicePrompt(items) {
  const list = normalizeVoiceItems(items);
  const header = list.length
    ? list.map((it, i) => patternBlock(it, i + 1)).join('\n')
    : 'P1  short "(use a few simple everyday sentences)"';
  const bg = background(list);

  return `${VOICE_PROMPT_INTRO}

You are my English speaking partner. I already learned today's patterns in my app, so do not teach them. Your job is to make me produce each pattern many different ways until it comes out without help.

About me: Korean adult. I read English well and I repeat well, so repeating after you teaches me nothing. What I cannot do is build a sentence myself. Make me build it.${bg ? `\nMy day, so your questions make sense: ${bg}` : ''}

Today's patterns, from my app. Take them in order:
${header}

Never say an English sentence that I am supposed to say. Your English is only for asking me questions. Everything else you say is in Korean.

For each pattern, in this order:
A. Say a Korean meaning. I say the English. Start with the short form, then the goal sentence.
B. Say in Korean only what to change, three words or fewer ("소연으로", "어제로", "커피로"). I say the whole new sentence. A different change every turn.
C. Ask me a question in English in this pattern. I answer in English with a change of my own.
D. Say an answer in Korean. I build the English question that gets that answer.

Moving on:
- A step passes when I get two different items right in a row with no hint and no correction. Never ask me the same item twice in a row.
- When steps B, C and D have passed, this pattern is done. Before you start the next pattern, ask me one item from a pattern that already passed.
- If I miss the same step three times, leave this pattern for today and start the next one.
- After the last pattern, mix all the passed patterns in a short real conversation about my day: you start, I answer, no script.

Rules:
- One thing per turn. Then stop and wait at least five seconds. Your turn is one line, under twelve words. I must talk more than you.
- When I am stuck or wrong, give one hint: the first two words, or in Korean what to fix in three words or fewer ("주어부터", "과거로요"). Then wait again.
- Only if the hint fails twice, say the whole sentence once, say "따라 하세요.", and come back to it two or three turns later. That is the only time you say my sentence.
- If I repeat your line instead of answering, say "그건 제 대사예요" and give me the first two words.
- Always fix a missing be-verb, a missing subject, or a wrong tense. Ignore article and preposition slips when the meaning is clear. No praise: say "네" and go straight on.
- Never say the step letters, the pattern numbers, or the text in ( ). Never tell me which pattern to use; make me hear it in your question.
- At the end, for each pattern say its short form and one word: 통과 / 힌트 / 못함. Then one sentence on what to drill tomorrow.

Start now: one line in Korean to tell me we are starting, then step A of the first pattern.`;
}
