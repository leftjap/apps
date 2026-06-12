import { describe, it, expect } from 'vitest';
import { clusterPoints, sweepLefts } from './flow.js';

describe('clusterPoints — 점 간격 60px 이하 클러스터 묶음 (작업지시서 §3.3)', () => {
  const pts = (...xs) => xs.map((x, i) => ({ id: 'a' + i, x }));

  it('멀리 떨어진 점 — 각자 단독 클러스터', () => {
    const out = clusterPoints(pts(100, 300, 600));
    expect(out.map((c) => c.items.length)).toEqual([1, 1, 1]);
    expect(out.map((c) => c.cx)).toEqual([100, 300, 600]);
  });

  it('60px 이하 인접 2개 — 한 클러스터, cx 는 평균', () => {
    const out = clusterPoints(pts(100, 150, 600));
    expect(out.length).toBe(2);
    expect(out[0].items.map((a) => a.id)).toEqual(['a0', 'a1']);
    expect(out[0].cx).toBe(125);
  });

  it('경계값 — 정확히 60px 간격도 같은 클러스터', () => {
    const out = clusterPoints(pts(100, 160));
    expect(out.length).toBe(1);
  });

  it('체인 병합 — 인접 기준이라 양끝이 60px 넘어도 한 클러스터', () => {
    const out = clusterPoints(pts(100, 150, 200));
    expect(out.length).toBe(1);
    expect(out[0].cx).toBe(150);
  });

  it('클러스터 key 는 첫 점의 id', () => {
    const out = clusterPoints(pts(100, 150));
    expect(out[0].key).toBe('a0');
  });

  it('입력 순서 무관 — x 오름차순 정렬 후 묶음', () => {
    const out = clusterPoints([{ id: 'b', x: 150 }, { id: 'a', x: 100 }, { id: 'c', x: 600 }]);
    expect(out[0].items.map((a) => a.id)).toEqual(['a', 'b']);
  });

  it('원본 배열 비변경', () => {
    const input = [{ id: 'b', x: 600 }, { id: 'a', x: 100 }];
    clusterPoints(input);
    expect(input.map((a) => a.id)).toEqual(['b', 'a']);
  });
});

describe('sweepLefts — 라벨 실측 폭 좌→우 스윕 + 컨테이너 클램프 (작업지시서 §3.3)', () => {
  it('겹침 없음 — 중앙 정렬 그대로 (cx - w/2)', () => {
    expect(sweepLefts([100, 400], [80, 80], 800)).toEqual([60, 360]);
  });

  it('왼쪽 경계 — 음수 left 는 0 으로 클램프', () => {
    expect(sweepLefts([20], [80], 800)).toEqual([0]);
  });

  it('오른쪽 경계 — 컨테이너 폭 넘으면 W - w 로 클램프', () => {
    expect(sweepLefts([790], [80], 800)).toEqual([720]);
  });

  it('겹침 2개 — 뒤 라벨이 앞 라벨 + 폭 + 26px 간격으로 밀림', () => {
    const out = sweepLefts([100, 120], [80, 80], 800);
    expect(out[0]).toBe(60);
    expect(out[1]).toBe(60 + 80 + 26);
  });

  it('우측 밀림이 경계를 넘으면 역방향 패스로 앞 라벨까지 당겨짐', () => {
    const out = sweepLefts([760, 790], [80, 80], 800);
    expect(out[1]).toBe(720);
    expect(out[0]).toBe(720 - 26 - 80);
    expect(out[1] - (out[0] + 80)).toBeGreaterThanOrEqual(26);
  });

  it('최소 간격 26px 항상 유지', () => {
    const out = sweepLefts([400, 405, 410], [120, 120, 120], 800);
    for (let i = 1; i < out.length; i++) {
      expect(out[i] - (out[i - 1] + 120)).toBeGreaterThanOrEqual(26);
    }
  });
});
