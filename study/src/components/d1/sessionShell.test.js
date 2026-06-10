// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { buildD1DrillRows, buildD1ExplainRight } from './sessionShell.js';

describe('buildD1DrillRows — 변주 행 (D1)', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('kr 음차 줄 렌더 (RealClass 발음 가이드)', () => {
    const rows = buildD1DrillRows([
      { en: "Let's make it happen.", ko: '한번 되게 만들어 보자.', kr: '렛츠 메이킷 해픈.' },
    ], [], 'en');
    rows.forEach((r) => document.body.appendChild(r));
    const kr = document.querySelector('.d1-drill .d1-drill-kr');
    expect(kr).toBeTruthy();
    expect(kr.textContent).toBe('렛츠 메이킷 해픈.');
  });

  it('kr 없음: 음차 줄 미생성 (구 시드 호환)', () => {
    const rows = buildD1DrillRows([{ en: 'Fire away.', ko: '얼마든지요.' }], [], 'en');
    rows.forEach((r) => document.body.appendChild(r));
    expect(document.querySelector('.d1-drill .d1-drill-kr')).toBeNull();
  });
});

describe('buildD1ExplainRight — 우측 해설 (D1, phone 패널과 섹션 parity)', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  const ex = {
    key: 'make X happen = X가 실현되게 만들다.',
    situation: '장면 · 브레인스토밍',
    grammar: [{ struct: 'make + 목적어 + happen', body: '~을 되게 만들다.' }],
    chunks: [['make this park', '메익 디스 파크'], ['happen', '해픈']],
    phonemes: [['/ə/', 'happen']],
    mistake: 'happen 뒤 to부정사 X.',
    similar: 'pull it off',
  };

  function labelsOf(el) {
    return [...el.querySelectorAll('.d1-panel-lab')].map((n) => n.textContent);
  }

  it('grammar → "문법 뜯어보기" 섹션 (struct + body)', () => {
    const el = buildD1ExplainRight(ex, 'en');
    document.body.appendChild(el);
    expect(labelsOf(el)).toContain('문법 뜯어보기');
    expect(el.textContent).toContain('make + 목적어 + happen');
    expect(el.textContent).toContain('~을 되게 만들다.');
  });

  it('chunks → "발음 — 청크 단위" 섹션 (en + kr 음차)', () => {
    const el = buildD1ExplainRight(ex, 'en');
    document.body.appendChild(el);
    expect(labelsOf(el)).toContain('발음 — 청크 단위');
    expect(el.textContent).toContain('메익 디스 파크');
  });

  it('phonemes → "주의 음소" 섹션 (ipa + 단어)', () => {
    const el = buildD1ExplainRight(ex, 'en');
    document.body.appendChild(el);
    expect(labelsOf(el)).toContain('주의 음소');
    expect(el.textContent).toContain('/ə/');
  });

  it('3필드 없음: 해당 섹션 hidden (구 시드 호환)', () => {
    const el = buildD1ExplainRight({ key: 'x', mistake: 'y' }, 'en');
    document.body.appendChild(el);
    const labels = labelsOf(el);
    expect(labels).not.toContain('문법 뜯어보기');
    expect(labels).not.toContain('발음 — 청크 단위');
    expect(labels).not.toContain('주의 음소');
  });
});
