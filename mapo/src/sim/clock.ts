// 시계. 기본은 실제 한국 시각이고, ?t=HH:MM 로 시작 시각, ?speed=N 으로 배속, ?dow=0~6 으로 요일을 바꾼다(검증용).
export interface Now {
  /** 자정부터 지난 초 (0 ~ 86400) */
  tod: number;
  /** 요일. 0 = 일요일 */
  dow: number;
  /** 1월 1일을 1로 하는 날짜 번호 */
  doy: number;
}

export interface Clock {
  now(): Now;
  tick(dtReal: number): void;
  /** 실제 시각을 그대로 따르는 중인가 */
  readonly live: boolean;
  /** 오늘 날짜 그대로 시각만 바꾼다(초). 그 뒤로는 배속대로 흐른다 */
  set(tod: number): void;
  /** 실제 시각으로 돌아간다 */
  setLive(): void;
}

const KST = 9 * 3600_000;

export function makeClock(search: string, nowMs: () => number = Date.now): Clock {
  const q = new URLSearchParams(search);
  const real = () => {
    const d = new Date(nowMs() + KST);
    const ms = d.getTime();
    const tod = ((ms % 86400_000) + 86400_000) % 86400_000 / 1000;
    const doy = Math.floor((ms - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400_000) + 1;
    return { tod, dow: d.getUTCDay(), doy };
  };
  const t = q.get('t')?.match(/^(\d{1,2}):(\d{2})$/);
  const speed = Number(q.get('speed')) || 1;
  const dowParam = q.get('dow');
  let live = !t && speed === 1 && dowParam === null;

  const start = real();
  let tod = t ? Number(t[1]) * 3600 + Number(t[2]) * 60 : start.tod;
  let dow = dowParam !== null ? Number(dowParam) % 7 : start.dow;
  let doy = start.doy;
  return {
    now: () => (live ? real() : { tod, dow, doy }),
    tick(dtReal) {
      if (live) return;
      tod += dtReal * speed;
      while (tod >= 86400) {
        tod -= 86400;
        dow = (dow + 1) % 7;
        doy = (doy % 365) + 1;
      }
    },
    get live() {
      return live;
    },
    set(v) {
      if (live) ({ dow, doy } = real());
      live = false;
      tod = ((v % 86400) + 86400) % 86400;
    },
    setLive() {
      live = true;
    },
  };
}
