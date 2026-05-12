/**
 * Wave 11.8 — admin UI (사용자별 매핑 편집).
 *
 * 대상 DB (0019 마이그레이션):
 *  - today_user_categories         (user_id, id, name, display_order)
 *  - today_user_brand_categories   (user_id, brand, category_id)
 *  - today_user_merchant_aliases   (user_id, merchant_pattern, brand)
 *
 * 흐름:
 *  - mountAdminView(user) — mocks #adminView 컨테이너 wire + 첫 탭 렌더
 *  - 탭 클릭 → renderPickerSection / renderBrandSection / renderAliasSection
 *  - 추가/편집 — acc-modal 트리 재사용 (form input + footer)
 *  - 삭제 — confirmModal (account.js)
 *  - 성공 후 Dexie put/delete + Classifier.invalidateUserCache → 즉시 자동 분류 반영
 *
 * RLS: 0019 의 auth.uid() = user_id 정책 강제. client-side 도 .eq('user_id', ...) 명시.
 */
import { supabase } from '../services/supabase.js';
import Classifier from '../services/expense-classifier.js';
import { confirmModal } from './account.js';

let _currentUser = null;
let _activeTab = 'picker';

const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export async function mountAdminView(user) {
  if (!user?.id) return;
  _currentUser = user;
  if (typeof document === 'undefined') return;
  const root = document.getElementById('adminView');
  if (!root) return;
  wireTabs(root);
  await renderActiveTab(root);
}

function wireTabs(root) {
  if (root.dataset.adminWired === '1') return;
  root.dataset.adminWired = '1';
  // 탭과 추가 버튼은 mocks 의 main__top .top-actions__admin 영역에 위치 — document 검색.
  document.querySelectorAll('[data-admin-tab]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      _activeTab = btn.getAttribute('data-admin-tab') || 'picker';
      document.querySelectorAll('[data-admin-tab]').forEach((b) => {
        b.classList.toggle('admin-tab--active', b === btn);
      });
      await renderActiveTab(root);
    });
  });
  const addBtn = document.querySelector('[data-admin-add]');
  if (addBtn) addBtn.addEventListener('click', () => openAddModal(root));
}

/** Sync.startSync 완료 후 main.js 가 호출 — Dexie 채워진 후 admin view 재렌더. */
export async function refreshActive() {
  if (typeof document === 'undefined') return;
  const root = document.getElementById('adminView');
  if (!root || !_currentUser) return;
  await renderActiveTab(root);
}

async function renderActiveTab(root) {
  const body = root.querySelector('#adminBody');
  if (!body) return;
  body.innerHTML = '<div class="admin-loading">불러오는 중...</div>';
  try {
    if (_activeTab === 'picker') await renderPickerSection(body);
    else if (_activeTab === 'brand') await renderBrandSection(body);
    else if (_activeTab === 'alias') await renderAliasSection(body);
  } catch (e) {
    body.innerHTML = `<div class="admin-error">${escapeHtml(e?.message || '로드 실패')}</div>`;
  }
}

// ─── 공통 form modal (추가/편집 — acc-modal 트리 재사용) ────────────────
function openFormModal({ title, fields, initial = {}, doc = document }) {
  return new Promise((resolve) => {
    const overlay = doc.createElement('div');
    overlay.className = 'acc-modal-overlay';
    overlay.setAttribute('data-admin-form', '1');
    const inputs = fields.map((f) => `
      <label class="admin-field">
        <span class="admin-field-label">${escapeHtml(f.label)}</span>
        <input type="${f.type || 'text'}" name="${f.name}"
               value="${escapeHtml(initial?.[f.name] ?? '')}"
               placeholder="${escapeHtml(f.placeholder || '')}"
               ${f.readonly ? 'readonly' : ''} ${f.required ? 'required' : ''} />
      </label>`).join('');
    overlay.innerHTML = `
      <div class="acc-modal-card" role="dialog" aria-modal="true">
        <div class="acc-modal-header"><span class="acc-modal-title">${escapeHtml(title)}</span></div>
        <div class="acc-modal-body">
          ${inputs}
          <div class="admin-form-error" data-form-error></div>
        </div>
        <div class="acc-modal-footer">
          <button class="acc-btn" type="button" data-cancel>취소</button>
          <button class="acc-btn acc-btn--primary" type="button" data-ok>저장</button>
        </div>
      </div>`;
    doc.body.appendChild(overlay);
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => overlay.classList.add('open'));
    } else overlay.classList.add('open');

    let resolved = false;
    const close = (val) => {
      if (resolved) return;
      resolved = true;
      overlay.classList.remove('open');
      setTimeout(() => overlay.parentNode?.removeChild(overlay), 150);
      doc.removeEventListener('keydown', onKey);
      resolve(val);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) return close(null);
      if (e.target.closest?.('[data-cancel]')) return close(null);
      if (e.target.closest?.('[data-ok]')) {
        const values = {};
        fields.forEach((f) => {
          values[f.name] = overlay.querySelector(`[name="${f.name}"]`)?.value?.trim() ?? '';
        });
        close(values);
      }
    });
    doc.addEventListener('keydown', onKey);
    setTimeout(() => overlay.querySelector('input:not([readonly])')?.focus(), 50);
  });
}

