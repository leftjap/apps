// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { recordErrorMessage, showRecordToast } from './recordToast.js';

describe('recordErrorMessage', () => {
  it('permission_denied → 권한 안내', () => {
    expect(recordErrorMessage('permission_denied')).toContain('마이크 권한');
  });
  it('no_match → 재발화 안내', () => {
    expect(recordErrorMessage('no_match')).toContain('다시 말해');
  });
  it('azure_init_fail → 네트워크 안내', () => {
    expect(recordErrorMessage('azure_init_fail')).toContain('네트워크');
  });
  it('azure_recognize_fail → 네트워크 안내', () => {
    expect(recordErrorMessage('azure_recognize_fail')).toContain('네트워크');
  });
  it('알 수 없는 reason → 일반 오류 안내', () => {
    expect(recordErrorMessage('record_fail')).toContain('오류');
    expect(recordErrorMessage('unavailable')).toContain('오류');
    expect(recordErrorMessage(undefined)).toContain('오류');
  });
});

describe('showRecordToast', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('body 에 토스트 추가, 메시지·role 설정', () => {
    showRecordToast('테스트 메시지');
    const t = document.body.querySelector('.record-toast');
    expect(t).toBeTruthy();
    expect(t.textContent).toBe('테스트 메시지');
    expect(t.getAttribute('role')).toBe('status');
    expect(t.getAttribute('aria-live')).toBe('polite');
  });

  it('ms 경과 후 제거', () => {
    showRecordToast('곧 사라짐', 1000);
    expect(document.body.querySelector('.record-toast')).toBeTruthy();
    vi.advanceTimersByTime(1000);
    expect(document.body.querySelector('.record-toast')).toBeFalsy();
  });

  it('연속 호출 시 직전 토스트 즉시 교체', () => {
    showRecordToast('첫 번째', 5000);
    showRecordToast('두 번째', 5000);
    const all = document.body.querySelectorAll('.record-toast');
    expect(all.length).toBe(1);
    expect(all[0].textContent).toBe('두 번째');
  });
});
