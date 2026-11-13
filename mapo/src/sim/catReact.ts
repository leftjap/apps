// 사람에 대한 고양이의 반응. 시각으로 정한 일정(catAt) 위에 덧씌운다.
// 경계심 많은 고양이: 사람이 5m 안으로 오면 반대쪽으로 몇 걸음 달아나 골목 틈·수풀로 숨고(흐려져 사라진다), 사람이 떠나면 제자리에 다시 나타난다.
// 개냥이: 사람이 10m 안으로 오면 다가가 발치에 앉고, 그 사람은 멈춰 서서 구경하며 휴대폰으로 사진을 찍는다.
import type { CatDef, CatState } from './cats.ts';

export interface WalkerView {
  n: number;
  x: Float32Array;
  z: Float32Array;
  id: Int32Array;
  fade: Float32Array;
}

const SHY_R = 5;
const SHY_CLEAR = 9; // 이 거리 안에 사람이 없어야 다시 나온다
const FRIENDLY_R = 10;
const HOLD = 25; // 사람이 멈춰 서서 구경하는 시간(초)
const COOL_FRIENDLY = 90;
const COOL_SHY = 20;
const TROT = 0.9; // 다가가고 돌아올 때 빠르기(m/s)

type Mode = 'none' | 'flee' | 'back-in' | 'visit' | 'return';

export function makeCatReactor(cats: CatDef[]) {
  /** 사람 발치에서 앉는 거리(m). 화면에서 키워 그리는 배율에 맞춰 main 이 바꾼다 */
  let gap = 0.8;
  const st = cats.map(() => ({ mode: 'none' as Mode, t: 0, x: 0, z: 0, yaw: 0, alpha: 1, clear: 0, cool: 0, wid: -1, dx: 0, dz: 0 }));

  /** base: 일정대로의 상태, hold(id, 초, 볼 곳 x, z): 사람을 세운다 */
  function step(dt: number, base: CatState[], w: WalkerView, hold: (id: number, secs: number, fx: number, fz: number) => void): CatState[] {
    return cats.map((c, i) => {
      const b = base[i];
      const r = st[i];
      r.cool -= dt;
      const cx = r.mode === 'none' ? b.x : r.x;
      const cz = r.mode === 'none' ? b.z : r.z;
      // 가장 가까운 사람
      let wd = Infinity;
      let wj = -1;
      for (let j = 0; j < w.n; j++) {
        if (w.fade[j] < 0.5) continue;
        const d = Math.hypot(w.x[j] - cx, w.z[j] - cz);
        if (d < wd) (wd = d), (wj = j);
      }
      const busy = b.pose === 2 || b.pose === 3; // 밥 먹거나 노는 중에는 다가가지 않는다
      if (r.mode === 'none') {
        r.alpha = Math.min(1, r.alpha + dt * 1.5);
        if (r.cool <= 0 && wj >= 0) {
          if (c.personality === 'shy' && wd < SHY_R) {
            const len = wd || 1;
            Object.assign(r, { mode: 'flee', t: 0, x: b.x, z: b.z, dx: (b.x - w.x[wj]) / len, dz: (b.z - w.z[wj]) / len, clear: 0 });
          } else if (c.personality === 'friendly' && wd < FRIENDLY_R && !busy) {
            const len = wd || 1;
            const sx = w.x[wj] + ((b.x - w.x[wj]) / len) * gap;
            const sz = w.z[wj] + ((b.z - w.z[wj]) / len) * gap;
            Object.assign(r, { mode: 'visit', t: 0, x: b.x, z: b.z, wid: w.id[wj] });
            hold(w.id[wj], HOLD, sx, sz);
          }
        }
        if (r.mode === 'none') return { ...b, alpha: r.alpha };
      }
      r.t += dt;
      if (r.mode === 'flee') {
        // 처음 0.8초 동안 3m 달아나며 흐려진다
        const k = Math.min(1, r.t / 0.8);
        if (k < 1) (r.x += r.dx * 3.75 * dt), (r.z += r.dz * 3.75 * dt);
        r.alpha = Math.max(0, 1 - Math.max(0, r.t - 0.5) / 0.8);
        r.clear = wd > SHY_CLEAR ? r.clear + dt : 0;
        if (r.clear > 6 && r.t > 2) Object.assign(r, { mode: 'back-in', t: 0 });
        return { ...b, x: r.x, z: r.z, yaw: Math.atan2(r.dz, r.dx), walk: k < 1 ? 1 : 0, pose: 0, status: r.alpha > 0.05 ? '사람을 피해 숨는 중' : '숨어 있는 중', alpha: r.alpha };
      }
      if (r.mode === 'back-in') {
        // 보이지 않는 사이에 제자리로 옮겨 놓고 천천히 나타난다
        r.x = b.x;
        r.z = b.z;
        r.alpha = Math.min(1, r.alpha + dt * 1.2);
        if (r.alpha >= 1) Object.assign(r, { mode: 'none', cool: COOL_SHY });
        return { ...b, alpha: r.alpha };
      }
      // 개냥이: 사람 발치로 가서 앉는다
      let j = -1;
      for (let k = 0; k < w.n; k++) if (w.id[k] === r.wid) j = k;
      if (r.mode === 'visit' && (j < 0 || r.t > HOLD)) Object.assign(r, { mode: 'return' });
      if (r.mode === 'visit') {
        const len = Math.hypot(r.x - w.x[j], r.z - w.z[j]) || 1;
        const tx = w.x[j] + ((r.x - w.x[j]) / len) * gap;
        const tz = w.z[j] + ((r.z - w.z[j]) / len) * gap;
        const d = Math.hypot(tx - r.x, tz - r.z);
        const move = Math.min(d, TROT * dt);
        if (d > 0.01) (r.x += ((tx - r.x) / d) * move), (r.z += ((tz - r.z) / d) * move);
        const arrived = d < 0.1;
        return {
          ...b,
          x: r.x,
          z: r.z,
          yaw: Math.atan2(w.z[j] - r.z, w.x[j] - r.x),
          walk: arrived ? 0 : 1,
          pose: arrived ? 1 : 0,
          status: arrived ? '사람에게 다가가 애교 부리는 중' : '사람에게 다가가는 중',
          alpha: 1,
        };
      }
      // 돌아가기: 일정대로의 자리로 걸어간다
      const d = Math.hypot(b.x - r.x, b.z - r.z);
      if (d < 0.2) {
        Object.assign(r, { mode: 'none', cool: COOL_FRIENDLY });
        return { ...b, alpha: 1 };
      }
      const move = Math.min(d, TROT * dt);
      r.x += ((b.x - r.x) / d) * move;
      r.z += ((b.z - r.z) / d) * move;
      return { ...b, x: r.x, z: r.z, yaw: Math.atan2(b.z - r.z, b.x - r.x), walk: 1, pose: 0, status: '제자리로 돌아가는 중', alpha: 1 };
    });
  }
  return {
    step,
    setGap(m: number) {
      gap = m;
    },
  };
}
