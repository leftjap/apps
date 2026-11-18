// 찻길 면 위 나무(재작업 W53). B2(adc34895)가 찻길 면을 길 정본에서 새로 구운 뒤 그린 찻길 면 안에 선 나무가 154그루(이 시험의 잼, 옛 면 91)로 늘었다.
// 판 전체 나무(board.json trees)마다 그린 찻길 면(surface.json g, test/w51-surface.ts drawn) 안 가장자리에서 0.3m 넘게 안쪽인지 잰다.
// 기준은 0 이다(풀지 않는다). 다만 실제 분리대·섬이 찻길로 칠해졌을 수 있는 자리의 가로수(tools/lib/treeplace.ts 가 그대로 두는 것)는 B3 에서 정하므로
// 아래 목록의 자리만 남아도 된다. 목록은 줄이기만 한다
import { describe, expect, it } from 'vitest';
import { deepOnCar } from '../tools/lib/treeplace.ts';
import { load } from './w48-stage2.ts';
import { drawn } from './w51-surface.ts';

/** B3 로 넘긴 자리(x,z m): 마주 오는 한 방향 길 사이 16그루, 6m 안에 옮길 자리가 없는 8그루 */
const B3 = new Set([
  // 마주 오는 한 방향 길 사이(성산로·신촌로·양화로 둘레 분리대·중앙버스차로 승강장 자리)
  '857.1,-719.0', '516.4,-1648.6', '549.3,-1647.0', '569.8,-1641.9', '1135.8,-1176.0', '1140.3,-1170.5', '1439.9,-961.9', '1471.9,-958.1',
  '1474.5,-957.9', '1477.6,-957.3', '1442.1,-461.2', '1484.5,-441.9', '1489.6,-439.4', '911.3,-704.3', '938.7,-691.2', '944.3,-687.7',
  // 6m 안에 찻길·건물 밖 자리가 없음: 독막로 교차로 한가운데, 독막로 건물이 찻길에 붙은 곳 둘, 광성로 빗금 갈림목 옆 섬 자리 셋, 그 밖 둘
  '949.5,448.6', '41.3,413.0', '51.3,413.5', '1244.8,53.0', '1244.8,49.0', '1244.8,44.2', '1250.0,-1086.8', '885.3,-1396.0',
]);

describe('찻길 면 위 나무(판 전체, 정적)', () => {
  it('그린 찻길 면 안(가장자리에서 0.3m 넘게 안쪽)에 선 나무가 B3 로 넘긴 자리 말고는 없다', () => {
    const d = load();
    const { B } = drawn(d);
    const T = d.board.trees;
    expect(T.length / 2).toBeGreaterThan(10_000);
    const where: string[] = [];
    for (let i = 0; i < T.length; i += 2) if (deepOnCar(B, T[i], T[i + 1])) where.push(`${T[i].toFixed(1)},${T[i + 1].toFixed(1)}`);
    expect(where.filter((w) => !B3.has(w)), where.join(' ')).toEqual([]);
    expect(where.length).toBeLessThanOrEqual(B3.size);
  });
});
