// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { showWordSheet } from './wordSheet.js';

describe('showWordSheet', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('단어 + 음소 점수 매칭 시 평균·약점 음소 표시', () => {
    showWordSheet({
      word: 'should',
      phonemeScores: [
        { symbol: 'sh', word: 'should', score: 80 },
        { symbol: 'uh', word: 'should', score: 60 },
        { symbol: 'd',  word: 'should', score: 30 },
      ],
    });
    const overlay = document.querySelector('[data-word-sheet="1"]');
    expect(overlay).toBeTruthy();
    const title = overlay.querySelector('[data-role="word-title"]');
    const sub = overlay.querySelector('[data-role="word-sub"]');
    expect(title.textContent).toBe('"should"');
    // 평균 = floor((80+60+30)/3) = 56
    // 약점 (score<70): uh, d
    expect(sub.textContent).toContain('평균 56 / 100');
    expect(sub.textContent).toContain('약점 음소');
    expect(sub.textContent).toContain('uh');
    expect(sub.textContent).toContain('d');
  });

  it('약점 0개 시 약점 표기 안 함', () => {
    showWordSheet({
      word: 'You',
      phonemeScores: [
        { symbol: 'y',  word: 'You', score: 100 },
        { symbol: 'uh', word: 'You', score: 90 },
      ],
    });
    const sub = document.querySelector('[data-role="word-sub"]');
    expect(sub.textContent).toBe('평균 95 / 100');
  });

  it('phonemeScores 매칭 0건 시 fallback 메시지', () => {
    showWordSheet({ word: 'unknown', phonemeScores: [] });
    const sub = document.querySelector('[data-role="word-sub"]');
    expect(sub.textContent).toBe('음소 점수 없음');
  });

  it('단어 끝 구두점 제거 후 매칭', () => {
    showWordSheet({
      word: 'known.',
      phonemeScores: [{ symbol: 'n', word: 'known', score: 50 }],
    });
    const title = document.querySelector('[data-role="word-title"]');
    expect(title.textContent).toBe('"known"');
  });

  it('단어 대소문자 무시 매칭', () => {
    showWordSheet({
      word: 'You',
      phonemeScores: [{ symbol: 'y', word: 'you', score: 80 }],
    });
    const sub = document.querySelector('[data-role="word-sub"]');
    expect(sub.textContent).toBe('평균 80 / 100');
  });

  it('닫기 버튼 → overlay 제거 + onClose 호출', () => {
    const onClose = vi.fn();
    showWordSheet({ word: 'x', phonemeScores: [], onClose });
    document.querySelector('[data-action="close"]').click();
    expect(document.querySelector('[data-word-sheet="1"]')).toBeNull();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('overlay backdrop 클릭 → 닫힘', () => {
    const onClose = vi.fn();
    showWordSheet({ word: 'x', phonemeScores: [], onClose });
    const overlay = document.querySelector('[data-word-sheet="1"]');
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    // overlay 자체 클릭 시 (e.target === overlay) close
    // dispatchEvent 의 target 이 overlay 인지 확인
    expect(document.querySelector('[data-word-sheet="1"]')).toBeNull();
  });

  it('중복 진입 차단 (멱등)', () => {
    showWordSheet({ word: 'a', phonemeScores: [] });
    showWordSheet({ word: 'b', phonemeScores: [] });
    expect(document.querySelectorAll('[data-word-sheet="1"]').length).toBe(1);
    const title = document.querySelector('[data-role="word-title"]');
    expect(title.textContent).toBe('"a"'); // 첫 호출만 살아있음
  });
});
