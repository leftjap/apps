import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildLocal } from '../probe/build-local.mjs';

// 앱의 미리보기 창은 파일 하나만 읽고 옆 파일을 읽지 못하며 500KB 가 넘으면 열지 못한다
const local = readFileSync(new URL('../local.html', import.meta.url), 'utf8');

test('로컬 페이지는 바깥 파일을 불러오지 않는다', () => {
  assert.ok(!/\bimport\s[^;]*from\s/.test(local), 'import 가 남아 있다');
  assert.ok(!local.includes('fetch('), 'fetch 가 남아 있다');
  assert.ok(!/\s(src|href)=/.test(local), 'src 나 href 가 남아 있다');
});

test('로컬 페이지는 500KB 보다 작다', () => {
  assert.ok(Buffer.byteLength(local) < 500 * 1024, `${Buffer.byteLength(local)} 바이트`);
});

test('로컬 페이지는 지금의 화면, 규칙, 점수표로 만든 것이다', () => {
  assert.equal(local, buildLocal());
});
