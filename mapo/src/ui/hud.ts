// 사이드바(PC)와 상단 배지·바닥 시트(모바일). 3D 화면 밖의 글자와 조작 버튼은 모두 여기서 그린다.
import type { Now } from '../sim/clock.ts';
import type { AreaStatus } from '../sim/provider.ts';
import { PEOPLE_PER_FIGURE } from '../sim/walkers.ts';

export type CardLine = string | { dot: string; text: string };

export interface Card {
  tag: string;
  title: string;
  color: string;
  lines: CardLine[];
  note: string;
  /** 따라가기 버튼: undefined 면 없음 */
  follow?: boolean;
}

export type Weather = 'clear' | 'rain' | 'fog';
export type Layer = 'cats' | 'people' | 'cars' | 'subway' | 'names';
export type SeasonPick = 'live' | 'blossom' | 'green' | 'autumn' | 'winter';

const DAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
const LEVEL_COLOR = ['#5fd08a', '#f0cf5a', '#f59b4b', '#f0605d'];
const PRESETS: [string, string][] = [
  ['all', '마포 전체'],
  ['hongdae', '홍대·연트럴파크'],
  ['river', '한강·서강대교'],
];
const TIME_PRESETS: [string, string][] = [
  ['live', '실시간'],
  ['morning', '아침'],
  ['noon', '낮'],
  ['sunset', '노을'],
  ['night', '밤'],
];
const WEATHERS: [Weather, string][] = [
  ['clear', '맑음'],
  ['rain', '비'],
  ['fog', '안개'],
];
const LAYERS: [Layer, string][] = [
  ['cats', '고양이'],
  ['people', '사람'],
  ['cars', '차량'],
  ['subway', '지하철'],
  ['names', '지명'],
];
const SEASONS: [SeasonPick, string][] = [
  ['live', '실시간'],
  ['blossom', '봄 벚꽃'],
  ['green', '여름'],
  ['autumn', '가을 단풍'],
  ['winter', '겨울'],
];

const people = (n: number) => (n >= 10000 ? `${(n / 10000).toFixed(1)}만 명` : `${(Math.round(n / 100) * 100).toLocaleString('ko-KR')}명`);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
export const hhmm = (tod: number) => `${String(Math.floor(tod / 3600) % 24).padStart(2, '0')}:${String(Math.floor((tod % 3600) / 60)).padStart(2, '0')}`;

export interface HudEvents {
  onPreset(name: string): void;
  onClose(): void;
  onFollow(): void;
  onDrone(): void;
  onSound(): void;
  /** 시각을 정한다(초). null 이면 실시간으로 돌아간다 */
  onTime(tod: number | null): void;
  onTimePreset(name: string): void;
  onWeather(w: Weather): void;
  onLayer(layer: Layer, on: boolean): void;
  onSeason(s: SeasonPick): void;
  onRandomCat(): void;
}

