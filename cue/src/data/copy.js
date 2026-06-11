/* copy.js — v8 화면의 모든 사용자 문장 생성 (작업지시서 §9 단일 검사 지점).
   규칙: 해요체 / 라벨만 명사형 / 번역투·반말 종결·빈 격려·죄책감 어법 금지 /
   beat = "오늘 [최소 행동]이면 [구체 결과]예요 — [기준 기록]".
   adapter 가 수치를 계산해 ctx 로 넘기고, 여기서 hook/sub/records/beat/total 을 만든다. */
import { relativeDayLabel, dayMeta } from './transforms.js';

/** 분 → "38시간" (1시간 미만은 "45분") */
export function hoursLabel(min) {
  return min >= 60 ? `${Math.round(min / 60)}시간` : `${Math.round(min)}분`;
}

/** "어제는 9분" / "3일 전엔 12분" — 조사 처리 */
export function lastNote(daysAgo, amount) {
  const l = relativeDayLabel(daysAgo);
  return daysAgo <= 2 ? `${l}는 ${amount}` : `${l}엔 ${amount}`;
}

/** 한글 받침 유무에 따라 이/가 */
export function iGa(word) {
  const ch = word.charCodeAt(word.length - 1);
  if (ch < 0xac00 || ch > 0xd7a3) return '가';
  return (ch - 0xac00) % 28 ? '이' : '가';
}

/** "M월 D일" — daysAgo 일 전 날짜 */
function mdLabel(daysAgo, today) {
  const { m, d } = dayMeta(daysAgo, today);
  return `${m}월 ${d}일`;
}

/** 연속일 기반 beat (독서·어학 공용) */
export function beatStreak(minAction, done, streak, best) {
  if (done) {
    return streak >= best
      ? `오늘로 ${streak}일 연속 — 최장 기록이에요`
      : `오늘로 ${streak}일 연속이에요 — 최장 기록은 ${best}일`;
  }
  const next = streak + 1;
  if (best <= 0) return `${minAction} 1일째예요 — 첫 기록이 시작돼요`;
  if (next > best) return `${minAction} ${next}일 연속 — 최장 기록 ${best}일을 넘어서요`;
  return `${minAction} ${next === 1 ? '1일째예요' : `${next}일 연속이에요`} — 최장 기록은 ${best}일`;
}

/** 최장 연속 record 공용 — note 는 현재값과의 격차 (§8) */
function streakRecord(streak, best, minAction) {
  return {
    lb: '최장 연속', v: `${best}일`,
    note: streak > 0 ? `지금 ${streak}일째예요` : `${minAction} 1일째예요`,
  };
}

export function buildRead(c) {
  const none = c.lastDaysAgo == null && !c.done;
  return {
    name: '독서', cta: '이어 읽기',
    hook: none
      ? { title: '아직 기록이 없어요', strong: '', tail: '' }
      : { title: relativeDayLabel(c.lastDaysAgo), strong: `${c.lastVal}분`, tail: ' 읽었어요' },
    hookDone: { title: '오늘', strong: `${c.todayMin}분`, tail: ' 읽었어요' },
    sub: c.done
      ? (c.streak >= 2 ? `${c.streak}일 연속이에요` : '오늘 다시 시작했어요')
      : c.streak > 0 ? `${c.streak}일 연속이에요`
      : c.lastDaysAgo != null ? `마지막으로 읽은 날은 ${mdLabel(c.lastDaysAgo, c.today)}이에요`
      : '오늘 10분이면 시작할 수 있어요',
    records: [
      streakRecord(c.streak, c.best, '오늘 읽으면'),
      { lb: '하루 최고', v: `${c.dayBest}분`,
        note: c.done ? `오늘은 ${c.todayMin}분` : c.lastVal != null ? lastNote(c.lastDaysAgo, `${c.lastVal}분`) : undefined },
      { lb: '올해 누적', v: hoursLabel(c.yearMin), note: `${c.yearDays}일 읽었어요` },
    ],
    beat: beatStreak('오늘 읽으면', c.done, c.streak, c.best),
    total: `올해 ${hoursLabel(c.yearMin)}`,
  };
}

