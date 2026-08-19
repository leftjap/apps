/**
 * 홈 화면 — 유산소 집계(캘린더 링·독립 카드) + 체중 스파크라인.
 *
 * 네이티브 `GymCore/HomeLogic.swift`(cardioDayMinutes·liftDays·cardioWeek·cardioRenewChip)
 * 와 `GymCore/WeightLogic.swift`(recentSma·sparklinePoints) 의 1:1 포팅.
 * 정본 작업지시서: `specs/2026-08-17-home-redesign-20a.md` (시안 20a).
 *
 * 세션 카드의 유산소 집계(session-cardio.js)와 혼동 금지:
 *   여기 = 유산소 **전 종목** 합산, 분 하나만  → 홈
 *   저쪽 = **종목 하나**, 3지표               → 세션 카드
 */
import { toISODate } from '../db/queries.js';
import { getBuiltinExercise, getCachedCustomExercise } from '../db/exercises.js';

const isCardioBlock = (b, defs) => defs.get(b?.exerciseId) === 'cardio';

/**
 * 날짜(ISO) → 그날 완료 유산소 총 분(날짜별 반올림). **"뛴 날"의 단일 정의.**
 * 캘린더의 유산소 링과 카드의 채운 원이 반드시 같은 날짜 집합이어야 해서(§14) 둘 다 여기서 나온다.
 * duration 미입력(구버그 데이터)도 done 세트면 날짜 키가 남고 값 0 — 술어를 하나로 통일한다.
 */
export function cardioDayMinutes(sessions, equipmentOf = defaultEquipmentOf) {
  const sec = {};
  for (const s of Array.isArray(sessions) ? sessions : []) {
    if (!s || s.status !== 'completed') continue;
    for (const b of s.blocks || []) {
      if (!b || b.type !== 'single' || equipmentOf(b.exerciseId) !== 'cardio') continue;
      const done = (b.sets || []).filter((x) => x && x.done === true);
      if (!done.length) continue;
      sec[s.date] = (sec[s.date] || 0) + done.reduce((t, x) => t + (x.duration || 0), 0);
    }
  }
  const out = {};
  for (const [d, v] of Object.entries(sec)) out[d] = Math.round(v / 60);
  return out;
}

/**
 * 근력(비유산소) 완료 세트가 있는 날. 유산소만 한 날은 들어가지 않는다 —
 * 캘린더의 crail 채움은 근력 신호이고 유산소는 teal 링이 따로 표현하므로(§5)
 * 둘을 분리해야 "유산소만" 상태(배경 없음 + 링)가 성립한다.
 */
export function liftDays(sessions, equipmentOf = defaultEquipmentOf) {
  const out = new Set();
  for (const s of Array.isArray(sessions) ? sessions : []) {
    if (!s || s.status !== 'completed') continue;
    for (const b of s.blocks || []) {
      if (!b || equipmentOf(b.exerciseId) === 'cardio') continue;
      if ((b.sets || []).some((x) => x && x.done === true)) { out.add(s.date); break; }
    }
  }
  return out;
}

// 장비 판정 — 빌트인 카탈로그 + 커스텀 캐시 (동기). 미상은 비유산소로 본다
// (근력일 판정이 관대해야 알 수 없는 종목 때문에 캘린더에서 날이 사라지지 않는다).
function defaultEquipmentOf(id) {
  const ex = getBuiltinExercise(id) || getCachedCustomExercise(id);
  return ex?.equipment || 'weight';
}

/** 월~일 7칸 × (이번 주 / 지난주) 유산소 분. null = 그날 유산소 없음(빈 원). */
export function cardioWeek(sessions, now = Date.now(), equipmentOf = defaultEquipmentOf) {
  const byDay = cardioDayMinutes(sessions, equipmentOf);
  const today = new Date(now);
  const todayIndex = (today.getDay() + 6) % 7;   // 0=월
  const monday = new Date(today);
  monday.setDate(today.getDate() - todayIndex);
  const slot = (off) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + off);
    const v = byDay[toISODate(d)];
    return v === undefined ? null : v;
  };
  const thisMin = Array.from({ length: 7 }, (_, i) => slot(i));
  const prevMin = Array.from({ length: 7 }, (_, i) => slot(i - 7));
  const sum = (a) => a.filter((v) => v != null).reduce((t, v) => t + v, 0);
  const cnt = (a) => a.filter((v) => v != null).length;
  return {
    thisMin, prevMin, todayIndex,
    thisTotal: sum(thisMin), thisDays: cnt(thisMin),
    prevTotal: sum(prevMin), prevDays: cnt(prevMin),
  };
}

/**
 * 하단 갱신 칩 3갈래 (사용자 2026-08-17 — 동률은 갱신이 아니다).
 * 부족 = warn(주황), 동률·초과 = pine. 유산소를 한 번도 안 했으면 null(칩 숨김, §14).
 */
export function cardioRenewChip(thisTotal, prevTotal) {
  if (!(thisTotal > 0 || prevTotal > 0)) return null;
  const short = prevTotal - thisTotal;
  if (short > 0) return { value: `${short}분`, label: '더 하면 갱신', isWarn: true };
  if (short === 0) return { value: null, label: '지난주와 동률', isWarn: false };
  return { value: `+${-short}분`, label: '갱신', isWarn: false };
}

/* ── 체중 스파크라인 (§9) ─────────────────────────────────────────────── */

/**
 * 최근 `days` 일 이동평균. **전체 이력에 sma7 을 먼저 적용한 뒤 창을 절단한다** —
 * 창 안에서만 평균 내면 첫 점이 이동평균이 아니라 그날 실측값이 되어 선 앞머리가 튄다.
 * `rows` 는 날짜 오름차순 [{date, kg}].
 */
export function recentSma(rows, days = 30, now = Date.now()) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return [];
  const smas = list.map((_, i) => {
    const s = Math.max(0, i - 6);
    const win = list.slice(s, i + 1);
    return win.reduce((t, r) => t + r.kg, 0) / win.length;
  });
  const from = new Date(now);
  from.setDate(from.getDate() - (days - 1));
  const fromISO = toISODate(from);
  return list.map((r, i) => ({ date: r.date, sma: smas[i] }))
    .filter((r) => r.date >= fromISO).map((r) => r.sma);
}

/**
 * 스파크라인 좌표 — x 균등 분할, y 는 min~max 를 상하 `pad` 안쪽에 매핑(위 = 무거움).
 * 격자·축 없음. 점이 2개 미만이면 선을 못 그리므로 빈 배열(뷰가 숨김).
 */
export function sparklinePoints(values, width, height, pad = 3) {
  const v = Array.isArray(values) ? values : [];
  if (v.length < 2) return [];
  const mn = Math.min(...v);
  const mx = Math.max(...v);
  const top = pad;
  const bottom = height - pad;
  const span = mx - mn;
  return v.map((val, i) => ({
    x: (i / (v.length - 1)) * width,
    y: span === 0 ? height / 2 : bottom - ((val - mn) / span) * (bottom - top),
  }));
}
