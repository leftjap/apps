// taste 가져오기 — 왓챠 CSV 업로드 → 파싱 미리보기 → 저장(create/update dedup). 디자인 외 유틸.
import { el, clear } from '../ui/dom.js';
import { parseWatchaCsv } from '../lib/watcha.js';
import { Queries } from '../db/queries.js';
import { onViewTeardown } from '../app.js';

export function mount({ userId } = {}) {
  const root = el('div', { class: 'import' });
  let cancelled = false;
  onViewTeardown(() => { cancelled = true; });   // 저장 중 라우트 이탈 — 잔여 행 중단 (재실행 멱등)
  root.append(
    el('h1', { class: 'detail__title', style: 'font-size:clamp(24px,3vw,34px);margin:0 0 8px' }, '평가 가져오기'),
    el('p', { class: 'detail__sub', style: 'margin:0 0 24px' }, '왓챠피디아 CSV를 올리면 영화 별점을 가져옵니다. (MOVIE만, TV 제외)'));

  const fileInput = el('input', { type: 'file', accept: '.csv,text/csv' });
  const previewBox = el('div', { style: 'margin-top:20px' });
  const actions = el('div', { style: 'margin-top:20px;display:flex;gap:12px;align-items:center;flex-wrap:wrap' });
  root.append(fileInput, previewBox, actions);

  let parsed = [];
  fileInput.addEventListener('change', () => {
    const f = fileInput.files && fileInput.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { try { parsed = parseWatchaCsv(String(reader.result)); } catch (e) { parsed = []; } renderPreview(); };
    reader.readAsText(f);
  });

  function renderPreview() {
    clear(previewBox); clear(actions);
    if (!parsed.length) { previewBox.appendChild(el('p', { style: 'color:var(--ink-3)' }, '가져올 영화 평점이 없습니다. (CSV 헤더·형식 확인)')); return; }
    previewBox.append(
      el('p', {}, el('b', {}, `${parsed.length}편`), document.createTextNode('의 영화 평점을 찾았습니다. 미리보기:')),
      el('div', { style: 'margin-top:10px;display:flex;flex-direction:column;gap:5px' },
        ...parsed.slice(0, 5).map((r) => el('div', { style: 'font-size:13px;color:var(--ink-2)' },
          `${r.title} (${r.year || '?'}) · ${r.rating <= 0.5 ? '비추 0.5' : '★ ' + r.rating.toFixed(1)}`))));
    const saveBtn = el('button', { class: 'btn', onClick: () => save(saveBtn) }, `${parsed.length}편 저장`);
    actions.appendChild(saveBtn);
  }

  async function save(btn) {
    if (!userId || !parsed.length) return;
    btn.disabled = true;
    const status = el('span', { style: 'color:var(--ink-3);font-size:13px' }, '저장 중…');
    actions.appendChild(status);
    const { created, updated } = await saveRows(userId, parsed, (done, total) => { status.textContent = `저장 중… ${done}/${total}`; }, () => cancelled);
    status.textContent = `완료 — 신규 ${created} · 갱신 ${updated}.`;
    actions.appendChild(el('a', { class: 'btn btn--sm', href: '#/library' }, '내 서재 보기'));
  }

  return root;
}

// 저장 로직 — UI 분리 (테스트 대상). 멱등: 같은 CSV 재실행 시 create 0 · update N.
// getRatingAny 로 soft-deleted 행 부활 재사용 — 신규 create 는 서버 unique 와 23505 충돌 (sync.js reconcileDup 주석).
// isCancelled: 라우트 이탈(teardown) 시 잔여 행 중단 — 각 행은 원자적이고 재실행이 멱등이라 중단 안전.
export async function saveRows(userId, parsed, onProgress, isCancelled) {
  let done = 0, created = 0, updated = 0;
  for (const r of parsed) {
    if (isCancelled && isCancelled()) break;
    try {
      const ex = await Queries.getRatingAny(userId, 'movie', r.title, r.year);
      if (ex) { await Queries.updateRating(ex.id, { rating: r.rating, rated_at: r.rated_at, source: 'watcha', deleted_at: null }); updated++; }
      else { await Queries.createRating({ owner_id: userId, media_type: 'movie', title: r.title, year: r.year, rating: r.rating, source: 'watcha', rated_at: r.rated_at, meta: {} }); created++; }
    } catch (e) { /* 행 skip */ }
    done++;
    if (onProgress && (done % 10 === 0 || done === parsed.length)) onProgress(done, parsed.length);
  }
  return { created, updated };
}
