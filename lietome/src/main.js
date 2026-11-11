import { SOURCES, EMOTIONS, CASES, DAYS, img } from './cases.js';
import { seoulDateKey, dayIndex, pickDay, pinScore, tier, emojiRow, shareText, updateStreak, formatKoreanDate } from './logic.js';

const STORE_KEY = 'lietome:v3';
const byId = Object.fromEntries(CASES.map((c) => [c.id, c]));
const app = document.getElementById('app');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) ?? {}; } catch { return {}; }
}
function save(data) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch { /* 저장이 막혀도 게임은 계속한다 */ }
}

// 다른 날짜 미리 보기: ?day=YYYY-MM-DD 또는 #day-YYYY-MM-DD
const today = seoulDateKey();
const asked = new URLSearchParams(window.location.search).get('day')
  ?? (window.location.hash.match(/^#day-(\d{4}-\d{2}-\d{2})$/) || [])[1];
const dateKey = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : today;
const isToday = dateKey === today;
const caseIds = pickDay(DAYS, dateKey);
const round = dayIndex(dateKey) + 1;

let data = load();
let st = { i: 0, picks: [], scores: [] };
let view = { key: '', pick: null, told: new Set(), telling: false };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const label = (s) => `${esc(s.name)} <small>${esc(s.role)}</small>`;

// 사진을 미리 불러 두어 바꿀 때 깜빡이지 않게 한다
for (const id of caseIds) for (const s of byId[id].suspects) for (const k of ['ans', 'base']) { const im = new Image(); im.src = img(id, s.key, k); }

function chips() {
  const s = data.streak;
  const streak = s && (s.lastDate === today || dayIndex(today, s.lastDate) === 1) ? s.streak : 0;
  return `<div class="meta"><span class="chip">${formatKoreanDate(dateKey)} · ${round}회</span>`
    + `<span class="chip">연속 <b>${streak}일</b></span><span class="chip">최고 <b>${s?.best ?? 0}일</b></span></div>`;
}

function dots() {
  return `<span class="dots">${caseIds.map((_, k) => `<i class="${k < st.scores.length ? tier(st.scores[k]) : k === st.i ? 'now' : ''}"></i>`).join('')}</span>`;
}

function header(c) {
  return `<header class="bar"><span class="mono">CASE ${pad(st.i + 1)} / ${pad(caseIds.length)}</span><span class="case-title">${esc(c.title)}</span>${dots()}</header>`;
}

// 모니터 위 표시: 핀(빨강), 정답 위치(초록 원), 둘 사이 거리 선
function overlay({ pin, ring }) {
  let s = '<svg class="ov" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">';
  if (pin && ring) s += `<line x1="${pin.x * 100}" y1="${pin.y * 100}" x2="${ring.x * 100}" y2="${ring.y * 100}" class="dist"/>`;
  if (ring) s += `<circle cx="${ring.x * 100}" cy="${ring.y * 100}" r="${ring.r * 100}" class="ring"/>`;
  if (pin) s += `<g class="pin"><circle cx="${pin.x * 100}" cy="${pin.y * 100}" r="3.2"/><path d="M${pin.x * 100 - 6} ${pin.y * 100}h3.4M${pin.x * 100 + 2.6} ${pin.y * 100}h3.4M${pin.x * 100} ${pin.y * 100 - 6}v3.4M${pin.x * 100} ${pin.y * 100 + 2.6}v3.4"/></g>`;
  return `${s}</svg>`;
}

// ---------- 시작 ----------

function renderStart() {
  const c = byId[caseIds[0]];
  const first = c.suspects.find((s) => !s.liar);
  app.innerHTML = `
    <h1 class="brand">라이투미</h1>
    <p class="tagline">셋 다 슬퍼 보인다. 그중 한 명은 꾸민 슬픔이다.</p>
    ${chips()}
    ${isToday ? '' : `<p class="note">${formatKoreanDate(dateKey)} 사건을 미리 보는 중이에요. 연속 기록에는 들어가지 않아요.</p>`}
    <figure class="monitor hero"><img src="${img(c.id, first.key, 'base')}" alt="" width="768" height="768"><span class="tag">REC · 판독 대기</span></figure>
    <ol class="how">
      <li>부장, 대리, 사원의 <b>평소 얼굴</b>을 보고 부고를 전하세요.</li>
      <li>소식을 들은 직후의 얼굴을 평소 얼굴과 비교하세요.</li>
      <li>꾸민 표정이 드러나는 곳을 <b>탭해서 지목</b>하세요. 정확할수록 100점에 가까워요.</li>
    </ol>
    <button class="cta" id="start" type="button">사건 ${caseIds.length}개 판독 시작</button>`;
  app.querySelector('#start').addEventListener('click', () => { st = { i: 0, picks: [], scores: [] }; renderCase(); });
}

// ---------- 사건 ----------

function renderCase() {
  const c = byId[caseIds[st.i]];
  view = { key: c.suspects[0].key, pick: null, told: new Set(), telling: false };
  app.innerHTML = `
    ${header(c)}
    <p class="situation">${esc(c.situation)}</p>
    <div class="suspects" role="tablist" aria-label="소식을 전할 사람">
      ${c.suspects.map((s) => `<button type="button" role="tab" class="suspect" data-key="${s.key}"><img src="${img(c.id, s.key, 'base')}" alt="" width="768" height="768"><span>${label(s)}</span></button>`).join('')}
    </div>
    <figure class="monitor" id="mon">
      <img class="ans" alt="" width="768" height="768"><img class="base" alt="" width="768" height="768" hidden>
      <div class="ovwrap"></div>
      <span class="tag" id="tag"></span>
      <figcaption class="says"></figcaption>
    </figure>
    <div class="row" id="tellrow"><button type="button" class="cta small" id="tell">부고 전하기</button><span class="hint">평소 얼굴을 먼저 보세요</span></div>
    <div class="row" id="holdrow" hidden>
      <button type="button" class="hold" id="hold" aria-pressed="false">누르고 있으면 평소 얼굴</button>
      <span class="hint">꾸민 표정의 단서를 탭</span>
    </div>
    <button class="cta" id="accuse" type="button" disabled>세 사람에게 소식을 전하세요</button>`;
  const mon = app.querySelector('#mon');
  app.querySelectorAll('.suspect').forEach((b) => b.addEventListener('click', () => {
    if (view.telling) return;
    view.key = b.dataset.key;
    paintCase(c);
  }));
  mon.addEventListener('click', (e) => {
    if (!view.told.has(view.key) || view.telling) return;
    const r = mon.getBoundingClientRect();
    view.pick = { key: view.key, x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    paintCase(c);
  });
  app.querySelector('#tell').addEventListener('click', () => tell(c));
  const hold = app.querySelector('#hold');
  const show = (on) => { mon.querySelector('.base').hidden = !on; mon.querySelector('.ans').hidden = on; hold.setAttribute('aria-pressed', String(on)); app.querySelector('#tag').textContent = on ? '평소' : '소식을 들은 직후'; };
  hold.addEventListener('pointerdown', (e) => { e.preventDefault(); show(true); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => hold.addEventListener(ev, () => show(false)));
  hold.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); show(true); } });
  hold.addEventListener('keyup', () => show(false));
  hold.addEventListener('contextmenu', (e) => e.preventDefault());
  app.querySelector('#accuse').addEventListener('click', () => accuse(c));
  paintCase(c);
  window.scrollTo({ top: 0 });
}

