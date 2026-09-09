/**
 * 코어100 시드의 phonetic_kr 이 확정 gold(docs/core100-gold.json ← docs/core100-gold.md, 2026-09-09 승인)와 같은지 검사.
 * 작업지시서(2026-09-08-phonetic-kr-work-order.md) §5.4-1: 시드 갱신 전에 이 테스트가 먼저 실패해야 한다(test-first).
 * 보류 5문장(14·26·42·52·94)은 I'll·called 자리만 현행 표기를 유지한 문자열이 gold 다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const STUDY = join(dirname(fileURLToPath(import.meta.url)), '..');
const gold = JSON.parse(readFileSync(join(STUDY, 'docs/core100-gold.json'), 'utf8')).sentences;
const seedDir = join(STUDY, 'seeds');
const cards = readdirSync(seedDir)
  .filter((f) => /^en-core100-.*\.json$/.test(f))
  .flatMap((f) => JSON.parse(readFileSync(join(seedDir, f), 'utf8')).cards.map((c) => ({ ...c, _file: f })));
const byId = new Map(cards.map((c) => [c.id, c]));

describe('코어100 시드 phonetic_kr = 확정 gold', () => {
  it('gold 100문장의 id 가 시드에 정확히 한 번씩 있다', () => {
    expect(gold).toHaveLength(100);
    const missing = gold.filter((g) => !byId.has(g.id)).map((g) => g.id);
    expect(missing).toEqual([]);
    const dup = cards.map((c) => c.id).filter((id, i, a) => a.indexOf(id) !== i);
    expect(dup).toEqual([]);
  });

  it('시드 sentence 가 gold 의 English 와 같다 (표기 대조의 전제)', () => {
    const bad = gold.filter((g) => byId.get(g.id)?.sentence !== g.en).map((g) => `${g.n} ${g.id}`);
    expect(bad).toEqual([]);
  });

  it('시드 phonetic_kr 가 gold 기본형과 같다', () => {
    const bad = gold
      .filter((g) => byId.get(g.id)?.phonetic_kr !== g.phonetic_kr)
      .map((g) => `${g.n}. ${g.id}\n    시드: ${byId.get(g.id)?.phonetic_kr}\n    gold: ${g.phonetic_kr}`);
    expect(bad, `gold 와 다른 시드 ${bad.length}장:\n${bad.join('\n')}`).toEqual([]);
  });
});
