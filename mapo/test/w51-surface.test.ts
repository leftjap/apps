// 찻길 면·보도 면 화면 결함(재작업 W51, 설계 문서 59절 B2). 검사 함수는 test/w51-surface.ts. 고치기 전 값(HEAD 54eca142)은 59.8절.
// 기준은 0 이다(풀지 않는다). 가운데 뜻 없는 면만 남은 한 곳 때문에 측정값 상한(낮추기만 한다)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pavingRect, pavingZones } from '../src/data/paving.ts';
import type { AreaRec } from '../src/data/streetview.ts';
import { decodeSurface, tileRings, type SurfaceJson } from '../src/data/surface.ts';
import { load } from './w48-stage2.ts';
import { curbGap, drawn, greyGap, nearBuildings, overlapGap, thinIn, thinOut } from './w51-surface.ts';

describe('찻길 면·보도 면 화면 결함(판 전체, 정적)', () => {
  it('찻길 면 외곽에서 폭 0.5m 아래로 튀어나온 조각(모퉁이 삼각형)이 없다', () => {
    const f = thinOut(drawn());
    expect(f.n, f.where.join(' ')).toBe(0);
  });
  it('찻길 면 안으로 0.5m 아래로 좁게 파고든 찻길 아닌 조각(빗금 둘레 보도색)이 없다', () => {
    // 건물 벽에 붙은 틈은 뺀다(골목 찻길 면을 건물에서 잘라 낸 자리, 재작업 W60 순서 2)
    const f = thinIn(drawn(), nearBuildings(load().board.buildings));
    expect(f.n, f.where.join(' ')).toBe(0);
  });
  // HEAD 6,118m² → W51 80.25m²: e842(−315,−1676 둘레, 고가 램프 밑, 한쪽에서 15m 넘게 벌어진 사이를 다른 쪽이 반쯤 칠하는 자리), 서교동 e437(42,−226, 폭 2m 안팎),
  // 가로수 분리대 끝·좁은 분리대(녹지가 없는 0.75m 아래) 둘레. 측정값을 상한으로 두고 낮추기만 한다
  it('마주 오는 한 방향 큰길 사이에 찻길도 분리대도 아닌 면이 없다(중앙차로 회색 면)', () => {
    const f = greyGap(load(), drawn());
    expect(f.of).toBeGreaterThan(10_000);
    expect(f.area, f.where.join(' ')).toBeLessThanOrEqual(81);
  });
  it('연석이 찻길 면 외곽을 따라가고 찻길 안에는 없다', () => {
    const f = curbGap(drawn(), nearBuildings(load().board.buildings));
    expect(f.total).toBeGreaterThan(100_000);
    expect({ missing: Math.round(f.missing), inside: Math.round(f.inside) }, f.where.join(' ')).toEqual({ missing: 0, inside: 0 });
  });
  it('걷고싶은거리 포장 구역은 겹침도 1m 안 틈도 없다', () => {
    const rec = JSON.parse(readFileSync(new URL('../data-src/streetview/redroad.json', import.meta.url), 'utf8')) as AreaRec;
    const road = tileRings(decodeSurface(JSON.parse(readFileSync(new URL('../public/data/surface.json', import.meta.url), 'utf8')) as SurfaceJson).ground);
    const zones = pavingZones(rec.props, road);
    expect(rec.props.filter((p) => p.kind === 'paving').length).toBeGreaterThan(200);
    // 재질·색마다(벽돌 보도·붉은 칠·황토 돌판) 따로 잰다
    for (const z of zones) {
      const f = overlapGap([z.rings]);
      expect({ zone: `${z.surface}|${z.color}`, overlap: Math.round(f.overlap), gap: Math.round(f.gap) }).toEqual({ zone: `${z.surface}|${z.color}`, overlap: 0, gap: 0 });
    }
    expect(zones.length).toBeGreaterThanOrEqual(2);
    // 고치기 전(사각형을 하나씩 그림)에는 겹침과 틈이 있었다: 같은 검사가 그것을 잡는지
    const rects = rec.props.flatMap((p) => (p.kind === 'paving' && p.color === '#b8645a' ? [[pavingRect(p)]] : []));
    const before = overlapGap(rects);
    expect(before.overlap + before.gap).toBeGreaterThan(10);
  });
});
