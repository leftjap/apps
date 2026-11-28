/**
 * 글쓰기 시간 세는 규칙 (순수 로직 — 시각을 인자로 받고 DOM 을 모른다).
 *
 * 센다: 글 화면이 열려 있고(writing) 창이 앞에 있고(front) 마지막 입력 뒤 10분 이내.
 *  - 창을 떠났다가 5분 안에 돌아오면 떠나 있던 시간도 센다. 5분을 넘기면 0.
 *  - iOS 백그라운드에선 JS 가 멈추므로 타이머 횟수가 아니라 시각 차이로 계산한다.
 *  - 자정을 넘긴 구간은 로컬 날짜별로 나눠 쌓는다.
 *  - 글 화면이 열린 시각, 창으로 돌아온 시각도 입력으로 친다.
 * 쌓인 시간은 drain() 으로 꺼내 저장한다 (1초 미만 나머지는 다음 번으로).
 *
 * countedUntil: 같은 기기의 여러 탭이 함께 쓰는 「여기까지 셌다」 시각 (저장은 호출 쪽 몫).
 * 시간을 더하는 함수는 이 값을 인자로 받아, 그 시각 이전 구간은 빼고 더한 뒤 새 값을 돌려준다.
 */

export const IDLE_MS = 10 * 60 * 1000;
export const AWAY_GRACE_MS = 5 * 60 * 1000;

/** 로컬 날짜 'YYYY-MM-DD' (Supabase date 컬럼 형식). */
export function isoDay(t) {
  const d = new Date(t);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function createClock(userId = null) {
  return {
    userId, // 이 시간을 쌓는 계정 — 저장 시점 계정과 다르면 버린다
    writing: false,
    front: true,
    lastInput: null,
    lastTick: null, // 여기까지는 계산을 마친 시각
    awaySince: null,
    pending: new Map(), // day → ms
  };
}

function addSpan(pending, from, to) {
  let cur = from;
  while (cur < to) {
    const d = new Date(cur);
    const nextMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    const end = Math.min(to, nextMidnight);
    const key = isoDay(cur);
    pending.set(key, (pending.get(key) || 0) + (end - cur));
    cur = end;
  }
}

/** t 까지 흐른 시간을 규칙대로 쌓는다. 반환: 새 countedUntil. */
export function advance(s, t, countedUntil = -Infinity) {
  let until = countedUntil;
  if (s.lastTick != null && s.writing && s.front && s.lastInput != null) {
    const end = Math.min(t, s.lastInput + IDLE_MS);
    const from = Math.max(s.lastTick, until);
    if (end > from) {
      addSpan(s.pending, from, end);
      until = end;
    }
  }
  s.lastTick = t;
  return until;
}

export function onInput(s, t, countedUntil) {
  const until = advance(s, t, countedUntil);
  s.lastInput = t;
  return until;
}

export function setWriting(s, on, t, countedUntil) {
  const until = advance(s, t, countedUntil);
  if (on && !s.writing) s.lastInput = t; // 글 화면이 열린 시각 = 입력
  s.writing = !!on;
  return until;
}

export function setFront(s, on, t, countedUntil) {
  if (!!on === s.front) return advance(s, t, countedUntil);
  if (!on) {
    const until = advance(s, t, countedUntil);
    s.front = false;
    s.awaySince = t;
    return until;
  }
  s.front = true;
  const away = s.awaySince;
  s.awaySince = null;
  let until = countedUntil;
  if (away != null && t - away <= AWAY_GRACE_MS) {
    s.lastTick = away;
    until = advance(s, t, countedUntil);
  } else {
    s.lastTick = t;
  }
  s.lastInput = t; // 창으로 돌아온 시각 = 입력
  return until;
}

/** 쌓인 시간을 날짜별 정수 초로 꺼낸다. 1초 미만 나머지는 남겨 둔다. */
export function drain(s) {
  const out = [];
  for (const [day, ms] of s.pending) {
    const seconds = Math.floor(ms / 1000);
    if (seconds <= 0) continue;
    out.push({ day, seconds });
    const rest = ms - seconds * 1000;
    if (rest > 0) s.pending.set(day, rest);
    else s.pending.delete(day);
  }
  return out;
}

/** drain 으로 꺼냈다가 저장하지 못한 초를 되돌려 놓는다. */
export function restore(s, rows) {
  for (const { day, seconds } of rows) {
    s.pending.set(day, (s.pending.get(day) || 0) + seconds * 1000);
  }
}

/** 60분 미만 「42분」, 이상 「1시간 5분」, 정각은 「2시간」. */
export function formatDuration(seconds) {
  const min = Math.floor((seconds || 0) / 60);
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  return min % 60 ? `${h}시간 ${min % 60}분` : `${h}시간`;
}
