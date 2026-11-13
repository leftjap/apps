// 사이드바(PC)와 상단 배지·바닥 시트(모바일). 3D 화면 밖의 글자는 모두 여기서 그린다.
import type { Now } from '../sim/clock.ts';
import type { AreaStatus } from '../sim/provider.ts';
import { PEOPLE_PER_FIGURE } from '../sim/walkers.ts';

export interface Card {
  tag: string;
  title: string;
  color: string;
  lines: string[];
  note: string;
}

const DAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
const LEVEL_COLOR = ['#5fd08a', '#f0cf5a', '#f59b4b', '#f0605d'];
const PRESETS: [string, string][] = [
  ['all', '마포 전체'],
  ['hongdae', '홍대·연트럴파크'],
  ['river', '한강·서강대교'],
];

const people = (n: number) => (n >= 10000 ? `${(n / 10000).toFixed(1)}만 명` : `${(Math.round(n / 100) * 100).toLocaleString('ko-KR')}명`);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function makeHud(opts: { live: boolean; onPreset(name: string): void; onClose(): void }) {
  const app = document.querySelector<HTMLElement>('#app')!;
  const stage = document.querySelector<HTMLElement>('#stage')!;
  const presetButtons = PRESETS.map(([id, label]) => `<button type="button" data-preset="${id}">${label}</button>`).join('');
  const mode = opts.live ? '시뮬레이션' : '시뮬레이션 · 시험 시각';

  stage.insertAdjacentHTML(
    'beforeend',
    `<div id="top">
       <div class="badge"><span class="dot"></span><b data-top-name></b><span data-top-level></span><i><span data-top-time></span> · 시뮬레이션</i></div>
       <div class="chips">${presetButtons}</div>
     </div>
     <p id="credit">© OpenStreetMap contributors</p>
     <div id="card" hidden>
       <button type="button" class="close" aria-label="닫기">×</button>
       <p class="tag" data-card-tag></p>
       <h3 data-card-title></h3>
       <ul data-card-lines></ul>
       <p class="note" data-card-note></p>
     </div>`,
  );
  app.insertAdjacentHTML(
    'beforeend',
    `<aside id="side">
       <div class="scroll">
         <header><h1>마포 라이브 3D</h1><span class="mode">${mode}</span></header>
         <section class="clock"><div class="time" data-time>--:--</div><div class="date" data-date></div></section>
         <section class="presets">${presetButtons}</section>
         <section class="slot" data-card-slot></section>
         <section class="areas"><h2>지금 붐비는 곳</h2><ol data-areas></ol></section>
         <section class="about">
           <p>열차·차·사람은 시간대 패턴으로 움직이는 시뮬레이션이고, 길고양이는 연출입니다. 캐릭터 한 명은 약 ${PEOPLE_PER_FIGURE}명을 대신합니다.</p>
           <p>지도 자료 © OpenStreetMap contributors</p>
         </section>
       </div>
       <div class="ad" aria-hidden="true"><span>광고 자리</span></div>
     </aside>`,
  );

  const q = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
  const card = q('#card');
  // 카드는 PC에서는 사이드바 안에, 모바일에서는 3D 화면 아래쪽 시트로 둔다
  const mq = matchMedia('(max-width: 760px)');
  const dock = () => (mq.matches ? stage : q('[data-card-slot]')).append(card);
  dock();
  mq.addEventListener('change', dock);

  document.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-preset]');
    if (b) opts.onPreset(b.dataset.preset!);
  });
  q('#card .close').addEventListener('click', opts.onClose);

  let cardKey = '';
  let areaKey = '';
  return {
    setClock(now: Now) {
      const h = Math.floor(now.tod / 3600);
      const m = Math.floor((now.tod % 3600) / 60);
      const hhmm = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      q('[data-time]').textContent = hhmm;
      q('[data-top-time]').textContent = hhmm;
      q('[data-date]').textContent = `${DAYS[now.dow]} · ${opts.live ? '한국 시각' : '시험 시각'}`;
    },
    setAreas(areas: AreaStatus[]) {
      const sorted = [...areas].sort((a, b) => b.level - a.level || b.pplMin - a.pplMin).slice(0, 5);
      const key = sorted.map((a) => `${a.id}${a.level}${Math.round(a.pplMin / 500)}`).join();
      if (key === areaKey) return;
      areaKey = key;
      q('[data-areas]').innerHTML = sorted
        .map(
          (a, i) =>
            `<li><span class="rank">${i + 1}</span><span class="name">${esc(a.name)}</span><span class="ppl">약 ${people((a.pplMin + a.pplMax) / 2)}</span><span class="level" style="--c:${LEVEL_COLOR[a.level]}">${a.label}</span></li>`,
        )
        .join('');
      const top = sorted[0];
      q('[data-top-name]').textContent = top.name;
      const lv = q('[data-top-level]');
      lv.textContent = top.label;
      lv.style.setProperty('--c', LEVEL_COLOR[top.level]);
      q('#top .dot').style.setProperty('--c', LEVEL_COLOR[top.level]);
    },
    setCard(c: Card | null) {
      const key = JSON.stringify(c);
      if (key === cardKey) return;
      cardKey = key;
      const opening = card.hidden && !!c;
      card.hidden = !c;
      if (!c) return;
      if (opening) card.scrollIntoView({ block: 'nearest' });
      card.style.setProperty('--c', c.color);
      q('[data-card-tag]').textContent = c.tag;
      q('[data-card-title]').textContent = c.title;
      q('[data-card-lines]').innerHTML = c.lines.map((l) => `<li>${esc(l)}</li>`).join('');
      q('[data-card-note]').textContent = c.note;
    },
  };
}
