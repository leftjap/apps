// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { createExplanationPanel } from './explanationPanel.js';
import enSeed from '../../../seeds/en-2026-05-05.json';
import jaSeed from '../../../seeds/ja-2026-05-05.json';

describe('createExplanationPanel — 실 시드 fixture', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('en seed 카드: schema.md 형식 전 필드 렌더', () => {
    const card = enSeed.cards[0];
    const ex = card.explanation;
    expect(ex).toBeTruthy();
    expect(ex.key).toBeTruthy();

    const { toggleEl, panelEl } = createExplanationPanel({ explanation: ex, lang: 'en' });
    document.body.append(toggleEl, panelEl);

    const labels = [...panelEl.querySelectorAll('.ex-label')].map((n) => n.textContent);
    expect(labels).toContain('핵심 포인트');
    if (ex.situation) expect(labels).toContain('이런 상황에서 써요');
    if (ex.grammar) expect(labels).toContain('문법 뜯어보기');
    if (ex.chunks?.length) expect(labels).toContain('발음 — 청크 단위');
    if (ex.phonemes?.length) expect(labels).toContain('주의 음소');
    if (ex.mistake) expect(labels).toContain('한국인 실수');
    if (ex.similar) expect(labels).toContain('비슷한 표현');

    if (Array.isArray(ex.grammar) && ex.grammar.length > 0) {
      expect(panelEl.querySelectorAll('.grammar-block').length).toBe(ex.grammar.length);
    }
    if (Array.isArray(ex.chunks)) {
      expect(panelEl.querySelectorAll('.chunk').length).toBe(ex.chunks.length);
    }
    if (Array.isArray(ex.phonemes)) {
      expect(panelEl.querySelectorAll('.phoneme-tag').length).toBe(ex.phonemes.length);
    }
  });

  it('ja seed 카드: 4 필드 (whenToUse/grammar/pronPoints/similar) 렌더', () => {
    const card = jaSeed.cards[0];
    const ex = card.explanation;
    expect(ex).toBeTruthy();
    expect(ex.whenToUse).toBeTruthy();
    expect(ex.pronPoints).toBeTruthy();

    const { panelEl } = createExplanationPanel({ explanation: ex, lang: 'ja' });
    const labels = [...panelEl.querySelectorAll('.ex-label')].map((n) => n.textContent);
    expect(labels).toContain('이런 상황에서 써요');
    expect(labels).toContain('문법 뜯어보기');
    expect(labels).toContain('발음 포인트');
    expect(labels).toContain('비슷한 표현');
    expect(labels).not.toContain('핵심 포인트');
    expect(labels).not.toContain('주의 음소');
    expect(labels).not.toContain('발음 — 청크 단위');
  });

  it('explanation null: 패널 비어있고 toggle 안전', () => {
    const { toggleEl, panelEl, toggle } = createExplanationPanel({ explanation: null });
    expect(panelEl.children.length).toBe(0);
    expect(() => toggle()).not.toThrow();
    expect(panelEl.classList.contains('open')).toBe(true);
    expect(toggleEl.getAttribute('aria-expanded')).toBe('true');
  });

  it('toggle 동작: open ↔ close 클래스 + aria-expanded', () => {
    const card = enSeed.cards[0];
    const { toggleEl, panelEl, toggle } = createExplanationPanel({ explanation: card.explanation });
    expect(panelEl.classList.contains('open')).toBe(false);
    expect(toggleEl.getAttribute('aria-expanded')).toBe('false');
    toggle();
    expect(panelEl.classList.contains('open')).toBe(true);
    expect(toggleEl.classList.contains('open')).toBe(true);
    expect(toggleEl.getAttribute('aria-expanded')).toBe('true');
    toggle();
    expect(panelEl.classList.contains('open')).toBe(false);
    expect(toggleEl.getAttribute('aria-expanded')).toBe('false');
  });

  it('button click 시 toggle 자동 호출', () => {
    const { toggleEl, panelEl } = createExplanationPanel({ explanation: enSeed.cards[0].explanation });
    document.body.append(toggleEl, panelEl);
    toggleEl.click();
    expect(panelEl.classList.contains('open')).toBe(true);
    toggleEl.click();
    expect(panelEl.classList.contains('open')).toBe(false);
  });

  it('grammar 단순 문자열 형식 (ja seed): ex-text 로 렌더 (renderExplain 정본 동작)', () => {
    const ex = { grammar: '동사 + ます = 정중체' };
    const { panelEl } = createExplanationPanel({ explanation: ex });
    expect(panelEl.querySelectorAll('.grammar-block').length).toBe(0);
    const labels = [...panelEl.querySelectorAll('.ex-label')].map((n) => n.textContent);
    expect(labels).toContain('문법 뜯어보기');
    const grammarSection = [...panelEl.querySelectorAll('.ex-section')]
      .find((s) => s.querySelector('.ex-label')?.textContent === '문법 뜯어보기');
    expect(grammarSection.querySelector('.ex-text').innerHTML).toBe('동사 + ます = 정중체');
  });

  it('빈 grammar 배열: 섹션 자체 hidden (label-only 방지)', () => {
    const ex = { grammar: [] };
    const { panelEl } = createExplanationPanel({ explanation: ex });
    const labels = [...panelEl.querySelectorAll('.ex-label')].map((n) => n.textContent);
    expect(labels).not.toContain('문법 뜯어보기');
  });
});
