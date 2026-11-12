// src 의 ES 모듈을 한 파일로 묶는다. 의존성 없이 import 줄과 export 키워드만 지운다.
// dist/index.html 하나를 만들고, 오늘 나오는 사건의 사진은 dist/img 로 복사한다.
// GitHub Pages 배포 워크플로가 dist 를 /apps/lietome/ 으로 올린다.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, cpSync, rmSync } from 'node:fs';
import { CASES, DAYS, img } from './src/cases.js';

const here = (p) => new URL(p, import.meta.url);
const ORDER = ['cases.js', 'logic.js', 'main.js'];

const js = ORDER.map((f) => {
  const src = readFileSync(here(`src/${f}`), 'utf8')
    .replace(/^import [^;]+;\n/gm, '')
    .replace(/^export (?=(const|function|let) )/gm, '');
  return `// ---- ${f} ----\n${src}`;
}).join('\n');

const css = readFileSync(here('src/style.css'), 'utf8');
const page = readFileSync(here('src/page.html'), 'utf8')
  .replace('/*STYLE*/', () => css)
  .replace('/*SCRIPT*/', () => js);

mkdirSync(here('dist/img'), { recursive: true });
writeFileSync(here('dist/index.html'), page);

const used = new Set(DAYS.flat());
let n = 0;
for (const c of CASES.filter((x) => used.has(x.id))) {
  for (const s of c.suspects) {
    for (const k of ['ans', 'base']) {
      const p = img(c.id, s.key, k);
      copyFileSync(here(p), here(`dist/${p}`));
      n += 1;
    }
  }
}
// lab 은 탐색용 임시 화면이다. 그대로 dist/lab 으로 옮겨 /apps/lietome/lab/... 주소로 연다.
rmSync(here('dist/lab'), { recursive: true, force: true });
cpSync(here('lab'), here('dist/lab'), { recursive: true });

console.log(`dist/index.html ${Buffer.byteLength(page)} bytes, 사진 ${n}장`);