function showFormError(msg) {
  const el = document.querySelector('[data-admin-form] [data-form-error]');
  if (el) el.textContent = msg || '';
}

async function renderPickerSection(body) {
  const db = globalThis.todayDB;
  if (!db?.user_categories) {
    body.innerHTML = '<div class="admin-empty">Dexie 미초기화</div>';
    return;
  }
  const rows = await db.user_categories
    .where('user_id').equals(_currentUser.id).sortBy('display_order');
  if (!rows.length) {
    body.innerHTML = '<div class="admin-empty">카테고리가 없습니다. 우상단 + 버튼으로 추가하세요.</div>';
    return;
  }
  body.innerHTML = `
    <ul class="admin-list">
      ${rows.map((r) => `
        <li class="admin-row" data-row-key="${escapeHtml(r.id)}">
          <span class="admin-row-main">
            <span class="admin-row-id">${escapeHtml(r.id)}</span>
            <span class="admin-row-name">${escapeHtml(r.name)}</span>
          </span>
          <span class="admin-row-meta">#${r.display_order ?? 0}</span>
          <span class="admin-row-actions">
            <button class="admin-row-btn" type="button" data-edit="${escapeHtml(r.id)}">수정</button>
            <button class="admin-row-btn admin-row-btn--danger" type="button" data-delete="${escapeHtml(r.id)}">삭제</button>
          </span>
        </li>`).join('')}
    </ul>`;
  body.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => editPickerRow(b.getAttribute('data-edit'), rows, body)));
  body.querySelectorAll('[data-delete]').forEach((b) => b.addEventListener('click', () => deletePickerRow(b.getAttribute('data-delete'), body)));
}
async function writePickerRow({ id, name, displayOrder }) {
  const payload = {
    user_id: _currentUser.id,
    id, name,
    display_order: displayOrder ?? 0,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from('today_user_categories')
    .upsert(payload, { onConflict: 'user_id,id' });
  if (error) throw new Error(error.message || '저장 실패');
  await globalThis.todayDB.user_categories.put(payload);
  Classifier.invalidateUserCache();
}

async function editPickerRow(id, rows) {
  const row = rows.find((r) => r.id === id);
  if (!row) return;
  const values = await openFormModal({
    title: '카테고리 수정',
    fields: [
      { name: 'id', label: 'ID (영문, 변경 불가)', readonly: true },
      { name: 'name', label: '이름 (한글)', required: true },
      { name: 'display_order', label: '정렬 순서', type: 'number' },
    ],
    initial: { id: row.id, name: row.name, display_order: row.display_order ?? 0 },
  });
  if (!values) return;
  if (!values.name) { showFormError('이름은 필수입니다.'); return; }
  try {
    await writePickerRow({
      id: row.id,
      name: values.name,
      displayOrder: parseInt(values.display_order, 10) || 0,
    });
    await renderActiveTab(document.getElementById('adminView'));
  } catch (e) { showFormError(e?.message || '저장 실패'); }
}

async function deletePickerRow(id) {
  const ok = await confirmModal({
    title: '카테고리 삭제',
    message: `'${id}' 를 삭제합니다. brand 매핑이 이 id 를 참조하면 분류 실패하니 주의하세요.`,
    danger: true, confirmLabel: '삭제',
  });
  if (!ok) return;
  const { error } = await supabase
    .from('today_user_categories')
    .delete()
    .eq('user_id', _currentUser.id).eq('id', id);
  if (error) { console.warn('[admin] picker delete 실패:', error); return; }
  await globalThis.todayDB.user_categories.delete([_currentUser.id, id]);
  Classifier.invalidateUserCache();
  await renderActiveTab(document.getElementById('adminView'));
}

async function renderBrandSection(body) {
  const db = globalThis.todayDB;
  if (!db?.user_brand_categories) {
    body.innerHTML = '<div class="admin-empty">Dexie 미초기화</div>';
    return;
  }
  const rows = await db.user_brand_categories
    .where('user_id').equals(_currentUser.id).toArray();
  rows.sort((a, b) => a.brand.localeCompare(b.brand, 'ko'));
  if (!rows.length) {
    body.innerHTML = '<div class="admin-empty">brand 매핑이 없습니다. 우상단 + 버튼으로 추가하세요.</div>';
    return;
  }
  body.innerHTML = `
    <ul class="admin-list">
      ${rows.map((r) => `
        <li class="admin-row" data-row-key="${escapeHtml(r.brand)}">
          <span class="admin-row-main">
            <span class="admin-row-id">${escapeHtml(r.brand)}</span>
            <span class="admin-row-arrow">→</span>
            <span class="admin-row-name">${escapeHtml(r.category_id)}</span>
          </span>
          <span class="admin-row-actions">
            <button class="admin-row-btn" type="button" data-edit="${escapeHtml(r.brand)}">수정</button>
            <button class="admin-row-btn admin-row-btn--danger" type="button" data-delete="${escapeHtml(r.brand)}">삭제</button>
          </span>
        </li>`).join('')}
    </ul>`;
  body.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => editBrandRow(b.getAttribute('data-edit'), rows)));
  body.querySelectorAll('[data-delete]').forEach((b) => b.addEventListener('click', () => deleteBrandRow(b.getAttribute('data-delete'))));
}
async function writeBrandRow({ brand, categoryId }) {
  const payload = {
    user_id: _currentUser.id, brand, category_id: categoryId,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from('today_user_brand_categories')
    .upsert(payload, { onConflict: 'user_id,brand' });
  if (error) throw new Error(error.message || '저장 실패');
  await globalThis.todayDB.user_brand_categories.put(payload);
  Classifier.invalidateUserCache();
}

async function editBrandRow(brand, rows) {
  const row = rows.find((r) => r.brand === brand);
  if (!row) return;
  const values = await openFormModal({
    title: 'brand → 카테고리 수정',
    fields: [
      { name: 'brand', label: 'Brand (변경 불가)', readonly: true },
      { name: 'category_id', label: 'Category ID (영문)', required: true, placeholder: 'dining / food / online ...' },
    ],
    initial: { brand: row.brand, category_id: row.category_id },
  });
  if (!values) return;
  if (!values.category_id) { showFormError('category id 필수'); return; }
  try {
    await writeBrandRow({ brand: row.brand, categoryId: values.category_id });
    await renderActiveTab(document.getElementById('adminView'));
  } catch (e) { showFormError(e?.message || '저장 실패'); }
}

async function deleteBrandRow(brand) {
  const ok = await confirmModal({
    title: 'brand 매핑 삭제',
    message: `'${brand}' 매핑을 삭제합니다.`,
    danger: true, confirmLabel: '삭제',
  });
  if (!ok) return;
  const { error } = await supabase
    .from('today_user_brand_categories')
    .delete().eq('user_id', _currentUser.id).eq('brand', brand);
  if (error) { console.warn('[admin] brand delete 실패:', error); return; }
  await globalThis.todayDB.user_brand_categories.delete([_currentUser.id, brand]);
  Classifier.invalidateUserCache();
  await renderActiveTab(document.getElementById('adminView'));
}

async function renderAliasSection(body) {
  const db = globalThis.todayDB;
  if (!db?.user_merchant_aliases) {
    body.innerHTML = '<div class="admin-empty">Dexie 미초기화</div>';
    return;
  }
  const rows = await db.user_merchant_aliases
    .where('user_id').equals(_currentUser.id).toArray();
  rows.sort((a, b) => a.merchant_pattern.localeCompare(b.merchant_pattern, 'ko'));
  if (!rows.length) {
    body.innerHTML = '<div class="admin-empty">매장 alias 가 없습니다. 우상단 + 버튼으로 추가하세요.</div>';
    return;
  }
  body.innerHTML = `
    <ul class="admin-list">
      ${rows.map((r) => `
        <li class="admin-row" data-row-key="${escapeHtml(r.merchant_pattern)}">
          <span class="admin-row-main">
            <span class="admin-row-id">${escapeHtml(r.merchant_pattern)}</span>
            <span class="admin-row-arrow">→</span>
            <span class="admin-row-name">${escapeHtml(r.brand)}</span>
          </span>
          <span class="admin-row-actions">
            <button class="admin-row-btn" type="button" data-edit="${escapeHtml(r.merchant_pattern)}">수정</button>
            <button class="admin-row-btn admin-row-btn--danger" type="button" data-delete="${escapeHtml(r.merchant_pattern)}">삭제</button>
          </span>
        </li>`).join('')}
    </ul>`;
  body.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => editAliasRow(b.getAttribute('data-edit'), rows)));
  body.querySelectorAll('[data-delete]').forEach((b) => b.addEventListener('click', () => deleteAliasRow(b.getAttribute('data-delete'))));
}
async function writeAliasRow({ merchantPattern, brand }) {
  const payload = {
    user_id: _currentUser.id, merchant_pattern: merchantPattern, brand,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from('today_user_merchant_aliases')
    .upsert(payload, { onConflict: 'user_id,merchant_pattern' });
  if (error) throw new Error(error.message || '저장 실패');
  await globalThis.todayDB.user_merchant_aliases.put(payload);
  Classifier.invalidateUserCache();
}

async function editAliasRow(pattern, rows) {
  const row = rows.find((r) => r.merchant_pattern === pattern);
  if (!row) return;
  const values = await openFormModal({
    title: '매장 alias 수정',
    fields: [
      { name: 'merchant_pattern', label: '매장명 (변경 불가)', readonly: true },
      { name: 'brand', label: '브랜드명', required: true, placeholder: '쿠팡 / CU / 신촌세브란스병원 ...' },
    ],
    initial: { merchant_pattern: row.merchant_pattern, brand: row.brand },
  });
  if (!values) return;
  if (!values.brand) { showFormError('브랜드명 필수'); return; }
  try {
    await writeAliasRow({ merchantPattern: row.merchant_pattern, brand: values.brand });
    await renderActiveTab(document.getElementById('adminView'));
  } catch (e) { showFormError(e?.message || '저장 실패'); }
}

async function deleteAliasRow(pattern) {
  const ok = await confirmModal({
    title: '매장 alias 삭제',
    message: `'${pattern}' alias 를 삭제합니다.`,
    danger: true, confirmLabel: '삭제',
  });
  if (!ok) return;
  const { error } = await supabase
    .from('today_user_merchant_aliases')
    .delete().eq('user_id', _currentUser.id).eq('merchant_pattern', pattern);
  if (error) { console.warn('[admin] alias delete 실패:', error); return; }
  await globalThis.todayDB.user_merchant_aliases.delete([_currentUser.id, pattern]);
  Classifier.invalidateUserCache();
  await renderActiveTab(document.getElementById('adminView'));
}

async function openAddModal(root) {
  if (_activeTab === 'picker') {
    const values = await openFormModal({
      title: '카테고리 추가',
      fields: [
        { name: 'id', label: 'ID (영문, 고유)', required: true, placeholder: 'dining / food / online ...' },
        { name: 'name', label: '이름 (한글)', required: true },
        { name: 'display_order', label: '정렬 순서', type: 'number' },
      ],
    });
    if (!values) return;
    if (!values.id || !values.name) { showFormError('id 와 이름은 필수입니다.'); return; }
    try {
      await writePickerRow({
        id: values.id, name: values.name,
        displayOrder: parseInt(values.display_order, 10) || 0,
      });
      await renderActiveTab(root);
    } catch (e) { showFormError(e?.message || '저장 실패'); }
  } else if (_activeTab === 'brand') {
    const values = await openFormModal({
      title: 'brand → 카테고리 추가',
      fields: [
        { name: 'brand', label: 'Brand', required: true, placeholder: '쿠팡 / CU / 신라호텔 ...' },
        { name: 'category_id', label: 'Category ID (영문)', required: true, placeholder: 'dining / online ...' },
      ],
    });
    if (!values) return;
    if (!values.brand || !values.category_id) { showFormError('brand 와 category id 필수'); return; }
    try {
      await writeBrandRow({ brand: values.brand, categoryId: values.category_id });
      await renderActiveTab(root);
    } catch (e) { showFormError(e?.message || '저장 실패'); }
  } else if (_activeTab === 'alias') {
    const values = await openFormModal({
      title: '매장 alias 추가',
      fields: [
        { name: 'merchant_pattern', label: '매장명 (정제 후 패턴)', required: true, placeholder: '연세대학교 / 컬리페이_컬리 ...' },
        { name: 'brand', label: '브랜드명', required: true, placeholder: '신촌세브란스병원 / 컬리 ...' },
      ],
    });
    if (!values) return;
    if (!values.merchant_pattern || !values.brand) { showFormError('매장명·브랜드명 필수'); return; }
    try {
      await writeAliasRow({ merchantPattern: values.merchant_pattern, brand: values.brand });
      await renderActiveTab(root);
    } catch (e) { showFormError(e?.message || '저장 실패'); }
  }
}

export const Admin = { mountAdminView, refreshActive };

if (typeof window !== 'undefined') window.todayAdmin = Admin;

export default Admin;
