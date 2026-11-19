// 노면 표시·횡단보도 마무리(재작업 W59, 1·2단계): 그리는 횡단보도 줄무늬가 칠한 선·화살표·시설물·연석과 맞는지 판 전체로 센다(정적, 함수는 test/w59-stage12.ts).
// 화면에서 찾은 결함(홍대입구역 양화로 길 중간 횡단보도 x 393, z −588 둘레: 황색 복선 중앙선이 줄무늬 밑까지 이어진다)을 같은 종류로 판 전체에서 센다.
// 실제 길의 차선·중앙선은 횡단보도 앞에서 끝나므로 (1) 은 겹침뿐 아니라 0.3m 안으로 붙은 것도 센다. 기준 0 은 풀지 않는다.
import { describe, expect, it } from 'vitest';
import { crosswalkEndGaps, furnitureOnCrosswalk, load, markClearance, markOverlap, worst } from './w59-stage12.ts';

const d = load();

describe('W59 노면 표시·횡단보도 결함(판 전체)', () => {
  it('(1) 칠한 선(중앙선·차선·버스전용선·가장자리선·정지선)·노면 화살표가 횡단보도 줄무늬 면(늘인 면 포함)과 겹치거나 0.3m 안으로 붙지 않는다', () => {
    const f = markOverlap(d);
    console.log(`(1) 겹침·붙음 ${f.n}곳(짝 ${f.of} 가운데), 종류마다 ${JSON.stringify(f.byKind)}\n${worst(f, 'm').join('\n')}`);
    // 화면에서 찾은 자리(홍대입구역 양화로 길 중간 신호 횡단보도, x 393, z −588 둘레): 둘레 표시까지 틈을 적고, 고치기 전에는 중앙선이 세어져야 한다
    const xs = d.board.crosswalks.map((c, i) => ({ i, c })).filter(({ c }) => c.sig && Math.hypot(c.x - 393, c.z + 588) < 25);
    expect(xs.length).toBeGreaterThan(0);
    for (const { i, c } of xs) {
      const near = markClearance(d, i).slice(0, 6).map((m) => `${m.note} ${m.gap.toFixed(2)}m`);
      console.log(`(1) 홍대입구 양화로 xw${i} ${c.x.toFixed(1)},${c.z.toFixed(1)} 늘인 면 ${d.marks.crossings.has(i)}: 가장 가까운 표시 ${near.join(', ')}`);
    }
    const here = f.spots.filter((s) => Math.hypot(s.x - 393, s.z + 588) < 15);
    console.log(`(1) 홍대입구 양화로 자리 15m 안: ${here.map((s) => s.note).join(', ') || '없음'}`);
    expect(f.of).toBeGreaterThan(500);
    expect(f.n, worst(f, 'm').join('\n')).toBe(0);
  });
  it('(2) 신호 기둥·정류장 쉼터·출구·엘리베이터 바닥이 횡단보도 면을 긴 두 변 쪽으로 0.2m 늘인 띠와 겹치지 않는다(끝 너머 보도는 괜찮다)', () => {
    const f = furnitureOnCrosswalk(d);
    console.log(`(2) 시설물 ${f.n}개(${f.of} 가운데), 침범 합 ${f.total.toFixed(1)}m, ${JSON.stringify(f.byKind)}\n${worst(f, 'm').join('\n')}`);
    expect(f.of).toBeGreaterThan(1000);
    expect(f.n, worst(f, 'm').join('\n')).toBe(0);
  });
  it('(3) 신호 횡단보도 줄무늬 양 끝이 연석·섬·분리대 가장자리에 닿는다(건너는 방향 틈 0.3m 안)', () => {
    const f = crosswalkEndGaps(d);
    const long = f.spots.filter((s) => s.v > 8).length;
    console.log(`(3) 끝 틈 ${f.n}곳(끝 ${f.of} 가운데, 8m 넘는 것 ${long}), 틈 길이 합 ${f.total.toFixed(1)}m\n${worst(f, 'm').join('\n')}`);
    expect(f.of).toBeGreaterThan(400);
    expect(f.n, worst(f, 'm').join('\n')).toBe(0);
  });
});