// 부고를 전하면 지오의 말이 먼저 나오고, 잠시 뒤 소식을 들은 직후 얼굴로 바뀐다
function tell(c) {
  if (view.telling) return;
  view.telling = true;
  const mon = app.querySelector('#mon');
  mon.querySelector('.says').innerHTML = `<b>지오</b> “${esc(c.news)}”`;
  mon.querySelector('.says').hidden = false;
  app.querySelector('#tell').disabled = true;
  setTimeout(() => {
    view.told.add(view.key);
    view.telling = false;
    paintCase(c);
    if (!reduced) { mon.classList.remove('flash'); void mon.offsetWidth; mon.classList.add('flash'); }
  }, reduced ? 300 : 1300);
}

function paintCase(c) {
  const s = c.suspects.find((x) => x.key === view.key);
  const told = view.told.has(s.key);
  const mon = app.querySelector('#mon');
  const ans = mon.querySelector('.ans');
  ans.src = img(c.id, s.key, told ? 'ans' : 'base');
  ans.hidden = false;
  mon.querySelector('.base').src = img(c.id, s.key, 'base');
  mon.querySelector('.base').hidden = true;
  mon.classList.toggle('waiting', !told);
  app.querySelector('#tag').textContent = told ? '소식을 들은 직후' : '평소';
  mon.querySelector('.says').innerHTML = told ? `<b>${esc(s.name)}</b> “${esc(s.says)}”` : '';
  mon.querySelector('.says').hidden = !told;
  const pin = view.pick && view.pick.key === s.key ? view.pick : null;
  mon.querySelector('.ovwrap').innerHTML = overlay({ pin });
  app.querySelector('#tellrow').hidden = told;
  app.querySelector('#holdrow').hidden = !told;
  app.querySelector('#tell').disabled = false;
  app.querySelectorAll('.suspect').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.key === view.key));
    b.classList.toggle('pinned', !!view.pick && view.pick.key === b.dataset.key);
    b.classList.toggle('told', view.told.has(b.dataset.key));
    b.querySelector('img').src = img(c.id, b.dataset.key, view.told.has(b.dataset.key) ? 'ans' : 'base');
  });
  const btn = app.querySelector('#accuse');
  const allTold = c.suspects.every((x) => view.told.has(x.key));
  if (view.pick) {
    btn.disabled = false;
    btn.textContent = `${c.suspects.find((x) => x.key === view.pick.key).name} 지목하기`;
  } else {
    btn.disabled = true;
    btn.textContent = allTold ? '꾸민 표정의 단서를 탭하세요' : '세 사람에게 소식을 전하세요';
  }
}

