// lab 의 임시 화면은 파일 하나로 열려야 한다. 앱의 미리보기 창은 옆 파일을 읽지 못하고 큰 HTML 을 열지 못한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const lab = new URL('../lab/', import.meta.url);
const pages = readdirSync(lab, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

for (const name of pages) {
  const html = readFileSync(new URL(`${name}/index.html`, lab), 'utf8');

  test(`lab/${name}: 옆 파일을 참조하지 않는다`, () => {
    const refs = html.match(/[\w${}+ ./-]*\.(?:jpe?g|png|webp|gif|svg|css|mjs|js)(?=["'`)\s?])/gi) || [];
    assert.deepEqual(refs, []);
  });

  test(`lab/${name}: 500KB 보다 작다`, () => {
    assert.ok(Buffer.byteLength(html) < 500 * 1024, `${Buffer.byteLength(html)} bytes`);
  });

  test(`lab/${name}: 폴더에 index.html 만 있다`, () => {
    assert.deepEqual(readdirSync(new URL(`${name}/`, lab)), ['index.html']);
  });
}
