/**
 * 세션 유산소 카드 — 지표 로테이션 + 주간 집계.
 *
 * 네이티브 `GymKit/Sources/GymCore/CardioMetricWeek.swift` 의 1:1 포팅.
 * 정본 작업지시서: `specs/2026-08-18-cardio-input-design.md` (확정 시안 7a).
 * 두 구현이 갈라지면 안 되므로 테스트 픽스처도 GymCoreTests/CardioMetricWeekTests.swift 와 같다.
 *
 * 홈의 유산소 집계(home.js summarizeWeeklyBalance)와 혼동 금지:
 *   홈  = 유산소 **전 종목** 합산, 분 하나만
 *   여기 = **종목 하나**(트레드밀 등), 3지표
 * 주 경계(월~일)는 같지만 집계 범위가 달라 수치가 서로 다를 수 있다 — 의도된 것이다 (§5).
 */
import { toISODate, weekRangeISO } from '../db/queries.js';

export const CARDIO_METRICS = ['duration', 'distance', 'calories'];

const META = {
  duration: { label: '시간', unit: '분', step: 1, field: 'duration' },
  distance: { label: '거리', unit: 'km', step: 0.1, field: 'distance' },
  calories: { label: '칼로리', unit: 'kcal', step: 10, field: 'calories' },
};
export function metricMeta(m) { return META[m]; }

export function nextMetric(m) {
  const i = CARDIO_METRICS.indexOf(m);
  return i >= 0 && i + 1 < CARDIO_METRICS.length ? CARDIO_METRICS[i + 1] : null;
}
export function prevMetric(m) {
  const i = CARDIO_METRICS.indexOf(m);
  return i > 0 ? CARDIO_METRICS[i - 1] : null;
}

/** 화면 표기 — 거리는 1자리 고정("3.4"), 시간·칼로리는 정수. */
export function formatMetric(m, v) {
  return m === 'distance' ? (Math.round(v * 10) / 10).toFixed(1) : String(Math.round(v));
}

/** 빈 공간 탭 증감 — 하한 0. 거리만 0.1 단위 반올림 (§5-1). */
export function steppedValue(m, base, dir) {
  const v = Math.max(0, base + dir * META[m].step);
  return m === 'distance' ? Math.round(v * 10) / 10 : Math.round(v);
}

/** 세트에서 이 지표의 **화면 단위** 값 (시간은 초 → 분). 없으면 null. */
export function metricValue(m, set) {
  if (!set) return null;
  if (m === 'duration') return set.duration == null ? null : Math.round(set.duration / 60);
  const v = set[META[m].field];
  return v == null ? null : v;
}

/**
 * 날짜(ISO) → 그날 해당 종목 done 세트의 지표별 합. 값이 하나도 없는 지표는 키가 없어
 * "—"(기록 없음)과 0 을 구분한다. 세트 2개 이상인 구데이터도 합산으로 흡수 (§5-1).
 */
export function cardioDayTotals(sessions, exerciseId, from, to) {
  const out = {};
  for (const s of Array.isArray(sessions) ? sessions : []) {
    if (!s || s.status !== 'completed') continue;
    if (!(s.date >= from && s.date <= to)) continue;
    for (const b of s.blocks || []) {
      if (!b || b.exerciseId !== exerciseId) continue;
      for (const set of b.sets || []) {
        if (!set || set.done !== true) continue;
        // done 세트가 있으면 지표 값이 하나도 없어도 **날짜 키는 남긴다** — 그날이 "뛴 날"이라는
        // 사실 자체가 원의 채움을 정하고, 값 없는 지표만 "—" 가 된다. 홈(cardioDayMinutes)이
        // duration nil 을 0 으로 세는 것과 일수를 맞추기 위함 (실기기 2026-08-19: 홈 6일 vs 카드 4일).
        out[s.date] = out[s.date] || {};
        for (const m of CARDIO_METRICS) {
          const v = metricValue(m, set);
          if (v == null) continue;
          out[s.date][m] = (out[s.date][m] || 0) + v;
        }
      }
    }
  }
  return out;
}

/** 진행 중 세트들(오늘)의 지표 합 — 하나도 없으면 null. */
function todayValue(todaySets, m) {
  const vs = (todaySets || []).map((s) => metricValue(m, s)).filter((v) => v != null);
  return vs.length ? vs.reduce((a, b) => a + b, 0) : null;
}

/** 직전 러닝 (완료 이력 중 그 종목 마지막 기록) — 오늘 미입력 시 참조·히어로 고스트의 원천. */
export function lastCardioRun(sessions, exerciseId) {
  const runs = [];
  for (const s of Array.isArray(sessions) ? sessions : []) {
    if (!s || s.status !== 'completed') continue;
    for (const b of s.blocks || []) {
      if (!b || b.exerciseId !== exerciseId) continue;
      for (const set of b.sets || []) {
        if (set && set.done === true && ((set.duration || 0) > 0 || (set.distance || 0) > 0)) {
          runs.push({ date: s.date, set });
        }
      }
    }
  }
  runs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return runs.length ? runs[runs.length - 1].set : null;
}

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];

/**
 * 카드 주간 모듈. `todaySets` 는 진행 중 블록의 세트들(오늘 값의 출처).
 * 미래 요일은 지난주 같은 요일 값을 회색 참조로 보여준다.
 *
 * day.style: filled(기록·teal 채움) | todayRef(오늘 미입력·참조 테두리)
 *            | ring(과거 미기록 or 미래 참조) | ringFaint(미래·지난주도 없음)
 */