function accuse(c) {
  st.picks.push(view.pick);
  st.scores.push(pinScore(c, view.pick));
  renderReveal();
}

// ---------- 해설 ----------

function srcLink(emotion) {
  const e = EMOTIONS[emotion];
  return e.source ? `<a href="${SOURCES[e.source].url}" target="_blank" rel="noopener">${esc(SOURCES[e.source].short)}</a>` : '';
}

function renderReveal() {
  const c = byId[caseIds[st.i]];
  const pick = st.picks[st.i];
  const score = st.scores[st.i];
  const liar = c.suspects.find((s) => s.liar);
  const picked = c.suspects.find((s) => s.key === pick.key);
  const hit = picked === liar;
  const last = st.i === caseIds.length - 1;
  const e = EMOTIONS[liar.emotion];
  const verdict = !hit ? '다른 사람을 지목했어요' : score >= 80 ? '정확히 짚었어요' : '사람은 맞혔어요';
  app.innerHTML = `
    ${header(c)}
    <div class="score"><span class="pts mono ${tier(score)}">${score}</span><span class="of mono">/ 100</span><span class="verdict">${verdict}</span></div>
    <figure class="monitor reveal">
      <img src="${img(c.id, liar.key, 'ans')}" alt="${esc(liar.name)}의 소식을 들은 직후 얼굴" width="768" height="768">
      <div class="ovwrap">${overlay({ pin: hit ? pick : null, ring: liar.tell })}</div>
      <span class="tag">꾸민 슬픔 · ${esc(liar.name)}</span>
    </figure>
    <div class="pair">${['base', 'ans'].map((k) => `<figure><img src="${img(c.id, liar.key, k)}" alt="" width="768" height="768" style="transform-origin: ${liar.tell.x * 100}% ${liar.tell.y * 100}%"><figcaption>${k === 'base' ? '평소' : '소식 직후'} · 확대</figcaption></figure>`).join('')}</div>
    <section class="explain">
      <h2>${label(liar)}</h2>
      <p><span class="k">말</span>“${esc(liar.says)}”</p>
      <p><span class="k">표정</span><b>${esc(e.name)}</b>. ${esc(e.face)}</p>
      <p class="src">${srcLink(liar.emotion)}</p>
    </section>
    ${hit ? '' : `<p class="miss">지목한 ${esc(picked.name)}의 슬픔은 눈썹 안쪽까지 움직인 진짜 슬픔이었어요.</p>`}
    <ul class="others">
      ${c.suspects.filter((s) => !s.liar).map((s) => `<li><img src="${img(c.id, s.key, 'ans')}" alt="" width="768" height="768"><div><b>${esc(s.name)}</b> <small>${esc(s.role)}</small><p><b>${esc(EMOTIONS[s.emotion].name)}</b>. ${esc(EMOTIONS[s.emotion].face)} ${srcLink(s.emotion)}</p></div></li>`).join('')}
    </ul>
    <p class="fine">표정만으로 마음을 단정할 수는 없어요. 이 게임은 라이 투 미처럼 표정의 단서를 따라가요.</p>
    <button class="cta" id="next" type="button">${last ? '결과 보기' : '다음 사건'}</button>`;
  app.querySelector('#next').addEventListener('click', () => { if (last) finish(); else { st.i += 1; renderCase(); } });
  window.scrollTo({ top: 0 });
}

