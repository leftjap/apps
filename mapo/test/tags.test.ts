import { describe, expect, it } from 'vitest';
import { lineMark } from '../src/ui/tags.ts';

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