export function cardioMetricWeek({ sessions, todaySets, exerciseId, metric, now = Date.now() }) {
  const today = new Date(now);
  const { from } = weekRangeISO(today);
  const monday = new Date(from + 'T00:00:00');
  const iso = (off) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + off);
    return toISODate(d);
  };
  const todayIdx = (today.getDay() + 6) % 7;   // 0=월
  const thisWeek = cardioDayTotals(sessions, exerciseId, iso(0), iso(6));
  const lastWeek = cardioDayTotals(sessions, exerciseId, iso(-7), iso(-1));
  const prev = lastCardioRun(sessions, exerciseId);
  const prevVal = (m) => (prev ? metricValue(m, prev) : null);
  // 오늘 값 = **오늘 이미 완료된 기록 + 진행 중 세트**. 진행 중 세트만 보면 오늘 한 번 마치고
  // 새 세션을 켰을 때 오늘이 "미입력" 으로 떨어진다 (실기기 2026-08-19).
  // 진행 중 세션은 status active 라 cardioDayTotals 에 안 들어와 이중 계상되지 않는다.
  const todayISO = iso(todayIdx);
  const todayDone = thisWeek[todayISO] ? thisWeek[todayISO][metric] : undefined;
  const todayLive = todayValue(todaySets, metric);
  const todayHasRecord = thisWeek[todayISO] !== undefined || todayLive != null;
  const own = (todayDone == null && todayLive == null)
    ? null : (todayDone || 0) + (todayLive || 0);

  const days = [];
  for (let i = 0; i < 7; i += 1) {
    // ① 원 형태는 시간 기준으로 먼저 정한다 (지표와 무관).
    // 기록 유무는 '그날 done 세트가 있었는가' — 0분·값없음도 뛴 날이다 (홈과 같은 술어).
    const ranThis = thisWeek[iso(i)] !== undefined;
    const ranLast = lastWeek[iso(i - 7)] !== undefined;
    let style;
    let hasSlot;
    if (i === todayIdx) {
      // 오늘만 예외 — **활성 지표** 기준. 시간을 넣었어도 칼로리가 비면 칼로리 화면에서는 참조 스타일.
      style = todayHasRecord ? 'filled' : 'todayRef';
      hasSlot = true;
    } else if (i < todayIdx) {
      style = ranThis ? 'filled' : 'ring';
      hasSlot = ranThis;
    } else {
      style = ranLast ? 'ring' : 'ringFaint';
      hasSlot = ranLast;
    }
    // ② 숫자만 활성 지표로 갈아 끼운다.
    let text = null;
    if (hasSlot) {
      if (i === todayIdx) {
        if (todayHasRecord) {
          text = own == null ? '—' : formatMetric(metric, own);
        } else {
          const v = prevVal(metric);
          text = v == null ? null : formatMetric(metric, v);
        }
      } else {
        const src = i < todayIdx ? thisWeek[iso(i)] : lastWeek[iso(i - 7)];
        const v = src ? src[metric] : undefined;
        text = v == null ? '—' : formatMetric(metric, v);
      }
    }
    days.push({ label: WEEKDAYS[i], text, style, isToday: i === todayIdx });
  }

  // ③ 합계·일수 — 오늘은 입력값만(참조 제외), 과거는 이번 주 기록, 미래는 제외. 값 > 0 만 (§5).
  let sum = 0;
  let dayCount = 0;
  for (let i = 0; i <= todayIdx; i += 1) {
    const ran = i === todayIdx ? todayHasRecord : (thisWeek[iso(i)] !== undefined);
    if (!ran) continue;
    const v = i === todayIdx ? own : thisWeek[iso(i)][metric];
    sum += v || 0;
    dayCount += 1;
  }
  return { days, total: formatMetric(metric, sum), unit: META[metric].unit, dayCount };
}

/* ── 제스처 (§4) ─────────────────────────────────────────────────────── */

/** 끝단 저항 — 첫 지표에서 오른쪽, 마지막에서 왼쪽으로 밀면 0.28배. 순환 없음. */
export const EDGE_RESISTANCE = 0.28;
export function gestureTranslate(dx, metric) {
  const atStart = prevMetric(metric) == null && dx > 0;
  const atEnd = nextMetric(metric) == null && dx < 0;
  return atStart || atEnd ? dx * EDGE_RESISTANCE : dx;
}
/** 드래그 종료 — 임계 이상이면 다음/이전, 미달이면 원위치. 위치는 항상 커밋된 지표에서 계산. */
export function gestureCommit(dx, metric, threshold) {
  if (dx <= -threshold && nextMetric(metric)) return nextMetric(metric);
  if (dx >= threshold && prevMetric(metric)) return prevMetric(metric);
  return metric;
}

/* ── 치수 (§6-1) — 리터럴 고정 금지, 기기 폭에서 유도 ──────────────────── */

export const CARDIO_H_PADDING = 22;
export const DRAG_SLOP = 8;   // 탭·드래그 분기 (기기 무관 고정)

export function cardioLayout(cardWidth) {
  const w = Math.max(0, cardWidth - CARDIO_H_PADDING * 2);
  return {
    contentWidth: w,
    tapZone: Math.max(44, w * 0.33),
    swipeThreshold: w * 0.18,
    circleDiameter: (w - 37 * 7) / 6 >= 4 ? 37 : 32,
    trackOffset: (index) => 0 - index * w,   // 0 - 로 써야 index 0 에서 -0 이 안 나온다
  };
}
