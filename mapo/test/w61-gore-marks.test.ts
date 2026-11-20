// 빗금(안전지대) 위에 그리는 칠한 선·화살표(재작업 W60 순서 3, 2026-11-20 지오 결정: 차로 정본은 그대로 두고 그릴 때 빗금 위 선·화살표를 지운다).
// 차로 정본이 빗금 위를 지나는 자리(w48 ③)는 3단계(차) 몫으로 남긴다. 판 전체, 정적
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeMarks, drawnMarks, type Marks, type MarksJson } from '../src/data/marks.ts';
import { DATA_DIR } from './w48-stage2.ts';

const marks = decodeMarks(JSON.parse(readFileSync(`${DATA_DIR}marks.json`, 'utf8')) as MarksJson);

/** 점이 어느 빗금 고리 안이면서 테두리에서 inset 넘게 안쪽인가(테두리 선은 빗금이 따로 긋는다) */
function deepIn(m: Marks, x: number, z: number, inset: number): boolean {
  for (const { ring: r } of m.zones) {
    let [x0, x1, z0, z1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (let k = 0; k < r.length; k += 2) (x0 = Math.min(x0, r[k])), (x1 = Math.max(x1, r[k])), (z0 = Math.min(z0, r[k + 1])), (z1 = Math.max(z1, r[k + 1]));
    if (x < x0 || x > x1 || z < z0 || z > z1) continue;
    let inside = false;
    let d = Infinity;
    for (let a = 0, b = r.length - 2; a < r.length; b = a, a += 2) {
      if (r[a + 1] > z !== r[b + 1] > z && x < r[a] + ((z - r[a + 1]) / (r[b + 1] - r[a + 1])) * (r[b] - r[a])) inside = !inside;
      const dx = r[a] - r[b];
      const dz = r[a + 1] - r[b + 1];
      const t = Math.max(0, Math.min(1, ((x - r[b]) * dx + (z - r[b + 1]) * dz) / (dx * dx + dz * dz || 1)));
      d = Math.min(d, Math.hypot(r[b] + dx * t - x, r[b + 1] + dz * t - z));
    }
    if (inside && d > inset) return true;
  }
  return false;
}

/** 땅 위 선이 빗금 안(테두리에서 0.3m 넘게 안쪽)을 지나는 길이(m, 0.5m 표본)와 빗금 안 화살표 */
function onGore(m: Marks) {
  const by = new Map<number, number>();
  const where: string[] = [];
  for (const ln of m.lines) {
    if (ln.p.some((v, i) => i % 3 === 1 && Math.abs(v) > 0.5)) continue; // 고가 위 선
    for (let k = 3; k < ln.p.length; k += 3) {
      const [ax, az, bx, bz] = [ln.p[k - 3], ln.p[k - 1], ln.p[k], ln.p[k + 2]];
      const L = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.ceil(L / 0.5));
      for (let i = 0; i < n; i++) {
        const x = ax + ((bx - ax) * (i + 0.5)) / n;
        const z = az + ((bz - az) * (i + 0.5)) / n;
        if (!deepIn(m, x, z, 0.3)) continue;
        by.set(ln.k, (by.get(ln.k) ?? 0) + L / n);
        if (where.length < 12) where.push(`k${ln.k} ${x.toFixed(1)},${z.toFixed(1)}`);
      }
    }
  }
  const arrows = m.arrows.filter((a) => deepIn(m, a.x, a.z, 0)).map((a) => `${a.x.toFixed(1)},${a.z.toFixed(1)}`);
  return { by, where, arrows };
}

describe('빗금 위에 그리는 칠한 선·화살표(판 전체, 정적)', () => {
  const now = onGore(marks);
  it('고치기 전 자료에는 빗금 위 선·화살표가 있다(시험이 찾는지 확인)', () => {
    console.log(`자료: 빗금 위 선 ${[...now.by].map(([k, v]) => `k${k} ${v.toFixed(0)}m`).join(' ')}, 화살표 ${now.arrows.length}개`);
    expect(now.by.size + now.arrows.length).toBeGreaterThan(0);
  });
  it('그리는 선·화살표는 빗금 안을 지나지 않는다', () => {
    const f = onGore(drawnMarks(marks));
    const total = [...f.by.values()].reduce((a, b) => a + b, 0);
    expect({ m: Math.round(total), arrows: f.arrows.length }, `${f.where.join(' ')} | 화살표 ${f.arrows.join(' ')}`).toEqual({ m: 0, arrows: 0 });
  });
  it('빗금 밖 선은 그대로 그린다(지운 길이는 빗금 안 길이만큼)', () => {
    const len = (m: Marks) => m.lines.reduce((s, ln) => s + Array.from({ length: ln.p.length / 3 - 1 }, (_, i) => Math.hypot(ln.p[i * 3 + 3] - ln.p[i * 3], ln.p[i * 3 + 5] - ln.p[i * 3 + 2])).reduce((a, b) => a + b, 0), 0);
    const cut = len(marks) - len(drawnMarks(marks));
    const inside = [...now.by.values()].reduce((a, b) => a + b, 0);
    // 테두리에서 0.3m 안쪽 경계까지는 자르는 자리가 테두리(교차점)라 지운 길이가 조금 더 길다
    expect(cut).toBeGreaterThan(inside - 1);
    expect(cut).toBeLessThan(inside * 1.5 + 20);
    expect(drawnMarks(marks).arrows.length).toBe(marks.arrows.length - now.arrows.length);
  });
  it('그리는 선에 길이 0 인 선분이 없다(같은 점이 셋 이어지면 가운데 점에서 방향이 0 이 돼 선 폭이 0 이 된다)', () => {
    const zeros = (m: Marks) => m.lines.reduce((s, ln) => s + Array.from({ length: ln.p.length / 3 - 1 }, (_, i) => Math.hypot(ln.p[i * 3 + 3] - ln.p[i * 3], ln.p[i * 3 + 5] - ln.p[i * 3 + 2]) < 1e-3).filter(Boolean).length, 0);
    expect(zeros(drawnMarks(marks))).toBeLessThanOrEqual(zeros(marks));
  });
  it('자른 선의 가운데 점은 원래 꼭짓점이다(잘게 본 자리는 끝점에만 남는다)', () => {
    const key = (x: number, z: number) => `${Math.round(x * 100)},${Math.round(z * 100)}`;
    const orig = new Set<string>();
    for (const ln of marks.lines) for (let i = 0; i < ln.p.length; i += 3) orig.add(key(ln.p[i], ln.p[i + 2]));
    const cut = drawnMarks(marks).lines.filter((ln) => !marks.lines.includes(ln));
    let extra = 0;
    for (const ln of cut) for (let i = 3; i < ln.p.length - 3; i += 3) if (!orig.has(key(ln.p[i], ln.p[i + 2]))) extra++;
    expect(cut.length).toBeGreaterThan(0);
    expect(extra).toBe(0);
  });
});
