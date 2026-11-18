// 차로 정본 2단계 정적 시험(재작업 W48, 설계 문서 59절). 검사 함수는 test/w48-stage2.ts, 고치기 전 값(HEAD 742c241d)은 59.1절 표.
// it.fails 는 지금 깨지는 검사다(목표 0 이 아니면 이 시험이 실패한다). 59절 단계 계획(59.5절)에서 그 검사를 맡은 단계(B1~B4·D)가 들어가는 커밋에서 it 로 바꾼다.
// 기준(0, 0.3m)은 풀지 않는다. 지금 통과하는 검사(철도 부지 위 차로)는 나빠지지 않게 it 로 둔다.
import { describe, expect, it } from 'vitest';
import { centreLines, laneBodyOffBaked, lanesOnGore, lanesOnPaint, load, marksOffBaked, railOverlap, seamBreaks, sidewalkOnLanes, stopLineCover } from './w48-stage2.ts';

describe('차로 정본 2단계: 찻길·표시·보도를 길 정본에서 굽는다(판 전체, 정적)', () => {
  // B3: 교차로가 아닌 이음매에서 차가 곡선 없이 옆 거리(side)로 넘어가는 곳의 차로 끝점 차이(HEAD 1,706곳 중 545곳이 0.3m 넘음)
  it.fails('① 이음매에서 이어지는 차로 끝점 차이가 0.3m 안', () => {
    const f = seamBreaks(load());
    expect(f.of).toBeGreaterThan(1000);
    expect(f.n, f.where.join(' ')).toBe(0);
  });
  // B2: 차 몸 폭(차로 가운데 ± 0.9m)이 구운 찻길 면 밖인 길이(HEAD 6.9km / 221km). 실행 중 차로 띠(58절 1단계)는 세지 않는다
  it.fails('② 차 몸 폭 띠가 구운 찻길 면 안', () => {
    const f = laneBodyOffBaked(load());
    expect(f.of).toBeGreaterThan(200_000);
    expect(f.n, f.where.join(' ')).toBe(0);
  });
  // B3: 빗금(안전지대) 위 차로 가운데선(HEAD 2.5km)
  it.fails('③ 빗금 위를 지나는 차로가 없다', () => {
    const f = lanesOnGore(load());
    expect(f.n, f.where.join(' ')).toBe(0);
  });
  // B1: 상자 밖에서 칠한 차로 경계선 0.3m 안을 달리는 차로(HEAD 1.5km → W49 0)
  it('④ 칠한 차선 위를 달리는 차로가 없다', () => {
    const f = lanesOnPaint(load());
    expect(f.n, f.where.join(' ')).toBe(0);
  });
  // B1·B2: 땅 위 노면 표시 선이 구운 찻길 면 밖(0.3m 넘게)인 길이(HEAD 0.27km / 348km). W49(B1) 뒤 68m: 모두 정지선이고, 구운 찻길 면이 없고
  // 실행 중 차로 띠(58절)만 찻길로 칠하는 진입로(−1653,−829 · −1219,−53 · 92,−288 · −241,−1899 · 1589,−425 둘레)에 차가 서는 자리다. 찻길 면을 정본에서 굽는 B2 에서 0
  it.fails('⑤ 노면 표시가 구운 찻길 면 안', () => {
    const f = marksOffBaked(load());
    expect(f.n, f.where.join(' ')).toBe(0);
  });
  // B1: 신호 진입로 일반 차로마다 서는 자리에 칠한 정지선 하나(HEAD 489차로 중 180 누락, 1 겹침 → W49 0, 0)
  it('⑥ 신호 진입로의 차로마다 정지선이 하나', () => {
    const f = stopLineCover(load());
    expect(f.of).toBeGreaterThan(300);
    expect({ missing: f.n, dup: f.dup }, f.where.join(' ')).toEqual({ missing: 0, dup: 0 });
  });
  // B2·B4: 땅 높이 선로 띠 위 찻길 면(HEAD 650m², 양화진길), 터파기 위 찻길 면(HEAD 572m², 양화로)
  it.fails('⑦ 철도 부지 위에 찻길 면이 없다', () => {
    const f = railOverlap(load());
    expect({ deck: Math.round(f.n), trough: Math.round(f.trough) }, f.where.join(' ')).toEqual({ deck: 0, trough: 0 });
  });
  it('⑦-2 철도 부지 위를 지나는 차로가 없다(지금도 0, 나빠지지 않게)', () => {
    expect(railOverlap(load()).lanes).toBe(0);
  });
  // B1: 양방향 큰길 단면에 칠한 황색 중앙선이 둘 넘는 곳(HEAD 3,730단면 중 16 → W49 0)
  it('⑧ 양방향 큰길의 중앙선은 한 줄', () => {
    const f = centreLines(load());
    expect(f.of).toBeGreaterThan(3000);
    expect(f.n, f.where.join(' ')).toBe(0);
  });
  // D: 걷는 그물의 보도 선이 차가 달리는 차로 띠(0.3m 안쪽) 위인 길이(HEAD 636m / 139km)
  it.fails('⑨ 보도 선이 차로 위를 지나지 않는다', () => {
    const f = sidewalkOnLanes(load());
    expect(f.n, f.where.join(' ')).toBe(0);
  });
});
