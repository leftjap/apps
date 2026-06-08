// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildScenePage } from './scenePage.js';

describe('buildScenePage — 다이얼로그 먼저 페이지', () => {
  it('다이얼로그 줄마다 .scene-line + 듣기 버튼, 시작하기 버튼 onNext', () => {
    const listened = [];
    let nexted = 0;
    const ex = {
      sceneTitle: '토론회',
      dialogue: [
        { speaker: 'Leslie', en: 'Fire away.', ko: '얼마든지요.' },
        { speaker: 'Ann', en: 'Hi.', ko: '안녕.' },
      ],
    };
    const el = buildScenePage(ex, { onListen: (t) => listened.push(t), onNext: () => { nexted += 1; } });

    const lines = el.querySelectorAll('.scene-line');
    expect(lines.length).toBe(2);
    expect(lines[0].textContent).toContain('Fire away.');
    expect(lines[0].textContent).toContain('얼마든지요.');

    lines[0].querySelector('.scene-line-listen').click();
    expect(listened).toEqual(['Fire away.']);

    const start = el.querySelector('.scene-start-btn');
    expect(start).toBeTruthy();
    start.click();
    expect(nexted).toBe(1);
  });

  it('dialogue 없으면 .scene-line 0개 (방어)', () => {
    const el = buildScenePage({ sceneTitle: 'x' }, {});
    expect(el.querySelectorAll('.scene-line').length).toBe(0);
    expect(el.querySelector('.scene-start-btn')).toBeTruthy();
  });
});
