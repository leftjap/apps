// 행정동 경계에서 서울 동네 검색어 목록(probe/seoul-dongs.json)을 만든다.
// 경계: vuski/admdongkor (통계청 SGIS 행정동 경계 가공, CC BY 4.0)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildGazetteer } from './lib.mjs';

const VERSION = 'ver20261001';
const SRC_URL = `https://raw.githubusercontent.com/vuski/admdongkor/master/${VERSION}/HangJeongDong_${VERSION}.geojson`;
const RAW = new URL(`../data-raw/HangJeongDong_${VERSION}.geojson`, import.meta.url);
const OUT = new URL('./seoul-dongs.json', import.meta.url);

// 행정동 이름으로는 잡히지 않는, 사람들이 실제로 쓰는 생활권 이름
const AREAS = [
  ['홍대', '마포구'], ['합정', '마포구'], ['망리단길', '마포구'], ['연트럴파크', '마포구'],
  ['신촌', '서대문구'], ['이대', '서대문구'], ['서촌', '종로구'], ['북촌', '종로구'], ['익선동', '종로구'],
  ['인사동', '종로구'], ['대학로', '종로구'], ['서울숲', '성동구'], ['뚝섬', '성동구'], ['경리단길', '용산구'],
  ['해방촌', '용산구'], ['용리단길', '용산구'], ['가로수길', '강남구'], ['압구정로데오', '강남구'], ['강남역', '강남구'],
  ['코엑스', '강남구'], ['잠실', '송파구'], ['송리단길', '송파구'], ['건대입구', '광진구'], ['샤로수길', '관악구'],
  ['문래창작촌', '영등포구'],
].map(([query, gu]) => ({ query, gu }));

if (!existsSync(RAW)) {
  console.error(`경계 자료 내려받는 중: ${SRC_URL}`);
  mkdirSync(new URL('../data-raw/', import.meta.url), { recursive: true });
  const res = await fetch(SRC_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${SRC_URL}`);
  writeFileSync(RAW, Buffer.from(await res.arrayBuffer()));
}

const { features } = JSON.parse(readFileSync(RAW, 'utf8'));
const entries = buildGazetteer(features, { areas: AREAS });
const dongs = entries.filter((e) => e.kind === 'dong');
writeFileSync(OUT, `${JSON.stringify({
  source: `vuski/admdongkor ${VERSION} (통계청 SGIS 행정동 경계 가공, CC BY 4.0)`,
  entries,
}, null, 1)}\n`);
console.log(`서울 행정동 ${features.filter((f) => f.properties.sido === '11').length}개 → 검색어 ${dongs.length}개 + 생활권 ${AREAS.length}개`);
console.log(`서울 안에서 이름이 겹침: ${dongs.filter((e) => e.sharedInSeoul).map((e) => `${e.gu} ${e.query}`).join(', ') || '없음'}`);
console.log(`서울 밖과 이름이 겹침: ${dongs.filter((e) => e.sharedOutsideSeoul).length}개`);
