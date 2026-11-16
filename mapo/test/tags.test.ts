import { describe, expect, it } from 'vitest';
import { arrivalBadge, lineMark } from '../src/ui/tags.ts';

describe('역 이름표의 노선 기호', () => {
  it('번호 노선은 원 안의 번호', () => {
    expect(lineMark('2호선')).toEqual({ text: '2', round: true });
    expect(lineMark('6호선')).toEqual({ text: '6', round: true });
  });
  it('이름 노선은 둥근 네모 안의 짧은 이름', () => {
    expect(lineMark('경의중앙선')).toEqual({ text: '경의중앙', round: false });
    expect(lineMark('공항철도')).toEqual({ text: '공항', round: false });
  });
});

describe('역 이름표의 도착 표시', () => {
  const row = (line: string, state: string, inSec: number) => ({ line, dir: 0 as const, toward: '', state, inSec });
  it('서 있는 열차가 있으면 도착, 90초 안에 오면 곧 도착, 아니면 없음', () => {
    expect(arrivalBadge([row('2', '3분 후', 180), row('6', '정차 중', 0)])).toEqual({ text: '도착', line: '6' });
    expect(arrivalBadge([row('2', '곧 도착', 40), row('6', '2분 후', 120)])).toEqual({ text: '곧 도착', line: '2' });
    expect(arrivalBadge([row('2', '3분 후', 180)])).toBeNull();
  });
  it('시간표로 어림한 줄도 남은 초로 판단하고, 운행이 끝났으면 없음', () => {
    expect(arrivalBadge([row('A', '곧 도착 · 시간표', 30)])).toEqual({ text: '곧 도착', line: 'A' });
    expect(arrivalBadge([row('2', '운행 종료 · 첫차 05:31', 0)])).toBeNull();
  });
});
