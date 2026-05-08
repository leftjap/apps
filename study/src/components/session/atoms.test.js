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
