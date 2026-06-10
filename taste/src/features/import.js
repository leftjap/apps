// taste 가져오기 — 왓챠 CSV 업로드 → 파싱 미리보기 → 저장(create/update dedup). 디자인 외 유틸.
import { el, clear } from '../ui/dom.js';
import { parseWatchaCsv } from '../lib/watcha.js';
import { Queries } from '../db/queries.js';

export function mount({ userId } = {}) {
  const root = el('div', { class: 'import' });
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
    let done = 0, created = 0, updated = 0;
    const status = el('span', { style: 'color:var(--ink-3);font-size:13px' }, '저장 중…');
    actions.appendChild(status);
    for (const r of parsed) {
      try {
        const ex = await Queries.getRatingAny(userId, 'movie', r.title, r.year);   // soft-deleted 부활 재사용 (23505 방지)
        if (ex) { await Queries.updateRating(ex.id, { rating: r.rating, rated_at: r.rated_at, source: 'watcha', deleted_at: null }); updated++; }
        else { await Queries.createRating({ owner_id: userId, media_type: 'movie', title: r.title, year: r.year, rating: r.rating, source: 'watcha', rated_at: r.rated_at, meta: {} }); created++; }
      } catch (e) { /* 행 skip */ }
      done++;
      if (done % 10 === 0 || done === parsed.length) status.textContent = `저장 중… ${done}/${parsed.length}`;
    }
    status.textContent = `완료 — 신규 ${created} · 갱신 ${updated}.`;
    actions.appendChild(el('a', { class: 'btn btn--sm', href: '#/library' }, '내 서재 보기'));
  }

  return root;
}
