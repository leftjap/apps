// 계절과 주말 한강공원 피크닉. 날짜 번호(1월 1일 = 1)로 나무 색을 고르고, 주말 낮에만 돗자리를 편다.
import type { Now } from './clock.ts';

export type Season = 'blossom' | 'green' | 'autumn' | 'winter';
export const SEASON_KO: Record<Season, string> = { blossom: '봄 벚꽃', green: '여름', autumn: '가을 단풍', winter: '겨울' };

export function seasonOf(doy: number): Season {
  if (doy >= 95 && doy < 115) return 'blossom'; // 4월 초~하순
  if (doy >= 290 && doy < 335) return 'autumn'; // 10월 중순~11월
  if (doy >= 335 || doy < 75) return 'winter';
  return 'green';
}

/** 주말(토·일) 10~18시, 겨울이 아니고 비가 그친 때 */
export function picnicOn(now: Now, season: Season, rain: number): boolean {
  const h = now.tod / 3600;
  return (now.dow === 0 || now.dow === 6) && h >= 10 && h < 18 && season !== 'winter' && rain < 0.3;
}
