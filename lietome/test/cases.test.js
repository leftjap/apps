import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { SOURCES, EMOTIONS, CASES, DAYS, img } from '../src/cases.js';

const byId = Object.fromEntries(CASES.map((c) => [c.id, c]));
const here = (p) => new URL(`../${p}`, import.meta.url);

test('표정 설명: 감정 분류에는 출처가 있고, 출처는 제목과 링크를 가진다', () => {
  for (const [id, e] of Object.entries(EMOTIONS)) {
    assert.ok(e.name && e.face, id);
    if (e.source) assert.ok(SOURCES[e.source]?.url && SOURCES[e.source]?.title, `${id} → ${e.source}`);
  }
});

test('오늘 나오는 사건: 세 사람, 거짓말은 한 명, 단서 위치와 사진이 있다', () => {
  for (const day of DAYS) {
    for (const id of day) {
      const c = byId[id];
      assert.ok(c, `없는 사건 ${id}`);
      assert.ok(c.title && c.situation && c.news, `${id} 문구`);
      assert.equal(c.suspects.length, 3, `${id} 인원`);
      assert.equal(new Set(c.suspects.map((s) => s.key)).size, 3, `${id} key 중복`);
      const liars = c.suspects.filter((s) => s.liar);
      assert.equal(liars.length, 1, `${id} 거짓말 ${liars.length}명`);
      const { tell } = liars[0];
      assert.ok(tell && tell.x > 0 && tell.x < 1 && tell.y > 0 && tell.y < 1 && tell.r > 0, `${id} 단서 위치`);
      assert.ok(EMOTIONS[liars[0].emotion].source, `${id} 거짓말 표정에는 출처가 있어야 한다`);
      for (const s of c.suspects) {
        assert.ok(EMOTIONS[s.emotion], `${id}-${s.key} 표정`);
        assert.ok(s.name && s.says, `${id}-${s.key} 이름·대사`);
        for (const kind of ['ans', 'base']) assert.ok(existsSync(here(img(id, s.key, kind))), `${id}-${s.key}-${kind} 사진`);
      }
    }
  }
});