export function buildWrite(c) {
  return {
    name: '글쓰기', cta: '이어 쓰기',
    hook: c.doc
      ? { title: `「${c.doc.title}」 —`, strong: `${c.doc.sheets}매`, tail: '까지 썼어요' }
      : { title: '아직 글이 없어요', strong: '', tail: '' },
    sub: c.done
      ? `오늘 ${c.todaySheets}매 썼어요`
      : c.lastDaysAgo != null ? `마지막으로 쓴 날은 ${mdLabel(c.lastDaysAgo, c.today)}이에요`
      : '오늘 한 매면 시작할 수 있어요',
    records: [
      { lb: '하루 최고', v: `${c.dayBest}매`,
        note: c.done ? `오늘은 ${c.todaySheets}매` : c.lastSheets != null ? `지난번엔 ${c.lastSheets}매` : undefined },
      { lb: '이번 달', v: `${c.monthSheets}매`,
        note: c.prevMonthSheets != null ? `${c.prevMonthName}월엔 ${c.prevMonthSheets}매` : undefined },
      { lb: '올해 누적', v: `${c.yearSheets}매`, note: `${c.yearDays}일 썼어요` },
    ],
    beat: c.done
      ? (c.todaySheets >= c.dayBest ? `오늘 ${c.todaySheets}매 — 하루 최고 기록이에요` : `오늘 ${c.todaySheets}매 — 하루 최고는 ${c.dayBest}매예요`)
      : c.doc ? `오늘 한 매만 보태도 「${c.doc.title}」${iGa(c.doc.title)} 다시 자라요`
      : '오늘 한 매면 첫 글이 시작돼요',
    total: `올해 ${c.yearSheets}매`,
  };
}

export function buildLang(c) {
  const sceneToday = c.scene && c.scene.m === c.today.getMonth() + 1 && c.scene.d === c.today.getDate();
  return {
    name: '어학', cta: '오늘 분량 시작',
    hook: c.scene
      ? { title: `「${c.scene.title}」 ·`, strong: `${c.scene.m}월 ${c.scene.d}일`, tail: '이 마지막이에요' }
      : c.lastDaysAgo != null
        ? { title: '마지막 학습은', strong: mdLabel(c.lastDaysAgo, c.today), tail: '이에요' }
        : { title: '아직 기록이 없어요', strong: '', tail: '' },
    hookDone: {
      title: sceneToday ? `오늘 「${c.scene.title}」` : '오늘',
      strong: `${c.todayMin}분`, tail: ' 했어요',
    },
    sub: c.done
      ? (c.streak >= 2 ? `${c.streak}일 연속이에요` : '오늘 다시 시작했어요')
      : c.lastDaysAgo != null ? '오늘 10분이면 다시 시작할 수 있어요' : '오늘 10분이면 시작할 수 있어요',
    records: [
      streakRecord(c.streak, c.best, '오늘 하면'),
      { lb: '하루 최고', v: `${c.dayBest}분`,
        note: c.done ? `오늘은 ${c.todayMin}분` : c.lastVal != null ? lastNote(c.lastDaysAgo, `${c.lastVal}분`) : undefined },
      { lb: '올해 누적', v: hoursLabel(c.yearMin), note: `${c.yearDays}일 했어요` },
    ],
    beat: beatStreak('오늘 10분이면', c.done, c.streak, c.best),
    total: `올해 ${hoursLabel(c.yearMin)}`,
  };
}

export function buildGym(c) {
  const remain = Math.max(0, 4 - c.weekCount);
  const nextW = c.w4.cur + 1;
  return {
    name: '운동', cta: '운동 기록 열기', ctaDone: '오늘 기록 보기',
    hook: c.weekCount > 0
      ? { title: '이번 주', strong: `${c.weekCount}회`, tail: ' 했어요 — 목표는 주 4일' }
      : { title: '이번 주 첫 운동 전이에요 —', strong: '목표는 주 4일', tail: '' },
    hookDone: { title: `오늘 ${c.atLabel}${c.tag ? ` · ${c.tag}` : ''}`, strong: `${c.todayMin}분`, tail: '' },
    sub: c.done
      ? `이번 주 ${c.weekCount}회 — 목표는 주 4일이에요`
      : c.w4.cur > 0 ? `${c.w4.cur}주 연속으로 주 4일을 지켰어요`
      : c.lastDaysAgo != null ? `마지막 운동은 ${relativeDayLabel(c.lastDaysAgo)}예요`
      : '이번 주 4일이 목표예요',
    records: [
      { lb: '주 4일 연속', v: `${c.w4.cur}주`, note: `최고 기록은 ${c.w4.best}주` },
      { lb: '하루 최고', v: `${c.dayBest}분`,
        note: c.done ? `오늘은 ${c.todayMin}분` : c.lastVal != null ? `지난번엔 ${c.lastVal}분` : undefined },
      { lb: '올해 운동', v: `${c.yearCount}회`, note: `모두 ${hoursLabel(c.yearMin)}` },
    ],
    beat: c.weekCount >= 4
      ? `이번 주 4일을 채웠어요 — ${c.w4.cur}주 연속이에요`
      : c.w4.best <= 0 ? `이번 주 ${remain}번 더 하면 주 4일 첫 달성이에요`
      : nextW > c.w4.best ? `이번 주 ${remain}번 더 하면 ${nextW}주 연속 — 최고 기록 ${c.w4.best}주를 넘어서요`
      : `이번 주 ${remain}번 더 하면 ${nextW}주 연속이에요 — 최고 기록은 ${c.w4.best}주`,
    total: `올해 ${c.yearCount}회 · ${hoursLabel(c.yearMin)}`,
  };
}