export function makeHud(ev: HudEvents) {
  const app = document.querySelector<HTMLElement>('#app')!;
  const stage = document.querySelector<HTMLElement>('#stage')!;
  const presetButtons = PRESETS.map(([id, label]) => `<button type="button" data-preset="${id}">${label}</button>`).join('');
  const tourButtons = `<button type="button" data-drone>드론 산책</button><button type="button" data-sound>소리 켜기</button>`;

  stage.insertAdjacentHTML(
    'beforeend',
    `<div id="top">
       <div class="badge"><span class="dot"></span><b data-top-name></b><span data-top-level></span><i><span data-top-time></span> · 시뮬레이션</i></div>
       <div class="chips"><button type="button" data-lab-toggle>설정</button>${tourButtons}${presetButtons}</div>
     </div>
     <p id="credit">© OpenStreetMap contributors · 일부 건물 Overture Maps, Shi 외(2023)</p>
     <div id="card" hidden>
       <button type="button" class="close" aria-label="닫기">×</button>
       <p class="tag" data-card-tag></p>
       <h3 data-card-title></h3>
       <ul data-card-lines></ul>
       <button type="button" class="follow" data-follow hidden>따라가기</button>
       <p class="note" data-card-note></p>
     </div>
     <details id="lab">
       <summary>관람 &amp; 테스트 설정</summary>
       <div class="lab-body">
         <div class="lab-time">
           <label for="lab-range">시각</label><output data-range-out>--:--</output>
           <input id="lab-range" type="range" min="0" max="1439" step="1" data-range>
         </div>
         <div class="seg" role="group" aria-label="시간대">${TIME_PRESETS.map(([id, l]) => `<button type="button" data-tp="${id}">${l}</button>`).join('')}</div>
         <div class="seg" role="group" aria-label="날씨">${WEATHERS.map(([id, l]) => `<button type="button" data-weather="${id}">${l}</button>`).join('')}</div>
         <div class="seg" role="group" aria-label="계절">${SEASONS.map(([id, l]) => `<button type="button" data-season="${id}">${l}</button>`).join('')}</div>
         <div class="toggles">${LAYERS.map(([id, l]) => `<label><input type="checkbox" data-layer="${id}" checked>${l}</label>`).join('')}</div>
         <button type="button" class="find-cat" data-random-cat>길냥이 랜덤 찾기</button>
       </div>
     </details>`,
  );
  app.insertAdjacentHTML(
    'beforeend',
    `<aside id="side">
       <div class="scroll">
         <header><h1>마포 라이브 3D</h1><span class="mode" data-mode>시뮬레이션</span></header>
         <section class="slot" data-lab-slot></section>
         <section class="clock"><div class="time" data-time>--:--</div><div class="date" data-date></div></section>
         <section class="presets">${presetButtons}${tourButtons}</section>
         <section class="slot" data-card-slot></section>
         <section class="areas"><h2>지금 붐비는 곳</h2><ol data-areas></ol></section>
         <section class="about">
           <p>열차·버스·차·사람은 시간대 패턴으로 움직이는 시뮬레이션이고, 길고양이는 연출입니다. 캐릭터 한 명은 약 ${PEOPLE_PER_FIGURE}명을 대신합니다. 버스 노선과 정류장은 OpenStreetMap 자료이고, 버스 위치와 배차는 실제와 다릅니다.</p>
           <p>지도 자료 © OpenStreetMap contributors. 일부 건물 © Overture Maps Foundation, Qian Shi 외(2023) CC BY 4.0.</p>
         </section>
       </div>
       <div class="ad" aria-hidden="true"><span>광고 자리</span></div>
     </aside>`,
  );

  const q = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
  const qa = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
  const card = q('#card');
  const lab = q<HTMLDetailsElement>('#lab');
  const scroll = q('#side .scroll');
  // 카드와 설정은 PC에서는 사이드바 안에, 모바일에서는 3D 화면 위 시트로 둔다
  const mq = matchMedia('(max-width: 760px)');
  const dock = () => {
    (mq.matches ? stage : q('[data-card-slot]')).append(card);
    (mq.matches ? stage : q('[data-lab-slot]')).append(lab);
    lab.hidden = mq.matches;
    if (mq.matches) lab.open = true;
  };
  dock();
  mq.addEventListener('change', dock);

  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const b = t.closest<HTMLElement>('button');
    if (!b) return;
    if (b.dataset.preset) ev.onPreset(b.dataset.preset);
    else if (b.hasAttribute('data-drone')) ev.onDrone();
    else if (b.hasAttribute('data-sound')) ev.onSound();
    else if (b.hasAttribute('data-follow')) ev.onFollow();
    else if (b.dataset.tp) ev.onTimePreset(b.dataset.tp);
    else if (b.dataset.weather) ev.onWeather(b.dataset.weather as Weather);
    else if (b.dataset.season) ev.onSeason(b.dataset.season as SeasonPick);
    else if (b.hasAttribute('data-random-cat')) ev.onRandomCat();
    else if (b.hasAttribute('data-lab-toggle')) {
      lab.hidden = !lab.hidden;
      if (!lab.hidden) card.hidden = true;
    }
  });
  q('#card .close').addEventListener('click', ev.onClose);
  const range = q<HTMLInputElement>('[data-range]');
  range.addEventListener('input', () => ev.onTime(Number(range.value) * 60));
  for (const box of qa('[data-layer]') as HTMLInputElement[]) box.addEventListener('change', () => ev.onLayer(box.dataset.layer as Layer, box.checked));

  let cardKey = '';
  let areaKey = '';
  let live = true;
  return {
    setClock(now: Now, isLive: boolean) {
      live = isLive;
      const t = hhmm(now.tod);
      q('[data-time]').textContent = t;
      q('[data-top-time]').textContent = t;
      q('[data-date]').textContent = `${DAYS[now.dow]} · ${live ? '한국 시각' : '시험 시각'}`;
      q('[data-mode]').textContent = live ? '시뮬레이션' : '시뮬레이션 · 시험 시각';
      q('[data-range-out]').textContent = t;
      if (document.activeElement !== range) range.value = String(Math.floor(now.tod / 60));
      for (const b of qa('[data-tp]')) b.classList.toggle('on', b.dataset.tp === 'live' && live);
    },
    setSeason(s: SeasonPick) {
      for (const b of qa('[data-season]')) b.classList.toggle('on', b.dataset.season === s);
    },
    setWeather(w: Weather) {
      for (const b of qa('[data-weather]')) b.classList.toggle('on', b.dataset.weather === w);
    },
    setDrone(on: boolean) {
      for (const b of qa('[data-drone]')) (b.classList.toggle('on', on), (b.textContent = on ? '드론 산책 중' : '드론 산책'));
    },
    setSound(on: boolean) {
      for (const b of qa('[data-sound]')) (b.classList.toggle('on', on), (b.textContent = on ? '소리 끄기' : '소리 켜기'));
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
      if (mq.matches) lab.hidden = true;
      card.style.setProperty('--c', c.color);
      q('[data-card-tag]').textContent = c.tag;
      q('[data-card-title]').textContent = c.title;
      q('[data-card-lines]').innerHTML = c.lines
        .map((l) => (typeof l === 'string' ? `<li>${esc(l)}</li>` : `<li class="row"><i style="--d:${l.dot}"></i>${esc(l.text)}</li>`))
        .join('');
      q('[data-card-note]').textContent = c.note;
      const f = q('[data-follow]');
      f.hidden = c.follow === undefined;
      f.textContent = c.follow ? '따라가기 멈추기' : '따라가기';
      f.classList.toggle('on', !!c.follow);
      // 카드가 열리면 사이드바를 카드가 보이는 데까지 내린다
      if (opening && !mq.matches) scroll.scrollTo({ top: Math.max(0, card.offsetTop - 12), behavior: 'smooth' });
    },
  };
}
