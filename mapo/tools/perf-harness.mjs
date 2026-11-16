// 로컬 빌드(dist)를 배포 주소에서 띄우는 스크립트를 만든다(재작업 W19, tools/perf-probe.js 와 함께 쓴다).
// 샌드박스가 로컬 포트를 막아 미리보기 서버를 못 띄우므로, dist 의 자료·번들을 한 스크립트에 묶어 같은 출처(https://leftjap.github.io/apps/) 페이지에서
// evaluate_script(format: script)로 돌리면 문서를 갈아 끼우고 번들을 실행한다(자료 요청은 묶은 것으로 답한다).
// 쓰는 법: pnpm build && node tools/perf-harness.mjs <dist 폴더> <내보낼 파일>(chrome-devtools MCP 가 읽을 수 있게 ~/apps 아래, 예: tmp/w19/harness.js)
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const [D, OUT] = process.argv.slice(2);
const files = {};
for (const f of readdirSync(D + '/data')) if (f.endsWith('.json') && f !== 'surface-polys.json') files['/apps/mapo/data/' + f] = readFileSync(D + '/data/' + f, 'utf8');
const assets = readdirSync(D + '/assets');
for (const f of assets) if (f.endsWith('.json')) files['/apps/mapo/assets/' + f] = readFileSync(D + '/assets/' + f, 'utf8');
const js = readFileSync(D + '/assets/' + assets.find((f) => f.endsWith('.js')), 'utf8');
const css = readFileSync(D + '/assets/' + assets.find((f) => f.endsWith('.css')), 'utf8');
const mask = readFileSync(D + '/data/mask.png').toString('base64');
const out = `(() => {
const FILES = ${JSON.stringify(files)};
const MASK = 'data:image/png;base64,${mask}';
const of = window.fetch.bind(window);
window.fetch = (u, o) => { const p = new URL(String(u), location.href).pathname; if (p in FILES) return Promise.resolve(new Response(FILES[p], { headers: { 'content-type': 'application/json' } })); if (p === '/apps/mapo/data/mask.png') return of(MASK); return of(u, o); };
const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
Object.defineProperty(HTMLImageElement.prototype, 'src', { get() { return desc.get.call(this); }, set(v) { desc.set.call(this, String(v).includes('/data/mask.png') ? MASK : v); }, configurable: true });
history.replaceState(null, '', '/apps/mapo/' + location.search);
document.head.innerHTML = '<meta charset="utf-8"><title>local</title><style>' + ${JSON.stringify(css)} + '</style>';
document.body.innerHTML = '<div id="app"><div id="stage"><div id="sky"></div><canvas id="view"></canvas><p id="loading">…</p></div></div>';
const s = document.createElement('script'); s.type = 'module'; s.src = URL.createObjectURL(new Blob([${JSON.stringify(js)}], { type: 'text/javascript' }));
document.body.appendChild(s);
return 'ok';
})()`;
writeFileSync(OUT, out);
console.log(`${OUT} ${(out.length / 1e6).toFixed(1)}MB`);
