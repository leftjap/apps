import { describe, expect, it } from 'vitest';
import { picnicOn, seasonOf } from '../src/sim/season.ts';
import { at } from './helpers.ts';

describe('계절', () => {
  it('날짜로 벚꽃·초록·단풍·겨울을 고른다', () => {
    expect(seasonOf(100)).toBe('blossom'); // 4월 10일
    expect(seasonOf(200)).toBe('green');
    expect(seasonOf(300)).toBe('autumn'); // 10월 27일
    expect(seasonOf(10)).toBe('winter');
    expect(seasonOf(350)).toBe('winter');
  });
  it('주말 낮이고 겨울이나 비가 아니면 한강공원에 돗자리를 편다', () => {
    expect(picnicOn(at(14, 6), 'green', 0)).toBe(true);
    expect(picnicOn(at(14, 0), 'blossom', 0)).toBe(true);
    expect(picnicOn(at(14, 3), 'green', 0)).toBe(false); // 수요일
    expect(picnicOn(at(21, 6), 'green', 0)).toBe(false); // 밤
    expect(picnicOn(at(14, 6), 'winter', 0)).toBe(false);
    expect(picnicOn(at(14, 6), 'green', 0.8)).toBe(false); // 비
  });
});
