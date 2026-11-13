// 한강 배(연출). 판 남쪽 한강 물길을 따라 천천히 오간다. 위치와 운항 시각은 지어낸 것이며, 시각만의 함수다.
export interface BoatDef {
  id: string;
  name: string;
  /** 0 유람선, 1 한강버스 */
  kind: number;
  /** 빠르기(m/s) */
  speed: number;
  /** 한 번 왕복하고 다시 출발하기까지(초) */
  period: number;
  /** 첫 출발 시각(자정부터 초) */
  offset: number;
  /** 운항 시각 [시작, 끝](시) */
  hours: [number, number];
  /** 판 밖에서 돌아서는 데 걸리는 시간(초) */
  rest: number;
}

export const BOATS: BoatDef[] = [
  { id: 'cruise', name: '한강 유람선', kind: 0, speed: 4.5, period: 3600, offset: 11 * 3600, hours: [11, 22], rest: 240 },
  { id: 'riverbus', name: '한강버스', kind: 1, speed: 7.5, period: 3600, offset: 7 * 3600 + 1200, hours: [7, 22.5], rest: 180 },
];

export interface BoatPos {
  /** 물길 위 거리(m, 서쪽 끝 0) */
  s: number;
  /** +1 동쪽(서강대교 쪽)으로, −1 서쪽(양화대교 쪽)으로 */
  dir: number;
}

/** 물길 길이 len 위에서 tod 시각의 배 자리. 운항하지 않으면 null */
export function boatAt(b: BoatDef, tod: number, len: number): BoatPos | null {
  const h = tod / 3600;
  if (h < b.hours[0] || h >= b.hours[1]) return null;
  const leg = len / b.speed; // 한쪽 끝에서 다른 끝까지(초)
  const u = (((tod - b.offset) % b.period) + b.period) % b.period;
  // 판 밖에서 기다리기 → 동쪽으로 지나가기 → 판 밖에서 기다리기 → 서쪽으로 지나가기 → (나머지 시간은 판 밖)
  if (u < b.rest) return null;
  if (u < b.rest + leg) return { s: ((u - b.rest) / leg) * len, dir: 1 };
  if (u < 2 * b.rest + leg) return null;
  if (u < 2 * b.rest + 2 * leg) return { s: (1 - (u - 2 * b.rest - leg) / leg) * len, dir: -1 };
  return null;
}
