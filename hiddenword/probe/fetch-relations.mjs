// 우리말샘 오픈 API 로 정답의 뜻 번호를 찾고, 그 뜻에 사전이 등록한 관계어(비슷한말·반대말·상위어·하위어 등)를 받는다.
// 인증키: ~/.config/hiddenword/.env 의 OPENDICT_API_KEY (하루 50,000건). 결과: probe/relations.json
// 사용: node probe/fetch-relations.mjs           → 정답마다 뜻 후보를 보여 준다(config.mjs 에 senseCode 가 없을 때)
//       senseCode 가 정해진 정답은 관계어를 받아 저장한다
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { ANSWERS } from './config.mjs';

const KEY = readFileSync(`${homedir()}/.config/hiddenword/.env`, 'utf8').match(/OPENDICT_API_KEY=(\w+)/)[1];
const api = async (path, params) => {
  const url = `https://opendict.korean.go.kr/api/${path}?` + new URLSearchParams({ key: KEY, req_type: 'json', ...params });
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(`${path} 오류 ${data.error.error_code}: ${data.error.message}`);
  return data.channel;
};
const list = (x) => (Array.isArray(x) ? x : x ? [x] : []);
// 「계약001」처럼 붙은 동음이의어 번호와 「명명-규약」의 붙임표를 뗀다
const clean = (w) => w.replace(/\d+$/, '').replace(/[-^ ]/g, '');

const out = {};
for (const { word, sense, senseCode } of ANSWERS) {
  if (!senseCode) {
    const ch = await api('search', { q: word, num: 30, advanced: 'y', method: 'exact', pos: 1 });
    console.log(`\n== ${word} (고정할 뜻: ${sense}) 뜻 후보`);
    for (const it of list(ch.item)) for (const s of list(it.sense)) console.log(`  ${s.target_code}  ${s.definition?.slice(0, 70)}`);
    continue;
  }
  const ch = await api('view', { q: senseCode, method: 'target_code' });
  const item = list(ch.item)[0];
  const relations = list(item.senseInfo.relation_info).map((r) => ({ type: r.type, word: clean(r.word), raw: r.word }));
  out[word] = { senseCode, definition: item.senseInfo.definition, relations };
  const byType = {};
  for (const r of relations) (byType[r.type] ??= []).push(r.word);
  console.log(`\n== ${word} (${senseCode}) ${item.senseInfo.definition}`);
  for (const [t, ws] of Object.entries(byType)) console.log(`  ${t} ${ws.length}개: ${ws.join(', ')}`);
}
if (Object.keys(out).length) {
  writeFileSync(new URL('relations.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
  console.log('\nprobe/relations.json 을 썼다');
}