// ---------- 결과 ----------

function finish() {
  data.days = { ...(data.days ?? {}), [dateKey]: { picks: st.picks, scores: st.scores } };
  if (isToday) data.streak = updateStreak(data.streak ?? null, dateKey);
  save(data);
  renderResult();
}

function renderResult() {
  const rec = data.days?.[dateKey] ?? st;
  const total = rec.scores.reduce((a, s) => a + s, 0);
  const text = shareText(dateKey, rec.scores);
  const used = [...new Set(caseIds.flatMap((id) => byId[id].suspects.map((s) => EMOTIONS[s.emotion].source).filter(Boolean)))];
  app.innerHTML = `
    <h1 class="brand">라이투미</h1>
    <p class="tagline">${formatKoreanDate(dateKey)} · ${round}회 판독 결과</p>
    <p class="total mono">${total}<span>/ ${rec.scores.length * 100}</span></p>
    <p class="emoji" aria-label="사건별 점수">${emojiRow(rec.scores)}</p>
    ${chips()}
    <ul class="recap">${caseIds.map((id, k) => `<li><span>${esc(byId[id].title)}</span><span class="mono ${tier(rec.scores[k])}">${rec.scores[k]}점</span></li>`).join('')}</ul>
    <label class="hint" for="share-text">공유 문구</label>
    <textarea id="share-text" class="share-text" readonly>${esc(text)}</textarea>
    <div class="row"><button class="cta small" id="copy" type="button">공유 문구 복사</button><span class="toast" role="status"></span></div>
    <p class="note-plain">내일 새 사건이 열려요.</p>
    <div class="sources"><h2 class="mono">SOURCES</h2>${used.map((s) => `<a href="${SOURCES[s].url}" target="_blank" rel="noopener">${esc(SOURCES[s].title)}</a>`).join('')}</div>
    <button class="linkbtn" id="again" type="button">처음부터 다시 판독</button>`;
  app.querySelector('#copy').addEventListener('click', () => {
    const toast = app.querySelector('.toast');
    const area = app.querySelector('#share-text');
    const fallback = () => { area.focus(); area.select(); toast.textContent = '문구를 선택했어요. 길게 눌러 복사하세요.'; };
    if (!navigator.clipboard) { fallback(); return; }
    navigator.clipboard.writeText(text).then(() => { toast.textContent = '복사했어요'; }, fallback);
  });
  app.querySelector('#again').addEventListener('click', () => { st = { i: 0, picks: [], scores: [] }; renderCase(); });
  window.scrollTo({ top: 0 });
}

// 오늘 이미 풀었으면 결과부터 보여 준다.
if (data.days?.[dateKey]) renderResult();
else renderStart();
