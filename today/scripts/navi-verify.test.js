import { describe, it, expect } from 'vitest';
import { parseVerdict, gateDecision, buildFixText } from './navi-verify.mjs';

describe('parseVerdict — 텍스트/파일 내용에서 마지막 JSON 추출(보수적)', () => {
  it('설명 뒤 마지막 줄 JSON 을 파싱', () => {
    const t = '검증함...\n{"ok": false, "problems": ["x"], "fix": "y"}';
    expect(parseVerdict(t)).toEqual({ ok: false, problems: ['x'], fix: 'y' });
  });
  it('ok=true 정상', () => {
    expect(parseVerdict('{"ok": true, "problems": [], "fix": ""}')).toEqual({ ok: true, problems: [], fix: '' });
  });
  it('빈 문자열 → 보수적 ok=false', () => {
    expect(parseVerdict('').ok).toBe(false);
  });
  it('malformed JSON → 보수적 ok=false', () => {
    expect(parseVerdict('{ok:false').ok).toBe(false);
  });
  it('ok 누락 → false 로 취급', () => {
    expect(parseVerdict('{"problems":[]}').ok).toBe(false);
  });
});

const tone = (ok) => ({ ok, problems: ok ? [] : ['톤 약함'] });
describe('gateDecision — fact 만 차단, tone 권고', () => {
  it('fact 통과 → submit', () => {
    expect(gateDecision({ fact: { ok: true }, tone: tone(true) }, { revisesLeft: 2 }).action).toBe('submit');
  });
  it('fact 통과 + tone 실패 → submit(비차단)', () => {
    expect(gateDecision({ fact: { ok: true }, tone: tone(false) }, { revisesLeft: 2 }).action).toBe('submit');
  });
  it('fact 실패 + 잔여>0 → revise + feedback 에 problems', () => {
    const d = gateDecision({ fact: { ok: false, problems: ['p'] }, tone: tone(true) }, { revisesLeft: 2 });
    expect(d.action).toBe('revise');
    expect(d.feedback).toContain('p');
  });
  it('fact 실패 + 잔여0 → hold', () => {
    expect(gateDecision({ fact: { ok: false, problems: ['p'] }, tone: tone(true) }, { revisesLeft: 0 }).action).toBe('hold');
  });
  it('tone 실패는 revise feedback 에 포함', () => {
    const d = gateDecision({ fact: { ok: false, problems: ['f'] }, tone: tone(false) }, { revisesLeft: 1 });
    expect(d.feedback).toEqual(expect.arrayContaining(['f', '톤 약함']));
  });
});

describe('buildFixText', () => {
  it('fact problems + fix 를 재작성 지시 텍스트로', () => {
    const t = buildFixText({ fact: { ok: false, problems: ['Piff 오분류'], fix: '연구명 교체' }, tone: { ok: true } });
    expect(t).toContain('Piff 오분류');
    expect(t).toContain('연구명 교체');
  });
  it('fix 누락 시 기본 지시 포함', () => {
    const t = buildFixText({ fact: { ok: false, problems: ['p'], fix: '' }, tone: { ok: true } });
    expect(t).toContain('교정');
  });
});
