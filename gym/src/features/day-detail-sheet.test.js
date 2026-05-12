import { describe, it, expect } from 'vitest';
import { openDayDetailSheet, closeDayDetailSheet, __test__ } from './day-detail-sheet.js';

const { formatDayLabel } = __test__;

function makeDoc() {
  const make = () => ({
    dataset: {}, style: {}, textContent: '', innerHTML: '',
    addEventListener() {}, getAttribute(n) { return this[n] ?? null; },
  });
  const ids = ['dayDetailSheet','dayDetailBackdrop','dayDetailDate','dayDetailTag','dayDetailMeta','dayDetailExList','dayDetailEmpty','dayDetailConfirm'];
  const els = Object.fromEntries(ids.map((id) => [id, make()]));
  return { getElementById: (id) => els[id] || null, _els: els };
}

describe('formatDayLabel', () => {
  it('정상 ISO → "M월 D일 (요일)"', () => {
    expect(formatDayLabel('2026-05-12')).toMatch(/5월 12일 \(.\)/);
  });
  it('빈/이상 입력 → 빈 문자열', () => {
    expect(formatDayLabel('')).toBe('');
    expect(formatDayLabel('bad')).toBe('');
    expect(formatDayLabel(null)).toBe('');
  });
});

describe('openDayDetailSheet summary', () => {
  it('entry 있음 → date·tag·meta·list 렌더 + empty/confirm 숨김', () => {
    const doc = makeDoc();
    openDayDetailSheet(doc, {
      iso: '2026-05-12',
      entry: { tag: '가슴', vol: 2400, min: 45, pr: '벤치 70', ex: [{ n: '벤치프레스', s: '60×10 · 4세트' }] },
      step: 'summary',
    });
    const e = doc._els;
    expect(e.dayDetailSheet.dataset.open).toBe('true');
    expect(e.dayDetailSheet.dataset.iso).toBe('2026-05-12');
    expect(e.dayDetailSheet.style.transform).toBe('translateY(0)');
    expect(e.dayDetailDate.textContent).toMatch(/5월 12일/);
    expect(e.dayDetailTag.textContent).toBe('가슴');
    expect(e.dayDetailMeta.innerHTML).toContain('볼륨 2400');
    expect(e.dayDetailMeta.innerHTML).toContain('45분');
    expect(e.dayDetailExList.innerHTML).toContain('벤치프레스');
    expect(e.dayDetailEmpty.style.display).toBe('none');
    expect(e.dayDetailConfirm.style.display).toBe('none');
  });
  it('entry null → empty 표시 + meta/list 숨김', () => {
    const doc = makeDoc();
    openDayDetailSheet(doc, { iso: '2026-05-10', entry: null, step: 'summary' });
    expect(doc._els.dayDetailEmpty.style.display).toBe('');
    expect(doc._els.dayDetailMeta.style.display).toBe('none');
    expect(doc._els.dayDetailExList.style.display).toBe('none');
  });
});

describe('openDayDetailSheet confirm', () => {
  it('confirm 영역만 표시 + meta/list/empty 숨김', () => {
    const doc = makeDoc();
    openDayDetailSheet(doc, { iso: '2026-05-12', step: 'confirm' });
    const e = doc._els;
    expect(e.dayDetailSheet.dataset.step).toBe('confirm');
    expect(e.dayDetailConfirm.style.display).toBe('flex');
    expect(e.dayDetailMeta.style.display).toBe('none');
    expect(e.dayDetailExList.style.display).toBe('none');
    expect(e.dayDetailEmpty.style.display).toBe('none');
  });
});

describe('closeDayDetailSheet', () => {
  it('open=false + transform 100% 복원', () => {
    const doc = makeDoc();
    openDayDetailSheet(doc, { iso: '2026-05-12', entry: { tag: '등' }, step: 'summary' });
    closeDayDetailSheet(doc);
    expect(doc._els.dayDetailSheet.dataset.open).toBe('false');
    expect(doc._els.dayDetailSheet.style.transform).toBe('translateY(100%)');
    expect(doc._els.dayDetailBackdrop.dataset.open).toBe('false');
  });
});
