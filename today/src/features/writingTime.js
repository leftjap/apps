/**
 * 글쓰기 시간 — DOM 이벤트 → writingClock 규칙 → Dexie 저장, 그리고 작가 눈금 띠·팝오버.
 *
 *  - 글 화면: #mainView article.doc 가 있고 읽기 전용이 아니며 가계부·매핑 화면이 아닐 때.
 *  - 창이 앞에 있는지: visibilitychange + window blur/focus (Mac 에서 다른 앱으로 가면
 *    visibilitychange 가 뜨지 않는다). pagehide·숨김 시 바로 저장.
 *  - 쌓인 시간은 1분마다 Dexie 에 저장(Queries.addWritingSeconds) → 기존 동기화 경로로 업로드.
 *  - 띠·팝오버 숫자는 사이드바 캘린더 집계(SidebarCal.getDayData)를 그대로 쓴다.
 */
import { Queries } from '../db/queries.js';
import {
  createClock, onInput, setWriting, setFront, advance, drain, restore, formatDuration,
} from './writingClock.js';
import { SCALE_MAX, fmtSheets, scaleLabel, writerProgress } from './writerScale.js';
import { charsToSheets } from './entries.js';
import { SidebarCal, localDayKey } from './sidebarCal.js';

const DEVICE_KEY = 'todayWritingDeviceId';
const COUNTED_UNTIL_KEY = 'todayWritingCountedUntil'; // 같은 기기 탭들이 함께 쓰는 「여기까지 셌다」 시각
const SAVE_EVERY_MS = 60 * 1000;
const INPUT_EVENTS = ['keydown', 'pointerdown', 'wheel', 'scroll', 'touchstart'];
const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];

let _user = null;
let _clock = createClock();
let _deviceId = null;
let _db = null; // mount 때의 사용자 DB — 계정 전환 중 다른 DB 에 쓰지 않게
let _countedUntil = -Infinity; // localStorage 를 못 쓸 때 대신
let _writing = false;
let _installed = false;

// ───────────────────────────────────────────────────────────────────────────
// 순수 로직
// ───────────────────────────────────────────────────────────────────────────

/** 띠 문구 — 「오늘 6.2매 · 42분 · 헤밍웨이 · 성석제까지 1.8매」. */
export function stripText(sheets, seconds) {
  return `오늘 ${fmtSheets(sheets)}매 · ${formatDuration(seconds)} · ${scaleLabel(sheets)}`;
}

export function isWritingView(doc = document) {
  const cls = doc.body?.classList;
  if (!cls || cls.contains('is-expense') || cls.contains('is-admin')) return false;
  const art = doc.querySelector('#mainView article.doc');
  return !!art && art.dataset.readOnly !== '1';
}

function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch (_) {
    return _deviceId || crypto.randomUUID(); // 저장소를 못 쓰면 이 세션 동안만 같은 값
  }
}

/**
 * 쌓인 시간을 저장. 쌓은 계정(clock.userId)과 저장 시점 계정이 다르면 버리고,
 * 쓰기에 실패하면 아직 못 쓴 만큼을 시계에 되돌린 뒤 에러를 다시 던진다.
 */
export async function saveClock(clock, userId, add) {
  const rows = drain(clock);
  if (!rows.length || !userId || clock.userId !== userId) return;
  for (let i = 0; i < rows.length; i++) {
    try {
      await add(rows[i]);
    } catch (e) {
      restore(clock, rows.slice(i));
      throw e;
    }
  }
}

function readCountedUntil() {
  try {
    const v = Number(localStorage.getItem(COUNTED_UNTIL_KEY));
    return v > 0 ? Math.max(v, _countedUntil) : _countedUntil;
  } catch (_) {
    return _countedUntil;
  }
}

/** 시계 함수 호출 — 기기 공용 countedUntil 을 넘기고, 올라간 값을 다시 적는다. */
function step(fn, ...args) {
  const before = readCountedUntil();
  const after = fn(_clock, ...args, before);
  if (after > before) {
    _countedUntil = after;
    try { localStorage.setItem(COUNTED_UNTIL_KEY, String(after)); } catch (_) { /* 메모리 값으로 대신 */ }
  }
}

function dayStat(date, agg, secs) {
  const key = localDayKey(date);
  const sheets = charsToSheets(agg.get(key)?.chars || 0);
  return { date, sheets, seconds: secs.get(key) || 0, writer: writerProgress(sheets).reached?.name || '' };
}

function signed(n, fmt) {
  if (n === 0) return fmt(0);
  return `${n > 0 ? '+' : '−'}${fmt(Math.abs(n))}`;
}

// ───────────────────────────────────────────────────────────────────────────
// 저장
// ───────────────────────────────────────────────────────────────────────────

async function save() {
  step(advance, Date.now());
  const userId = _db && globalThis.todayDB === _db ? _user?.id : null;
  try {
    await saveClock(_clock, userId, (r) => Queries.addWritingSeconds(userId, _deviceId, r.day, r.seconds));
  } catch (e) {
    console.warn('[writingTime] 저장 실패:', e?.message || e);
    return;
  }
  SidebarCal.refresh?.()?.catch?.(() => {});
}

