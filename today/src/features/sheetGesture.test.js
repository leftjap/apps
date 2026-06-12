/**
 * sheetGesture.js 단위 테스트 — 바텀 시트 1:1 추적 + 관성 snap 의 순수 결정 로직.
 *
 * 시트(댓글·가계부 타임라인)를 사이드바 드로어처럼 손가락 1:1 추적 + 속도/거리 snap 으로
 * 재작성하기 위한 순수 함수 3종 (progress 계산 / snap 판정 / 제스처 분류).
 * 좌표계: progress 0 = peek(닫힘), 1 = 열림. 여는 방향 = 위(dy<0), 닫는 방향 = 아래(dy>0).
 */
import { describe, it, expect } from 'vitest';
import {
  sheetProgress,
  sheetSnap,
  classifySheetGesture,
  SHEET_GESTURE,
} from './sheetGesture.js';

describe('sheetProgress — 손가락 1:1 추적 progress (0=peek, 1=열림)', () => {
  it('닫힘 상태에서 위로 드래그하면 진행률이 비례 증가', () => {
    expect(sheetProgress(-100, 300, false)).toBeCloseTo(0.3333, 3);
  });
  it('닫힘에서 range 만큼 위로 드래그하면 완전 열림(1)', () => {
    expect(sheetProgress(-300, 300, false)).toBe(1);
  });
  it('닫힘에서 range 초과로 끌어도 1 로 클램프', () => {
    expect(sheetProgress(-400, 300, false)).toBe(1);
  });
  it('닫힘에서 아래로(여는 반대) 끌면 0 으로 클램프', () => {
    expect(sheetProgress(50, 300, false)).toBe(0);
  });
  it('열림 상태에서 아래로 드래그하면 진행률이 비례 감소', () => {
    expect(sheetProgress(100, 300, true)).toBeCloseTo(0.6667, 3);
  });
  it('열림에서 range 만큼 아래로 드래그하면 완전 닫힘(0)', () => {
    expect(sheetProgress(300, 300, true)).toBe(0);
  });
  it('열림에서 위로(닫는 반대) 끌면 1 로 클램프', () => {
    expect(sheetProgress(-50, 300, true)).toBe(1);
  });
  it('range 0 이면 현재 상태 progress 반환 (0 나눗셈 방지)', () => {
    expect(sheetProgress(-100, 0, false)).toBe(0);
    expect(sheetProgress(100, 0, true)).toBe(1);
  });
});

describe('sheetSnap — touchend 속도/거리 snap 판정 (드로어 상수 재사용)', () => {
  it('닫힘에서 거리 임계(40%) 초과 → 열림으로 snap', () => {
    const r = sheetSnap({ dy: -200, range: 300, elapsedMs: 1000, startOpen: false });
    expect(r.targetOpen).toBe(true);
  });
  it('닫힘에서 거리·속도 모두 미달 → 닫힘 유지', () => {
    const r = sheetSnap({ dy: -50, range: 300, elapsedMs: 1000, startOpen: false });
    expect(r.targetOpen).toBe(false);
  });
  it('닫힘에서 빠른 플릭(속도>0.5 & 20% 초과) → 열림으로 snap', () => {
    const r = sheetSnap({ dy: -80, range: 300, elapsedMs: 100, startOpen: false });
    expect(r.targetOpen).toBe(true);
  });
  it('열림에서 거리 임계 초과 → 닫힘으로 snap (startOpen 반전)', () => {
    const r = sheetSnap({ dy: 200, range: 300, elapsedMs: 1000, startOpen: true });
    expect(r.targetOpen).toBe(false);
  });
  it('열림에서 소량 드래그 → 열림 유지 (spring back)', () => {
    const r = sheetSnap({ dy: 50, range: 300, elapsedMs: 1000, startOpen: true });
    expect(r.targetOpen).toBe(true);
  });
  it('elapsedMs 0 이어도 NaN 없이 속도 0 처리', () => {
    const r = sheetSnap({ dy: -50, range: 300, elapsedMs: 0, startOpen: false });
    expect(r.velocity).toBe(0);
    expect(r.targetOpen).toBe(false);
  });
});

describe('classifySheetGesture — 결정 시점 제스처 분류 (리스트 스크롤 조율)', () => {
  it('이동량이 결정 임계(6px) 미만이면 pending', () => {
    expect(classifySheetGesture({ dx: 2, dy: 3, startOpen: false, listScrollTop: 0 })).toBe('pending');
  });
  it('가로 우세(|dx|>|dy|*1.2)면 시트 제스처 포기(none)', () => {
    expect(classifySheetGesture({ dx: 20, dy: 5, startOpen: false, listScrollTop: 0 })).toBe('none');
  });
  it('닫힘 + 위로 → open', () => {
    expect(classifySheetGesture({ dx: 2, dy: -20, startOpen: false, listScrollTop: 0 })).toBe('open');
  });
  it('닫힘 + 아래로 → none (peek 아래로 못 감)', () => {
    expect(classifySheetGesture({ dx: 2, dy: 20, startOpen: false, listScrollTop: 0 })).toBe('none');
  });
  it('열림 + 아래로 + 리스트에서 시작 + 리스트 최상단(scrollTop 0) → close', () => {
    expect(classifySheetGesture({ dx: 2, dy: 20, startOpen: true, listScrollTop: 0, fromList: true })).toBe('close');
  });
  it('열림 + 아래로 + 리스트에서 시작 + 스크롤 중(scrollTop>0) → none (리스트 스크롤 우선)', () => {
    expect(classifySheetGesture({ dx: 2, dy: 20, startOpen: true, listScrollTop: 50, fromList: true })).toBe('none');
  });
  it('열림 + 아래로 + 핸들·헤더에서 시작(fromList=false) → 리스트 바닥이어도 항상 close', () => {
    // 사이드바처럼 핸들을 잡고 끌면 리스트 스크롤 위치 무관하게 닫혀야 함 (핵심 수정)
    expect(classifySheetGesture({ dx: 2, dy: 20, startOpen: true, listScrollTop: 9999, fromList: false })).toBe('close');
  });
  it('열림 + 아래로 + 핸들·헤더에서 시작 + 리스트 최상단 → close', () => {
    expect(classifySheetGesture({ dx: 2, dy: 20, startOpen: true, listScrollTop: 0, fromList: false })).toBe('close');
  });
  it('열림 + 위로 → none (fromList 무관, 리스트 아래로 스크롤 우선)', () => {
    expect(classifySheetGesture({ dx: 2, dy: -20, startOpen: true, listScrollTop: 0, fromList: true })).toBe('none');
    expect(classifySheetGesture({ dx: 2, dy: -20, startOpen: true, listScrollTop: 0, fromList: false })).toBe('none');
  });
  it('결정 임계 경계: |dy|=6 은 pending 아님(분류 진행)', () => {
    expect(classifySheetGesture({ dx: 0, dy: -6, startOpen: false, listScrollTop: 0 })).toBe('open');
  });
});

describe('SHEET_GESTURE — 드로어와 동일 상수 (질감 일치)', () => {
  it('드로어 제스처 상수와 동일 값 노출', () => {
    expect(SHEET_GESTURE.DECIDE_PX).toBe(6);
    expect(SHEET_GESTURE.ANGLE).toBe(1.2);
    expect(SHEET_GESTURE.SNAP_RATIO).toBe(0.4);
    expect(SHEET_GESTURE.VEL_RATIO).toBe(0.2);
    expect(SHEET_GESTURE.VEL_TH).toBe(0.5);
  });
});
