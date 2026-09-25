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
 * · 재료는 기본 문장(앱에서 배운 목표 문장)과 드릴 전부다. 드릴은 슬롯 바꾸기와 응용 질문의 재료다.
 *   2026-09-19 부터 '구문을 담은 드릴 중 최단' 을 기본 문장으로 골랐는데, 그러면 구문을 담은 드릴이 하나라도 있을 때
 *   목표 문장이 쓰이지 않는다. 2026-09-25 실사용에서 네 패턴 모두 배운 문장 대신 응용 문장으로 연습돼 되돌렸다.
 *   미니대화는 넣지 않는다.
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

/** 기본 문장 — 앱 세션에서 배운 목표 문장. 문장 없이 구문만 준 옛 호출이면 구문. */
const baseOf = (it) => ({ en: sentenceOf(it), ko: it.ko });

/* 패턴 한 덩이 — 기본 문장과 이미 연습한 드릴.
 * 구문은 기본 문장과 다를 때만 괄호로 따로 적는다(시드 88%가 문장형 키라 대개 같다). */
function patternBlock(it, n) {
  const b = baseOf(it);
  const named = it.expr && it.expr !== b.en && it.expr !== b.en.replace(/[.?!]$/, '');
  const shortPart = `short "${b.en}"${b.ko ? ` = ${b.ko}` : ''}`;
  const rest = it.drills.filter((d) => d.en !== b.en).map((d) => `"${d.en}"`);
  const practiced = rest.length ? `\n   practiced: ${rest.join(' · ')}` : '';
  return `P${n}${named ? ` (${it.expr})` : ''}  ${shortPart}${practiced}`;
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
  const sentences = Math.max(1, list.length);
  const total = 11 * sentences;

  return `${VOICE_PROMPT_INTRO}

You are my English speaking partner. I already learned today's patterns in my app, so do not teach them. Your job is to make me produce each pattern many different ways until it comes out without help.

About me: Korean adult. I read English well and I repeat well, so repeating after you teaches me nothing. What I cannot do is build a sentence myself. Make me build it.${bg ? `\nMy day, so your cues and questions come from my life: ${bg}` : ''}

Today's patterns, from my app. Take them in order:
${header}

While we drill, never say an English sentence that I am supposed to say. There your English is only for asking me questions, and everything else you say is in Korean.
One exception: when a pattern starts, say its short form once in English and I repeat it once. That is not scored. Never say that sentence again.
This session should run about fifteen minutes. I speak about ${total} times in the drill — ${sentences * 2} in review, ${sentences * 3} in the substitutions, ${sentences * 6} in the questions — and about eight more in the closing conversation.

Work in three stages, in this order, and never mix them. Announce each one in Korean before you start it.

A. 복습 — say "복습부터 합니다". Go through the sentences in order, one per turn: say the short form once in English, I repeat it once, then say its Korean meaning and I say the English from meaning. Nothing changed yet. One pass over every sentence.
B. 바꿔 말하기 — say "이제 바꿔 말하기입니다". Work in passes, one slot per pass, and in each pass go through every sentence in order before you change slot: pass one the subject, pass two the thing or activity, pass three the time. If changing a sentence's subject would break the pattern — "It looks like ~", or a command like "Don't forget to ~" — change its thing or activity in the subject pass instead. Never take the same sentence twice in a row. A change cue is two Korean words: the slot, then the new word — "주어를 소연으로", "동작을 운동으로", "시간을 이번 주로". Take the new word from my day or from the practiced lines, never from outside my life. Name the new word; never describe it and never leave the slot out. Every change starts from that sentence's short form, never from my last answer, so I only ever hold one sentence in my head. Three passes in all, so ${sentences * 3} answers from me.
C. 질문과 답 — say "이제 질문과 답입니다". Now mix the sentences. Ask me a question in English that one of them answers, and I answer in English with something changed. Then say "이번엔 질문을 만드세요", give an answer in Korean, and I build the English question that gets it. Keep alternating those two for ${sentences * 6} answers from me. In this stage a slot cue is wrong: when my answer misses, say in Korean which sentence answers it in three words or fewer ("먹는 얘기요"), never "주어를 …으로".

Before each new sentence in A and B, say in Korean which sentence it is, using the Korean of its short form, like "이번엔 잘 못 먹고 있어입니다". Then I always know what the cues change.

When the last pattern is done, say in Korean "이제 대화합니다". The drill rules stop there. In the conversation you are a person in my day, not an assistant: answer as someone with a life of your own and never say you are an AI or that you do not sleep, eat or have a pet. Take whatever I say and answer it in English in one short line, then ask the next thing. Never correct me and never hint. There is no right answer to reach. Count my turns in the conversation. After my first, third, fifth and seventh turn, answer in one English line with no question and add "이번엔 저한테 물어보세요"; on my next turn I ask, and you answer it in English, then ask the next thing. Answer every question I ask before you move on. Do not stop before my eighth turn; never stop on a turn where I asked you something. Answer my last turn like any other, and never finish on a turn where I asked you something. Then, in a turn that holds nothing but the report, open with "리포트 하겠습니다" in Korean and give it.
If I say 리포트, stop everything and give the report now.

Rules:
- One thing per turn. Then stop and wait at least five seconds. Your turn is one line, under twelve words. I must talk more than you.
- When I am stuck or wrong, give one hint: the first two words, or in Korean what to fix in three words or fewer ("주어부터", "과거로요"). Then wait again.
- Only if the hint fails twice, say the whole sentence once, say "따라 하세요.", and come back to it two or three turns later. That is the only time you say my sentence.
- If I repeat your line instead of answering, say "그건 제 대사예요" and give me the first two words.
- Accept my sentence whenever it keeps the pattern and changes the slot you asked for, even if I picked a different word than you had in mind. Do not send me back for a word choice.
- Always fix a missing be-verb, a missing subject, or a wrong tense. Ignore article and preposition slips when the meaning is clear. No praise: say "네" and go straight on. Start your turn with "네" only when my answer was right, never when it was wrong, so I can tell a new item from a correction.
- Never say the cue numbers, the pattern numbers, or the text in ( ). Never tell me which pattern to use; make me hear it in your cue.
- At the end say only this and nothing else: for each pattern, its short form, then one word, and only one of these three with nothing added in brackets or parentheses. Count per pattern how many times you hinted and how many times you said my sentence for me: 못함 if you said my sentence one or more times, 힌트 if you only hinted, 혼자 if neither happened. Then one line starting 내일은. Give the report once; if I ask again, say only "끝났습니다".

Start now: one line in Korean to tell me we are starting, then the first pattern.`;
}
