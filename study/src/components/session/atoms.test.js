// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createListenButton } from './atoms.js';

describe('createListenButton', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('click 시 onPlay 콜백 호출', () => {
    const onPlay = vi.fn();
    const { el } = createListenButton({ onPlay });
    document.body.appendChild(el);
    el.click();
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it('onPlay 미전달 시 click 이벤트 미등록 (이전 stub 회귀 방지)', () => {
    const { el } = createListenButton({});
    expect(() => el.click()).not.toThrow();
  });

  it('onPlay 콜백이 인자 없이 호출됨 (호출 측에서 클로저 캡처 패턴)', () => {
    const onPlay = vi.fn();
    const { el } = createListenButton({ onPlay });
    el.click();
    expect(onPlay).toHaveBeenCalledWith(expect.any(Object));
  });
});

describe('A.12 wire-up — speak 호출 인자 (시뮬레이션)', () => {
  it('en 카드: speak(text, {lang:"en-US"}) 호출', () => {
    const speak = vi.fn();
    const sentence = { sentence: 'Hello world', lang: 'en' };
    const onPlay = () => {
      const lang = (sentence?.lang || 'en') === 'ja' ? 'ja-JP' : 'en-US';
      speak(sentence?.sentence || '', { lang });
    };
    const { el } = createListenButton({ onPlay });
    el.click();
    expect(speak).toHaveBeenCalledWith('Hello world', { lang: 'en-US' });
  });

  it('ja 카드: speak(text, {lang:"ja-JP"})', () => {
    const speak = vi.fn();
    const sentence = { sentence: 'こんにちは', lang: 'ja' };
    const onPlay = () => {
      const lang = (sentence?.lang || 'en') === 'ja' ? 'ja-JP' : 'en-US';
      speak(sentence?.sentence || '', { lang });
    };
    const { el } = createListenButton({ onPlay });
    el.click();
    expect(speak).toHaveBeenCalledWith('こんにちは', { lang: 'ja-JP' });
  });

  it('카드 lang 누락 시 storedLang 폴백', () => {
    const speak = vi.fn();
    const sentence = { sentence: 'X', lang: null };
    const storedLang = 'ja';
    const onPlay = () => {
      const lang = (sentence?.lang || storedLang) === 'ja' ? 'ja-JP' : 'en-US';
      speak(sentence?.sentence || '', { lang });
    };
    const { el } = createListenButton({ onPlay });
    el.click();
    expect(speak).toHaveBeenCalledWith('X', { lang: 'ja-JP' });
  });

  it('sentence 빈 객체: speak("", {lang}) — 무음 (speak 내부 가드)', () => {
    const speak = vi.fn();
    const sentence = { sentence: '', lang: null };
    const onPlay = () => {
      const lang = (sentence?.lang || 'en') === 'ja' ? 'ja-JP' : 'en-US';
      speak(sentence?.sentence || '', { lang });
    };
    const { el } = createListenButton({ onPlay });
    el.click();
    expect(speak).toHaveBeenCalledWith('', { lang: 'en-US' });
  });
});

/* 2026-07-22 사용자 보고: 응용연습·체이닝 재생 버튼을 눌러도 아무 피드백이 없고,
 * 메인 재생도 색만 바뀔 뿐 '재생 중'이라는 움직임이 없다.
 * → 재생 중 버튼을 이퀄라이저 아이콘(.v-eq)으로 바꾸고 .playing/.eqq 를 붙여
 *   CSS 애니(v-eq 막대 + v-pulse 링)가 돌게 한다. 종료(onEnd)·선점 시 원상 복구. */
describe('speakWithFeedback — 재생 중 시각 피드백', () => {
  let spoken;
  beforeEach(() => {
    document.body.innerHTML = '';
    spoken = [];
    window.studySpeech = {
      speak: (text, opts) => { spoken.push({ text, opts }); },
      cancel: () => {},
    };
  });
  const mkBtn = () => {
    const b = document.createElement('button');
    const icon = document.createElement('svg');
    icon.dataset.role = 'play-icon';
    b.appendChild(icon);
    document.body.appendChild(b);
    return b;
  };

  it('재생 시작하면 이퀄라이저로 바뀌고 재생 상태 클래스가 붙는다', async () => {
    const { speakWithFeedback } = await import('./atoms.js');
    const b = mkBtn();
    speakWithFeedback(b, 'hello', { lang: 'en-US' });
    expect(b.classList.contains('playing')).toBe(true);
    expect(b.classList.contains('eqq')).toBe(true);
    expect(b.querySelector('.v-eq')).not.toBeNull();
    expect(spoken[0].text).toBe('hello');
    expect(spoken[0].opts.lang).toBe('en-US');
  });

  it('재생이 끝나면(onEnd) 원래 아이콘으로 되돌아온다', async () => {
    const { speakWithFeedback } = await import('./atoms.js');
    const b = mkBtn();
    speakWithFeedback(b, 'hello', {});
    spoken[0].opts.onEnd();
    expect(b.classList.contains('playing')).toBe(false);
    expect(b.querySelector('.v-eq')).toBeNull();
    expect(b.querySelector('[data-role="play-icon"]')).not.toBeNull();
  });

  it('다른 버튼을 재생하면 이전 버튼의 표시가 해제된다 (동시 재생 없음)', async () => {
    const { speakWithFeedback } = await import('./atoms.js');
    const a = mkBtn(); const b = mkBtn();
    speakWithFeedback(a, 'first', {});
    speakWithFeedback(b, 'second', {});
    expect(a.classList.contains('playing')).toBe(false);
    expect(b.classList.contains('playing')).toBe(true);
  });

  /* 같은 버튼 재클릭은 정지가 아니라 '다시 재생' — 짧은 문장 반복 청취가 목적이고,
   * 체이닝은 재생마다 화자·속도를 바꾸는 설계라 반복이 핵심이다(리듬 통째 암기 차단). */
  it('같은 버튼을 다시 누르면 다시 재생한다 (표시는 유지)', async () => {
    const { speakWithFeedback } = await import('./atoms.js');
    const b = mkBtn();
    speakWithFeedback(b, 'hello', {});
    speakWithFeedback(b, 'hello', {});
    expect(spoken).toHaveLength(2);
    expect(b.classList.contains('playing')).toBe(true);
    expect(b.querySelector('.v-eq')).not.toBeNull();
  });

  it('호출자의 onEnd 도 함께 불린다', async () => {
    const { speakWithFeedback } = await import('./atoms.js');
    const b = mkBtn();
    const onEnd = vi.fn();
    speakWithFeedback(b, 'hello', { onEnd });
    spoken[0].opts.onEnd();
    expect(onEnd).toHaveBeenCalled();
  });
});