/** 로그아웃 — DB 가 닫히기 전에 저장하고 시계를 멈춘다 (Auth.registerOnSignOut 으로 main.js 가 등록). */
export async function stopWritingTime() {
  await save();
  _user = null;
  _db = null;
  _clock = createClock();
}

function isFront() {
  return document.visibilityState === 'visible'
    && (typeof document.hasFocus !== 'function' || document.hasFocus());
}

function syncWriting() {
  const on = isWritingView();
  step(setWriting, on, Date.now());
  if (on !== _writing) {
    _writing = on;
    render();
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 띠 · 팝오버
// ───────────────────────────────────────────────────────────────────────────

/** 띠 다시 그리기 — sidebarCal.refresh 끝에서도 불린다 (globalThis.todayWritingTime.render). */
export function render(doc = (typeof document !== 'undefined' ? document : null)) {
  const strip = doc?.getElementById('writeStrip');
  if (!strip) return;
  strip.hidden = !isWritingView(doc);
  if (strip.hidden) return;
  const { agg, secs } = SidebarCal.getDayData();
  const t = dayStat(new Date(), agg, secs);
  const textEl = doc.getElementById('writeStripText');
  // 숫자만 굵게 (달력 합계 줄 표현). 문구는 상수·숫자뿐이라 이스케이프 불필요
  if (textEl) textEl.innerHTML = stripText(t.sheets, t.seconds).replace(/\d+(?:\.\d+)?/g, '<b>$&</b>');
  const fill = doc.getElementById('writeStripFill');
  if (fill) fill.style.width = `${(Math.min(t.sheets, SCALE_MAX) / SCALE_MAX) * 100}%`;
}

function openStats() {
  const { agg, secs } = SidebarCal.getDayData();
  const now = new Date();
  const days = Array.from({ length: 7 }, (_, i) =>
    dayStat(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i), agg, secs));
  const [today, yesterday] = days;
  const row = (title, meta, amt) => `
      <div class="exp-day-row">
        <div class="exp-day-row__body">
          <div class="exp-day-row__merchant">${title}</div>
          <div class="exp-day-row__meta">${meta}</div>
        </div>
        <div class="exp-day-row__amt">${amt}</div>
      </div>`;
  const label = (s, i) => (i === 0 ? '오늘' : i === 1 ? '어제'
    : `${s.date.getMonth() + 1}월 ${s.date.getDate()}일 ${DOW_KO[s.date.getDay()]}`);
  const compare = row(
    '어제와 비교',
    `어제 ${yesterday.writer || '없음'} · 오늘 ${today.writer || '없음'}`,
    `${signed(Math.round((today.sheets - yesterday.sheets) * 10) / 10, fmtSheets)}매 · ${signed((Math.floor(today.seconds / 60) - Math.floor(yesterday.seconds / 60)) * 60, formatDuration)}`,
  );
  SidebarCal.showDayPopover({
    dateHtml: `${now.getMonth() + 1}월 ${now.getDate()}일<span class="dow">${DOW_KO[now.getDay()]}요일</span>`,
    sumHtml: `<b>${fmtSheets(today.sheets)}매</b> · ${formatDuration(today.seconds)}`,
    listHtml: compare + days.map((s, i) =>
      row(label(s, i), s.writer, `${fmtSheets(s.sheets)}매 · ${formatDuration(s.seconds)}`)).join(''),
  });
}

// ───────────────────────────────────────────────────────────────────────────
// 이벤트
// ───────────────────────────────────────────────────────────────────────────

function installHandlers() {
  if (_installed || typeof document === 'undefined') return;
  _installed = true;

  const input = () => step(onInput, Date.now());
  for (const ev of INPUT_EVENTS) document.addEventListener(ev, input, { capture: true, passive: true });

  document.addEventListener('visibilitychange', () => {
    step(setFront, isFront(), Date.now());
    if (document.visibilityState === 'hidden') save();
  });
  window.addEventListener('blur', () => step(setFront, false, Date.now()));
  window.addEventListener('focus', () => step(setFront, document.visibilityState === 'visible', Date.now()));
  window.addEventListener('pagehide', () => {
    step(setFront, false, Date.now());
    save();
  });
  window.addEventListener('pageshow', () => step(setFront, isFront(), Date.now()));
  setInterval(save, SAVE_EVERY_MS);

  // 글 화면 열림·닫힘 — #mainView 는 글을 열 때마다 통째로 바뀐다. 읽기 전용 표시는 article 속성.
  const view = document.getElementById('mainView');
  if (view) {
    new MutationObserver(syncWriting).observe(view, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['data-read-only'],
    });
  }
  new MutationObserver(syncWriting).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  document.getElementById('writeStrip')?.addEventListener('click', openStats);
}

export function mountWritingTime(user) {
  if (!user?.id || typeof document === 'undefined') return;
  _user = user;
  _db = globalThis.todayDB || null;
  _clock = createClock(user.id); // 사용자 전환 시 이전 사용자 시간 섞임 방지
  _deviceId = getDeviceId();
  installHandlers();
  globalThis.todayWritingTime = { render };
  step(setFront, isFront(), Date.now());
  _writing = isWritingView();
  step(setWriting, _writing, Date.now());
  render();
}

export const WritingTime = {
  mountWritingTime,
  stopWritingTime,
  render,
};
