// 1단계 바닥(재작업 W60 순서 2, mapo/CLAUDE.md): 골목(등급 4·5) 찻길 면이 건물 외곽선을 덮지 않는다(정적, 함수는 test/w60-stage1.ts)
import { describe, expect, it } from 'vitest';
import { load } from './w48-stage2.ts';
import { bakedGround, buildingIntrusion } from './w60-stage1.ts';

const d = load();
// 그릴 때 둥글리기가 건물 모퉁이 옆에서 깎아 들어가는 자리는 건물이 덮으므로 굽기가 정한 외곽선으로 잰다
const D = bakedGround(d.dir);

describe('W60 1단계 건물 침범(판 전체)', () => {
  const by = buildingIntrusion(D, d.board, d.g, d.inter.X);
  const line = (c: number) => {
    if (c === -1) return `차로 띠 둘레(차로를 지킴) ${by.get(-1)?.n ?? 0}m(${by.get(-1)?.bldg.size ?? 0}동)`;
    const o = by.get(c);
    return o ? `등급${c} ${o.n}m(${o.bldg.size}동) ${o.at.slice(0, 5).map(([x, z]) => `${x.toFixed(0)},${z.toFixed(0)}`).join(' ')}` : `등급${c} 0`;
  };
  it('골목(등급 4·5) 찻길 면 안에 건물 외곽선이 0.3m 넘게 들지 않는다', () => {
    const all = [...by.keys()].sort((a, b) => a - b).map(line);
    console.log(`건물 침범(1m 표본)\n${all.join('\n')}`);
    expect((by.get(4)?.n ?? 0) + (by.get(5)?.n ?? 0), `${line(4)}\n${line(5)}`).toBe(0);
  });
});
