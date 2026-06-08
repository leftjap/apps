/**
 * scenePage — RealClass-mining 모델: 세션 첫 페이지 = 전체 다이얼로그.
 *
 * explanation.dialogue ([{speaker, en, ko}]) 를 통으로 제시(줄마다 듣기),
 * '시작하기'(onNext) 로 문장별 카드로 진입. (사용자 지시: 전체 다이얼로그 먼저 → 문장별 페이지)
 *
 * onListen(en) — 줄 듣기 (세션 페이지가 studySpeech.speak 연결)
 * onNext()     — 시작하기 → 다음(첫 문장 카드)
 */
export function buildScenePage(ex, { onListen, onNext } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'scene-page';

  const title = document.createElement('div');
  title.className = 'scene-page-title';
  title.textContent = (ex && ex.sceneTitle) || '오늘의 장면';
  wrap.appendChild(title);

  if (ex && ex.sceneSummary) {
    const sum = document.createElement('div');
    sum.className = 'scene-page-summary';
    sum.textContent = ex.sceneSummary;
    wrap.appendChild(sum);
  }

  const lines = ex && Array.isArray(ex.dialogue) ? ex.dialogue : [];
  lines.forEach((line) => {
    if (!line || typeof line !== 'object') return;
    const row = document.createElement('div');
    row.className = 'scene-line';
    const spk = document.createElement('div');
    spk.className = 'scene-line-spk';
    spk.textContent = line.speaker || '';
    const en = document.createElement('div');
    en.className = 'scene-line-en';
    en.textContent = line.en || '';
    const ko = document.createElement('div');
    ko.className = 'scene-line-ko';
    ko.textContent = line.ko || '';
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'scene-line-listen';
    play.textContent = '듣기';
    play.addEventListener('click', () => { if (onListen) onListen(line.en || ''); });
    row.append(spk, en, ko, play);
    wrap.appendChild(row);
  });

  const start = document.createElement('button');
  start.type = 'button';
  start.className = 'scene-start-btn';
  start.textContent = '시작하기';
  start.addEventListener('click', () => { if (onNext) onNext(); });
  wrap.appendChild(start);

  return wrap;
}
