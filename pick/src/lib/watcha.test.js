import { describe, it, expect } from 'vitest';
import { parseWatchaCsv } from './watcha.js';

// ⚠ 컬럼명은 erinyskim/watchapedia-export 가정값 — 실제 export 헤더로 확정 필요(spec §5, plan T11 Step1).
const SAMPLE = `content_id,title,original_title,type,year,director,watched_at,rating,review
1,데미안,Demian,MOVIE,2020,Foo,2024-01-02,4.5,좋음
2,어떤드라마,X,TV,2021,Bar,2024-02-02,5.0,
3,비추영화,Z,MOVIE,2019,Baz,2024-03-02,0.5,별로
4,무평점,Q,MOVIE,2018,Qux,2024-04-02,,
5,"콤마, 제목",W,MOVIE,2017,Wuz,2024-05-02,3.0,"리뷰, 콤마"`;

describe('parseWatchaCsv', () => {
  it('MOVIE만 추출, TV 제외', () => {
    const rows = parseWatchaCsv(SAMPLE);
    expect(rows.every((r) => r.media_type === 'movie')).toBe(true);
    expect(rows.find((r) => r.title === '어떤드라마')).toBeUndefined();
  });
  it('제목·연도·평점 매핑 + source=watcha', () => {
    expect(parseWatchaCsv(SAMPLE)[0]).toMatchObject({ title: '데미안', year: 2020, rating: 4.5, source: 'watcha', media_type: 'movie' });
  });
  it('최저 0.5 보존(비추)', () => {
    expect(parseWatchaCsv(SAMPLE).find((r) => r.title === '비추영화').rating).toBe(0.5);
  });
  it('평점 없는 행 제외', () => {
    expect(parseWatchaCsv(SAMPLE).find((r) => r.title === '무평점')).toBeUndefined();
  });
  it('따옴표 안 콤마 필드 보존', () => {
    expect(parseWatchaCsv(SAMPLE).find((r) => r.title === '콤마, 제목')?.rating).toBe(3.0);
  });
});
