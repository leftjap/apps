/* copy.js — cue 활동 카드의 모든 사용자 문장 생성 (작업지시서 §5·§9 단일 검사 지점).
   v9 정보 재설계: 슬롯을 직전(최근 한 일) → 이번 주(근접목표) → 추세(이번 달/진척)로 통일.
   규칙(§5): 해요체 / 라벨만 명사형 / 빈 격려·죄책감 어법·번역투 금지 / 은유 금지(데이터 사실) /
   beat = "오늘 [최소 행동]이면 [가까운 결과] — [기준 기록]" (3분할 배열 [pre, strong, post]).
   adapter 가 수치를 계산해 ctx 로 넘기고, 여기서 hook/sub/records/beat/total/pace/statRecords 를 만든다. */
import { relativeDayLabel, dayMeta } from './transforms.js';

/** 분 → "38시간" (1시간 미만은 "45분") */
export function hoursLabel(min) {
  return min >= 60 ? `${Math.round(min / 60)}시간` : `${Math.round(min)}분`;
}

/** 천 단위 콤마 (로케일 비의존 — 테스트 안정) */
function comma(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const round1 = (v) => Math.round(v * 10) / 10;

/** "M월 D일" — daysAgo 일 전 날짜 */
function mdLabel(daysAgo, today) {
  const { m, d } = dayMeta(daysAgo, today);
  return `${m}월 ${d}일`;
}

/* ───────── 독서 (출처: book_reading_seconds — 일별 분. 제목·진도% 미연동) ───────── */
export function buildRead(c) {
  const none = c.lastDaysAgo == null && !c.done;
  const hasLast = c.lastVal != null;
  return {
    name: '독서', cta: '이어 읽기',
    hook: none
      ? { title: '아직 기록이 없어요', strong: '', tail: '' }
      : { title: relativeDayLabel(c.lastDaysAgo), strong: `${c.lastVal}분`, tail: ' 읽었어요' },
    hookDone: { title: '오늘', strong: `${c.todayMin}분`, tail: ' 읽었어요' },
    ...subRead(c),
    records: [
      { lb: '직전 읽기', v: hasLast ? `${c.lastVal}분` : '—', note: hasLast ? relativeDayLabel(c.lastDaysAgo) : '' },
      { lb: '이번 주', goal: { cur: c.weekDays, max: 5, unit: '일', proposed: true }, note: `지난주 ${c.lastWeekDays}일` },
      { lb: '이번 달', v: hoursLabel(c.monthMin), note: c.prevMonthMin != null ? `지난달 ${hoursLabel(c.prevMonthMin)}` : '' },
    ],
    beat: beatRead(c, none),
    total: `올해 ${hoursLabel(c.yearMin)} · ${c.yearDays}일`,
    pace: { now: `올해 평균 주 ${c.paceAvg}일`, goal: '제안 주 5일', proposed: true },
    statRecords: [
      { lb: '최장 연속', v: `${c.best}일` },
      { lb: '하루 최고', v: `${c.dayBest}분` },
      { lb: '올해 읽은 날', v: `${c.yearDays}일` },
    ],
  };
}
function subRead(c) {
  if (c.done) return { sub: c.streak >= 2 ? `${c.streak}일 연속이에요` : '오늘 다시 시작했어요' };
  if (c.streak > 0) return { sub: `${c.streak}일 연속이에요` };
  if (c.lastDaysAgo != null) return { sub: `마지막으로 읽은 날은 ${mdLabel(c.lastDaysAgo, c.today)}이에요`, subGap: true };
  return { sub: '오늘 10분이면 다시 시작할 수 있어요' };
}
function beatRead(c, none) {
  if (none) return ['오늘 10분이면 ', '이번 주 첫 기록', '이 시작돼요'];
  const tail = c.lastWeekDays > 0 ? ` — 지난주는 ${c.lastWeekDays}일이었어요` : (c.done ? '예요' : '가 돼요');
  return c.done
    ? ['오늘 읽어서 ', `이번 주 ${c.weekDays}일째`, tail]
    : ['오늘 10분이면 ', `이번 주 ${c.weekDays + 1}일째`, tail];
}

/* ───────── 글쓰기 (출처: today_entries — kind·title·매수·created_at) ───────── */
export function buildWrite(c) {
  const avg = c.yearEntries > 0 ? round1(c.yearSheets / c.yearEntries) : 0;
  return {
    name: '글쓰기', cta: '이어 쓰기',
    hook: c.doc
      ? { title: `${c.doc.kindLabel} 「${c.doc.title}」`, strong: `${c.doc.sheets}매`, tail: '까지 썼어요' }
      : { title: '아직 글이 없어요', strong: '', tail: '' },
    ...subWrite(c),
    records: [
      c.doc
        ? { lb: '직전 글', v: `${c.doc.sheets}매`, note: `${c.doc.kindLabel} · ${c.done ? '오늘' : mdLabel(c.lastDaysAgo, c.today)}` }
        : { lb: '직전 글', v: '—', note: '' },
      { lb: '이번 주', goal: { cur: c.weekEntries, max: 3, unit: '편', proposed: true }, note: `지난주 ${c.lastWeekEntries}편` },
      { lb: '이번 달', v: `${c.monthSheets}매`, note: c.prevMonthSheets != null ? `지난달 ${c.prevMonthSheets}매` : '' },
    ],
    beat: beatWrite(c),
    total: `올해 ${c.yearEntries}편 · ${c.yearSheets}매`,
    pace: { now: `올해 평균 주 ${c.paceAvg}편`, goal: '제안 주 3편', proposed: true },
    statRecords: [
      { lb: '올해 편수', v: `${c.yearEntries}편` },
      { lb: '올해 매수', v: `${c.yearSheets}매` },
      { lb: '편당 평균', v: `${avg}매` },
    ],
  };
}
function subWrite(c) {
  if (c.done) return { sub: `오늘 ${c.todaySheets}매 썼어요` };
  if (c.lastDaysAgo != null) return { sub: `마지막으로 쓴 날은 ${mdLabel(c.lastDaysAgo, c.today)}이에요`, subGap: true };
  return { sub: '오늘 한 매면 시작할 수 있어요' };
}
function beatWrite(c) {
  if (!c.doc) return ['오늘 1매면 ', '첫 글', '이 시작돼요'];
  const next = Math.floor(c.monthSheets) + 1;
  const tail = c.prevMonthSheets != null ? ` — 지난달은 ${Math.round(c.prevMonthSheets)}매였어요` : '예요';
  return ['오늘 1매면 ', `이번 달 ${next}매째`, tail];
}

/* ───────── 어학 (출처: study_daily_stats + study_review_queue + study_today_lessons) ───────── */
export function buildLang(c) {
  const sceneToday = c.scene && c.scene.m === c.today.getMonth() + 1 && c.scene.d === c.today.getDate();
  const none = !c.scene && c.lastDaysAgo == null;
  const hasLast = c.lastUtter != null && c.lastDaysAgo != null;
  return {
    name: '어학', cta: '오늘 분량 시작',
    hook: c.scene
      ? { title: `「${c.scene.title}」`, strong: `${c.scene.m}월 ${c.scene.d}일`, tail: '이 마지막이에요' }
      : c.lastDaysAgo != null
        ? { title: '마지막 학습은', strong: mdLabel(c.lastDaysAgo, c.today), tail: '이에요' }
        : { title: '아직 기록이 없어요', strong: '', tail: '' },
    hookDone: { title: sceneToday ? `오늘 「${c.scene.title}」` : '오늘', strong: `${c.todayMin}분`, tail: ' 했어요' },
    ...subLang(c),
    records: [
      { lb: '직전 발화', v: hasLast ? `${c.lastUtter}문장` : '—', note: hasLast ? `${c.done ? '오늘' : mdLabel(c.lastDaysAgo, c.today)} · 신규 ${c.lastNew}` : '' },
      { lb: '이번 주', goal: { cur: c.weekDays, max: 4, unit: '일', proposed: true }, note: `지난주 ${c.lastWeekDays}일` },
      { lb: '이번 달 익힘', v: `+${c.monthNew}문장`, note: c.prevMonthNew != null ? `지난달 +${c.prevMonthNew}` : '' },
    ],
    beat: beatLang(c, none),
    total: `올해 ${hoursLabel(c.yearMin)} · 발화 ${comma(c.yearUtter)}문장`,
    pace: { now: `올해 평균 주 ${c.paceAvg}일`, goal: '제안 주 4일', proposed: true },
    statRecords: [
      { lb: '올해 발화', v: `${comma(c.yearUtter)}문장` },
      { lb: '익힌 문장', v: `${comma(c.collected)}개` },
      { lb: '최장 연속', v: `${c.best}일` },
    ],
  };
}
function subLang(c) {
  if (c.reviewDue > 0) return { sub: `복습할 문장 ${c.reviewDue}개가 오늘 만료돼요`, subStrong: true };
  if (c.done) return { sub: c.streak >= 2 ? `${c.streak}일 연속이에요` : '오늘 다시 시작했어요' };
  if (c.streak > 0) return { sub: `${c.streak}일 연속이에요` };
  return { sub: '오늘 5문장이면 다시 시작할 수 있어요' };
}
function beatLang(c, none) {
  if (none) return ['오늘 5문장이면 ', '첫 발화', '가 시작돼요'];
  const due = c.reviewDue > 0 ? ` — 복습 ${c.reviewDue}개도 기다려요` : (c.done ? '예요' : '가 돼요');
  if (c.done) return ['오늘 학습해서 ', `이번 주 ${c.weekDays}일째`, c.reviewDue > 0 ? ` — 복습 ${c.reviewDue}개가 남았어요` : '예요'];
  if (c.weekDays === 0) return ['오늘 5문장이면 ', '이번 주 첫 발화', c.reviewDue > 0 ? ` — 복습 ${c.reviewDue}개도 기다려요` : '예요'];
  return ['오늘 5문장이면 ', `이번 주 ${c.weekDays + 1}일째`, due];
}

/* ───────── 운동 (출처: gym_sessions — tags 부위·blocks PR·total_volume·duration_min) ───────── */
export function buildGym(c) {
  const parts = c.parts || [];
  const remain = Math.max(0, 4 - c.weekCount);
  return {
    name: '운동', cta: '운동 기록 열기', ctaDone: '오늘 기록 보기',
    hook: c.weekCount > 0
      ? { title: '이번 주', strong: `${c.weekCount}회`, tail: ' 했어요 — 목표는 주 4일' }
      : { title: '이번 주 첫 운동 전이에요 —', strong: '목표는 주 4일', tail: '' },
    hookDone: { title: `오늘 ${c.atLabel}${parts.length ? ` · ${parts.join('·')}` : ''}`, strong: `${c.todayMin}분`, tail: '' },
    ...subGym(c),
    records: [
      {
        lb: c.done ? '오늘 한 운동' : '직전 운동',
        v: parts.length ? parts.join(' · ') : '—',
        pr: c.prCount || 0,
        note: c.done
          ? `${c.todayMin}분 · 볼륨 ${comma(c.todayVolume)}kg`
          : (c.lastDaysAgo != null ? `${relativeDayLabel(c.lastDaysAgo)} · ${c.lastMin}분` : ''),
      },
      { lb: '이번 주', goal: { cur: c.weekCount, max: 4, unit: '회', proposed: false }, note: c.w4.cur > 0 ? `${c.w4.cur}주 연속` : '' },
      { lb: '이번 달', v: `${c.monthCount}회`, note: `지난달 ${c.prevMonthCount}회` },
    ],
    beat: beatGym(c, remain),
    total: `올해 ${c.yearCount}회 · ${hoursLabel(c.yearMin)}`,
    pace: { now: `올해 평균 주 ${c.paceAvg}회`, goal: '주 4일 목표', proposed: false },
    statRecords: [
      { lb: '올해 횟수', v: `${c.yearCount}회` },
      { lb: '최고 주 연속', v: `${c.w4.best}주` },
      { lb: '하루 최고', v: `${c.dayBest}분` },
    ],
  };
}
function subGym(c) {
  if (c.done) {
    return { sub: c.weekCount >= 4 ? `이번 주 ${c.weekCount}회 · 주 4일 목표를 채웠어요` : `이번 주 ${c.weekCount}회 · 주 4일 목표예요` };
  }
  if (c.w4.cur > 0) return { sub: `${c.w4.cur}주 연속으로 주 4일을 지켰어요` };
  if (c.lastDaysAgo != null) return { sub: `마지막 운동은 ${relativeDayLabel(c.lastDaysAgo)}예요`, subGap: true };
  return { sub: '이번 주 4일이 목표예요' };
}
function beatGym(c, remain) {
  if (c.weekCount >= 4) return ['이번 주 4일을 채웠어요', '', c.w4.cur > 0 ? ` — ${c.w4.cur}주 연속이에요` : ''];
  if (c.w4.best > 0) return ['이번 주 ', `${remain}번 더 하면 주 4일`, ` — 최고 ${c.w4.best}주 연속이에요`];
  return ['이번 주 ', `${remain}번 더 하면 주 4일 첫 달성`, '이에요'];
}
