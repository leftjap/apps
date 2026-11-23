// The longitudinal ACC/IDM and stop limit used by makeCars.
export const A_MAX = 1.6;
export const B_COMF = 2.5;
export type Following = { headway: number; acceleration: number };
export const DEFAULT_FOLLOWING: Following = { headway:1.3, acceleration:A_MAX };

export function followingAcceleration(speed: number, free: number, dv: number, gap: number, hasFront: boolean,
                                      { headway, acceleration }: Following = DEFAULT_FOLLOWING) {
  const want = 2 + speed * headway + Math.max(0, (speed * dv) / (2 * Math.sqrt(acceleration * B_COMF)));
  const a = Math.max(-0.8 * B_COMF, acceleration * (1 - (speed / free) ** 4));
  if (!hasFront) return a;
  const idm = a - acceleration * (want / Math.max(0.3, gap)) ** 2;
  const lead = Math.max(0, speed - dv);
  const cah = speed <= lead ? 0 : -((speed - lead) ** 2) / (2 * Math.max(0.1, gap - 2));
  return idm >= cah ? idm : 0.01 * idm + 0.99 * (cah + B_COMF * Math.tanh((idm - cah) / B_COMF));
}

export function limitAcceleration(a: number, speed: number, gap: number, stopping: boolean, acceleration = A_MAX) {
  if (stopping && gap - 2 < (speed * speed) / (2 * 2)) {
    a = Math.min(a, -(speed * speed) / (2 * Math.max(0.05, gap - 2)));
  }
  return Math.max(-8, Math.min(acceleration, a));
}

export function integrateSpeed(speed: number, a: number, dt: number) {
  return Math.max(0, speed + a * dt);
}

export function capStopSpeed(speed: number, gap: number, dt: number) {
  return Math.min(speed, Math.max(0, gap - 2) / dt);
}
