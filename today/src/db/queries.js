/**
 * Today entries 쿼리 레이어 (Wave 11.5.1 — Gym Wave 11.7 패턴 답습).
 *
 * 책임:
 *  - entries CRUD (list / get / create / update / softDelete / restore / togglePin)
 *  - 사용자별 DB 인스턴스 동적 조회 (`window.todayDB`)
 *  - mocks IIFE 접근용 `window.todayQueries` 노출
 *
 * 비대상 (별 sub-wave):
 *  - Supabase 동기화 (Wave 11.5.3)
 *  - Realtime 구독 (Wave 11.5.4)
 *  - 오프라인 큐 + flush (Wave 11.5.5)
 */

const ENTRY_KINDS = Object.freeze([
  'navi', 'fiction', 'blog', 'memo',
  'soyoun_navi', 'flight_diary', 'soyoun_blog',
]);

function db() {
  // globalThis 우선 — vitest(node) 와 브라우저(window) 모두 호환.
  const inst = globalThis.todayDB || null;
  if (!inst) {
    throw new Error('[todayQueries] globalThis.todayDB 미초기화 — 인증 후 ensureUserDB 가 호출되어야 함.');
  }
  return inst;
}

/** Supabase 업로드 큐 등록 (sync.js 의 queueUpload 동적 lookup — 순환 참조 회피). */
function enqueueSync(id) {
  const sync = globalThis.todaySync;
  if (sync && typeof sync.queueUpload === 'function') {
    sync.queueUpload(id);
  }
}

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // fallback (Node <14.17, 단 vitest+node 18 환경에선 사용 안 됨)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ───────────────────────────────────────────────────────────────────────────
// list / get
// ───────────────────────────────────────────────────────────────────────────

/**
 * kind 필터 + deleted_at null + updated_at desc.
 * opts.includeDeleted = true 면 휴지통 항목 포함.
 */
export async function listEntries(kind, opts = {}) {
  if (!ENTRY_KINDS.includes(kind)) {
    throw new Error(`[todayQueries] unknown kind: ${kind}`);
  }
  const rows = await db().entries
    .where('[kind+updated_at]')
    .between([kind, ''], [kind, '￿'], true, true)
    .reverse()
    .toArray();
  if (opts.includeDeleted) return rows;
  return rows.filter((r) => !r.deleted_at);
}

/** id 로 단일 엔트리 조회 */
export async function getEntry(id) {
  return await db().entries.get(id);
}

/** (owner_id, kind, kind_number) 복합키로 단일 엔트리 조회 — deep link `#/navi/79` 라우팅용. */
export async function getEntryByKindNumber(ownerId, kind, kindNumber) {
  if (!ownerId || !kind || kindNumber == null) return null;
  const num = parseInt(kindNumber, 10);
  if (!Number.isFinite(num)) return null;
  return await db().entries
    .where('[owner_id+kind+kind_number]')
    .equals([ownerId, kind, num])
    .first();
}

/** is_shared = true entries (피드 화면용) — Wave 11.7 본격 사용 */
export async function listSharedEntries() {
  const rows = await db().entries.where('is_shared').equals(1).toArray();
  return rows
    .filter((r) => !r.deleted_at)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

/**
 * Wave 11.7.3a — 네비 탭 '우리 글' 뷰 데이터 레이어.
 * spec §4 L127-131: "kind='navi' OR kind='soyoun_navi' + is_shared=true 양쪽 합집합 시간순".
 * deleted_at null 필터 + updated_at desc 정렬.
 */
const SHARED_NAVI_KINDS = Object.freeze(['navi', 'soyoun_navi']);
export async function listSharedNaviEntries() {
  const rows = await db().entries.where('is_shared').equals(1).toArray();
  return rows
    .filter((r) => !r.deleted_at && SHARED_NAVI_KINDS.includes(r.kind))
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

/**
 * Wave 11.5.7 — Spotlight 검색용 통합 entries 검색.
 * 본인 모든 kind (navi/fiction/blog/memo) + partner shared navi (soyoun_navi + is_shared=1).
 * deleted_at 제외. title / content 부분 일치 (case-insensitive). updated_at desc.
 *
 * @param {string} q 검색어 (빈/null → 전체 매치, 정렬만 적용)
 * @param {{partnerOnly?: boolean}} opts partnerOnly=true → soyoun_navi(shared) 만
 */
const OWN_ENTRY_KINDS = Object.freeze(new Set(['navi', 'fiction', 'blog', 'memo']));
const PARTNER_SHARED_KINDS = Object.freeze(new Set(['soyoun_navi']));

export async function searchEntries(q, opts = {}) {
  const all = await db().entries.toArray();
  const q_l = (q == null ? '' : String(q)).trim().toLowerCase();
  const partnerOnly = opts.partnerOnly === true;
  const matched = all.filter((r) => {
    if (r.deleted_at) return false;
    const isOwn = OWN_ENTRY_KINDS.has(r.kind);
    const isPartnerShared = PARTNER_SHARED_KINDS.has(r.kind) && r.is_shared === 1;
    if (partnerOnly) {
      if (!isPartnerShared) return false;
    } else if (!isOwn && !isPartnerShared) {
      return false;
    }
    if (!q_l) return true;
    return (
      (r.title || '').toLowerCase().includes(q_l) ||
      (r.content || '').toLowerCase().includes(q_l)
    );
  });
  return matched.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

/**
 * Wave 11.5.7 — Spotlight 검색용 expenses 검색.
 * deleted_at 제외. merchant / memo / category 부분 일치. spent_at desc.
 */
export async function searchExpenses(q) {
  const all = await db().expenses.toArray();
  const q_l = (q == null ? '' : String(q)).trim().toLowerCase();
  const matched = all.filter((r) => {
    if (r.deleted_at) return false;
    if (!q_l) return true;
    return (
      (r.merchant || '').toLowerCase().includes(q_l) ||
      (r.memo || '').toLowerCase().includes(q_l) ||
      (r.category || '').toLowerCase().includes(q_l)
    );
  });
  return matched.sort((a, b) => (b.spent_at || '').localeCompare(a.spent_at || ''));
}

// ───────────────────────────────────────────────────────────────────────────
// 쓰기 (create / update / softDelete / restore / togglePin)
// ───────────────────────────────────────────────────────────────────────────

/**
 * 신규 entry. id 자동 생성, owner_id 필수.
 * 호출자는 kind, owner_id 를 반드시 지정.
 * Wave 11.5.3.2 — 생성 후 Supabase 업로드 큐에 등록 (800ms debounce).
 */
export async function createEntry(input) {
  if (!input?.owner_id) throw new Error('[todayQueries] owner_id 누락');
  if (!ENTRY_KINDS.includes(input.kind)) {
    throw new Error(`[todayQueries] unknown kind: ${input.kind}`);
  }
  const ts = nowIso();
  // 사용자 결정 (2026-05-04): navi/soyoun_navi 는 공유가 default. input 미지정 시 1, 명시 시 그 값.
  const sharedDefault = input.kind === 'navi' || input.kind === 'soyoun_navi' ? 1 : 0;
  // owner_id + kind 별 max(kind_number) + 1 부여 (deep link 영구 안정).
  // Dexie 로컬 + 동시 작성 race condition 은 사용 패턴(1일 1편)상 실 발생 거의 없음.
  // 만약 race 발생 시 Supabase 단일 INSERT 가 마지막에 처리되어 한쪽이 max+1, 다른쪽이 max+1 (충돌 가능).
  // 향후 server side trigger 로 강제할 수 있음 — 본 wave 범위 외.
  let kind_number = input.kind_number;
  if (kind_number == null) {
    const peers = await db().entries
      .where('[owner_id+kind+kind_number]')
      .between([input.owner_id, input.kind, 0], [input.owner_id, input.kind, Infinity])
      .toArray();
    const maxNum = peers.reduce((m, r) => Math.max(m, r.kind_number || 0), 0);
    kind_number = maxNum + 1;
  }
  const row = {
    id: input.id || newId(),
    owner_id: input.owner_id,
    kind: input.kind,
    kind_number,
    title: input.title ?? null,
    content: input.content ?? null,
    meta: input.meta ?? {},
    is_shared: 'is_shared' in input ? (input.is_shared ? 1 : 0) : sharedDefault,
    pinned: input.pinned ? 1 : 0,
    created_at: input.created_at || ts,
    updated_at: input.updated_at || ts,
    deleted_at: input.deleted_at || null,
  };
  await db().entries.add(row);
  enqueueSync(row.id);
  return row;
}

/**
 * 부분 업데이트. id + patch 필드.
 * updated_at 자동 갱신 (호출자가 명시 시 그대로).
 * Wave 11.5.3.2 — 업데이트 후 Supabase 업로드 큐에 등록.
 */
export async function updateEntry(id, patch) {
  const existing = await db().entries.get(id);
  if (!existing) throw new Error(`[todayQueries] entry not found: ${id}`);
  const next = {
    ...existing,
    ...patch,
    updated_at: patch?.updated_at || nowIso(),
  };
  // boolean 필드는 0/1 정규화
  if (patch && 'is_shared' in patch) next.is_shared = patch.is_shared ? 1 : 0;
  if (patch && 'pinned' in patch) next.pinned = patch.pinned ? 1 : 0;
  await db().entries.put(next);
  enqueueSync(id);
  return next;
}

/** soft delete — deleted_at 마킹 */
export async function softDeleteEntry(id) {
  return await updateEntry(id, { deleted_at: nowIso() });
}

/** 휴지통에서 복원 */
export async function restoreEntry(id) {
  return await updateEntry(id, { deleted_at: null });
}

/** pinned 토글 */
export async function togglePin(id) {
  const existing = await db().entries.get(id);
  if (!existing) throw new Error(`[todayQueries] entry not found: ${id}`);
  return await updateEntry(id, { pinned: existing.pinned ? 0 : 1 });
}

/** 카테고리별 글 수 (deleted_at null 만) — 사이드바 카운트 표시용 */
export async function countEntriesByKind(kind) {
  const rows = await listEntries(kind);
  return rows.length;
}

/**
 * Wave 11.5.9 — 휴지통 (deleted_at not null entries 전체).
 * 모든 kind 합집합. updated_at desc.
 * spec §6 line 70 — 30일 soft delete (자동 purge 는 별 wave Edge Function).
 */
export async function listDeletedEntries() {
  const all = await db().entries.toArray();
  return all
    .filter((r) => !!r.deleted_at)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

// ───────────────────────────────────────────────────────────────────────────
// 오프라인 큐 (Wave 11.5.5) — pending_sync 플래그 헬퍼
// ───────────────────────────────────────────────────────────────────────────

/** pending_sync = 1 인 entries 전부 (오프라인 → online 복귀 시 flush 대상). */
export async function listPendingEntries() {
  return await db().entries.where('pending_sync').equals(1).toArray();
}

/** pending_sync 플래그 직접 설정 (sync.js 가 호출). */
export async function setPendingSync(id, value) {
  const flag = value ? 1 : 0;
  const existing = await db().entries.get(id);
  if (!existing) return null;
  // updated_at 은 의도적으로 갱신 안 함 (sync 메타 변경은 기록상 변경 아님)
  await db().entries.put({ ...existing, pending_sync: flag });
  return flag;
}

// ═══════════════════════════════════════════════════════════════════════════
// expenses CRUD (Wave 11.6.1)
// spec §6 line 196-219 / §13 line 469-499
// ═══════════════════════════════════════════════════════════════════════════

const EXPENSE_SOURCES = Object.freeze(['sms', 'manual', 'import']);

/**
 * 신규 expense.
 * 필수: owner_id, spent_at(ISO), amount_krw, source.
 */
export async function createExpense(input) {
  if (!input?.owner_id) throw new Error('[todayQueries] expense owner_id 누락');
  if (!input?.spent_at) throw new Error('[todayQueries] expense spent_at 누락');
  if (typeof input.amount_krw !== 'number') throw new Error('[todayQueries] expense amount_krw 누락 또는 비숫자');
  if (!EXPENSE_SOURCES.includes(input.source)) {
    throw new Error(`[todayQueries] expense unknown source: ${input.source}`);
  }
  const ts = nowIso();
  const row = {
    id: input.id || newId(),
    owner_id: input.owner_id,
    spent_at: input.spent_at,
    amount_krw: input.amount_krw,
    foreign_amount: input.foreign_amount ?? null,
    currency: input.currency ?? null,
    merchant_raw: input.merchant_raw ?? null,
    merchant: input.merchant ?? null,
    brand: input.brand ?? null,
    category: input.category ?? null,
    card: input.card ?? null,
    memo: input.memo ?? null,
    merchant_url: input.merchant_url ?? null,
    source: input.source,
    sms_raw: input.sms_raw ?? null,
    received_at: input.received_at ?? null,
    meta: input.meta ?? {},
    created_at: input.created_at || ts,
    updated_at: input.updated_at || ts,
    deleted_at: input.deleted_at || null,
    pending_sync: 0,
  };
  await db().expenses.add(row);
  enqueueExpenseSync(row.id);
  return row;
}

export async function getExpense(id) {
  return await db().expenses.get(id);
}

export async function updateExpense(id, patch) {
  const existing = await db().expenses.get(id);
  if (!existing) throw new Error(`[todayQueries] expense not found: ${id}`);
  const next = {
    ...existing,
    ...patch,
    updated_at: patch?.updated_at || nowIso(),
  };
  await db().expenses.put(next);
  enqueueExpenseSync(id);
  return next;
}

export async function softDeleteExpense(id) {
  return await updateExpense(id, { deleted_at: nowIso() });
}

export async function restoreExpense(id) {
  return await updateExpense(id, { deleted_at: null });
}

/** [fromISO, toISO] 범위 내 expenses (deleted 제외, spent_at desc). */
export async function listExpensesByRange(fromISO, toISO) {
  const rows = await db().expenses
    .where('spent_at')
    .between(fromISO, toISO, true, true)
    .toArray();
  return rows
    .filter((r) => !r.deleted_at)
    .sort((a, b) => (b.spent_at || '').localeCompare(a.spent_at || ''));
}

/** 월 단위 listByRange (year, monthOneBased). */
export async function listExpensesByMonth(year, monthOneBased) {
  const m = String(monthOneBased).padStart(2, '0');
  const lastDay = new Date(year, monthOneBased, 0).getDate();
  const from = `${year}-${m}-01T00:00:00.000Z`;
  const to = `${year}-${m}-${String(lastDay).padStart(2, '0')}T23:59:59.999Z`;
  return await listExpensesByRange(from, to);
}

/** 일 단위 listByRange (isoDate='YYYY-MM-DD'). 일자 시트 popover 용. */
export async function listExpensesByDate(isoDate) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return [];
  const from = `${isoDate}T00:00:00.000Z`;
  const to = `${isoDate}T23:59:59.999Z`;
  return await listExpensesByRange(from, to);
}

/** 카테고리별 합계 (월 단위). 사이드바·통계 화면용. */
export async function sumExpensesByCategoryMonth(year, monthOneBased) {
  const rows = await listExpensesByMonth(year, monthOneBased);
  const totals = new Map();
  for (const r of rows) {
    const key = r.category || '미분류';
    totals.set(key, (totals.get(key) || 0) + (r.amount_krw || 0));
  }
  return [...totals.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/** 월 단위 총액 (deleted 제외). */
export async function sumExpensesMonth(year, monthOneBased) {
  const rows = await listExpensesByMonth(year, monthOneBased);
  return rows.reduce((sum, r) => sum + (r.amount_krw || 0), 0);
}

/** SMS 중복 검사용 — sms_raw + spent_at 동일 row 존재 여부. */
export async function findExpenseBySmsRaw(ownerId, smsRaw, spentAt) {
  if (!smsRaw) return null;
  const rows = await db().expenses
    .where('owner_id').equals(ownerId)
    .filter((r) => r.sms_raw === smsRaw && r.spent_at === spentAt)
    .toArray();
  return rows[0] || null;
}

function enqueueExpenseSync(id) {
  const sync = globalThis.todaySync;
  if (sync && typeof sync.queueUploadExpense === 'function') {
    sync.queueUploadExpense(id);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// merchant_rules CRUD + auto-match (Wave 11.6.4a)
// spec §6 line 221-232 / §10 SMS 파이프라인 — 클라이언트 매칭 헬퍼
// ═══════════════════════════════════════════════════════════════════════════

const RULE_SCOPES = Object.freeze(['global', 'user']);

/**
 * 룰 추가 (보통 user scope — global 은 마이그레이션 SQL 로 일괄 입력).
 * pattern 은 단순 substring 매치 (대소문자 무관) — 향후 정규식 지원 가능.
 */
export async function createMerchantRule(input) {
  if (!RULE_SCOPES.includes(input?.scope)) {
    throw new Error(`[todayQueries] unknown rule scope: ${input?.scope}`);
  }
  if (input.scope === 'user' && !input.user_id) {
    throw new Error('[todayQueries] user scope rule 은 user_id 필수');
  }
  if (input.scope === 'global' && input.user_id) {
    throw new Error('[todayQueries] global rule 은 user_id null 이어야 함');
  }
  if (!input.pattern) throw new Error('[todayQueries] rule pattern 필수');
  const ts = nowIso();
  const row = {
    id: input.id || newId(),
    user_id: input.user_id ?? null,
    scope: input.scope,
    pattern: input.pattern,
    brand: input.brand ?? null,
    category: input.category ?? null,
    priority: typeof input.priority === 'number' ? input.priority : 0,
    updated_at: input.updated_at || ts,
    pending_sync: 0,
  };
  await db().merchant_rules.add(row);
  return row;
}

/** 모든 룰 (global + 본인 user). priority desc 정렬. */
export async function listMerchantRules(userId) {
  const all = await db().merchant_rules.toArray();
  return all
    .filter((r) => r.scope === 'global' || (r.scope === 'user' && r.user_id === userId))
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));
}

/**
 * 사용자가 가맹점 카테고리 수동 분류 시 user-scope 룰 upsert.
 * 동일 (user_id, pattern) 의 user 룰 있으면 brand/category 만 갱신,
 * 없으면 새 row INSERT (priority=100 — global 보다 우선).
 *
 * @param {string} pattern   매칭 패턴 (보통 merchant 또는 merchant_raw)
 * @param {{brand?:string|null, category:string}} values
 * @param {string} userId
 * @returns {Promise<object>} upsert 결과 row
 */
export async function upsertUserMerchantRule(pattern, values, userId) {
  if (!pattern || !userId) throw new Error('[todayQueries] pattern + userId 필수');
  const trimmed = String(pattern).trim();
  if (!trimmed) throw new Error('[todayQueries] pattern 비어있음');
  const existing = await db().merchant_rules
    .where({ scope: 'user', user_id: userId })
    .toArray();
  const hit = existing.find((r) => r.pattern === trimmed);
  const ts = nowIso();
  if (hit) {
    const patch = {
      brand: values.brand !== undefined ? values.brand : hit.brand,
      category: values.category !== undefined ? values.category : hit.category,
      updated_at: ts,
      pending_sync: 1,
    };
    await db().merchant_rules.update(hit.id, patch);
    return { ...hit, ...patch };
  }
  return await createMerchantRule({
    scope: 'user',
    user_id: userId,
    pattern: trimmed,
    brand: values.brand ?? null,
    category: values.category ?? null,
    priority: 100,
  });
}

/**
 * merchant_raw 문자열 → matching rule 1건 (가장 priority 높은).
 * 단순 substring + lowercase 비교. 정규식 지원은 향후.
 */
export async function autoMatchMerchantRule(merchantRaw, userId) {
  if (!merchantRaw) return null;
  const needle = String(merchantRaw).trim().toLowerCase();
  if (!needle) return null;
  const rules = await listMerchantRules(userId);
  for (const r of rules) {
    if (!r.pattern) continue;
    if (needle.includes(String(r.pattern).toLowerCase())) {
      return r;
    }
  }
  return null;
}

/**
 * createExpense 의 편의 wrapper — merchant_raw 로 자동 매칭 후 brand/category 채우기.
 * 매칭된 룰이 있으면 해당 brand/category 로 채움. 사용자 입력이 우선.
 */
export async function createExpenseWithAutoMatch(input) {
  const owner = input?.owner_id;
  if (input?.merchant_raw && (!input.category || !input.brand) && owner) {
    const rule = await autoMatchMerchantRule(input.merchant_raw, owner);
    if (rule) {
      input = {
        ...input,
        brand: input.brand ?? rule.brand ?? null,
        category: input.category ?? rule.category ?? null,
      };
    }
  }
  return await createExpense(input);
}

// ═══════════════════════════════════════════════════════════════════════════
// comments CRUD (Wave 11.7.1) — spec §6 line 234-244 / §12 line 447-465
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 신규 댓글. is_shared=true entry 에만 작성 가능 (RLS 가 강제 — 클라이언트 측은 단순 insert).
 */
export async function createComment(input) {
  if (!input?.entry_id) throw new Error('[todayQueries] comment entry_id 누락');
  if (!input?.author_id) throw new Error('[todayQueries] comment author_id 누락');
  if (!input?.body) throw new Error('[todayQueries] comment body 누락');
  const ts = nowIso();
  const row = {
    id: input.id || newId(),
    entry_id: input.entry_id,
    author_id: input.author_id,
    body: input.body,
    created_at: input.created_at || ts,
    updated_at: input.updated_at || ts,
    deleted_at: input.deleted_at || null,
    pending_sync: 0,
  };
  await db().comments.add(row);
  enqueueCommentSync(row.id);
  return row;
}

export async function getComment(id) {
  return await db().comments.get(id);
}

export async function updateComment(id, patch) {
  const existing = await db().comments.get(id);
  if (!existing) throw new Error(`[todayQueries] comment not found: ${id}`);
  const next = {
    ...existing,
    ...patch,
    updated_at: patch?.updated_at || nowIso(),
  };
  await db().comments.put(next);
  enqueueCommentSync(id);
  return next;
}

export async function softDeleteComment(id) {
  return await updateComment(id, { deleted_at: nowIso() });
}

/** entry_id 별 댓글 (deleted 제외, created_at asc — 시간순). */
export async function listCommentsByEntry(entryId) {
  const rows = await db().comments
    .where('[entry_id+created_at]')
    .between([entryId, ''], [entryId, '￿'], true, true)
    .toArray();
  return rows.filter((r) => !r.deleted_at);
}

/** entry_id 별 댓글 수 (deleted 제외) — 피드 카드 표시용. */
export async function countCommentsByEntry(entryId) {
  const rows = await listCommentsByEntry(entryId);
  return rows.length;
}

/** entry_id 배열별 댓글 수 — Dexie 1회 호출로 일괄 (N+1 회피). 리센츠 인라인 카운트용. */
export async function countCommentsByEntries(entryIds) {
  if (!entryIds?.length) return new Map();
  const rows = await db().comments.where('entry_id').anyOf(entryIds).toArray();
  const map = new Map(entryIds.map((id) => [id, 0]));
  for (const c of rows) {
    if (c.deleted_at) continue;
    map.set(c.entry_id, (map.get(c.entry_id) || 0) + 1);
  }
  return map;
}

function enqueueCommentSync(id) {
  const sync = globalThis.todaySync;
  if (sync && typeof sync.queueUploadComment === 'function') {
    sync.queueUploadComment(id);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// notifications (Wave 11.7.1) — spec §6 line 247-259 / §11 line 401-433
// 인박스 메시지 — DB trigger 가 INSERT 만 함. 클라이언트는 read_at 갱신·목록 조회만.
// ═══════════════════════════════════════════════════════════════════════════

/** 본인 알림 (recipient_id) — 미읽은 것 우선 + 시간 desc.
 *  entry_unshared 는 background sync 신호이므로 dropdown / unread count 에서 기본 제외.
 *  opts.includeBackgroundKinds=true 이면 포함 (테스트 또는 디버깅용). */
export async function listNotifications(recipientId, opts = {}) {
  const all = await db().notifications.where('recipient_id').equals(recipientId).toArray();
  let filtered = opts.unreadOnly ? all.filter((n) => !n.read_at) : all;
  if (!opts.includeBackgroundKinds) {
    filtered = filtered.filter((n) => n.kind !== 'entry_unshared');
  }
  return filtered.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

/** 미읽은 알림 수. */
export async function countUnreadNotifications(recipientId) {
  const list = await listNotifications(recipientId, { unreadOnly: true });
  return list.length;
}

/** 읽음 처리. */
export async function markNotificationRead(id) {
  const existing = await db().notifications.get(id);
  if (!existing) return null;
  if (existing.read_at) return existing; // 이미 읽음
  const next = { ...existing, read_at: nowIso() };
  await db().notifications.put(next);
  // Supabase 측도 갱신 (Wave 11.7.2 sync 통합 예정 — 지금은 placeholder)
  const sync = globalThis.todaySync;
  if (sync && typeof sync.queueUploadNotification === 'function') {
    sync.queueUploadNotification(id);
  }
  return next;
}

/** 모든 알림 읽음 처리. */
export async function markAllNotificationsRead(recipientId) {
  const unread = await listNotifications(recipientId, { unreadOnly: true });
  for (const n of unread) {
    await markNotificationRead(n.id);
  }
  return unread.length;
}

// ───────────────────────────────────────────────────────────────────────────
// 노출
// ───────────────────────────────────────────────────────────────────────────

export const Queries = {
  ENTRY_KINDS,
  listEntries,
  getEntry,
  getEntryByKindNumber,
  listSharedEntries,
  listSharedNaviEntries,
  searchEntries,
  createEntry,
  updateEntry,
  softDeleteEntry,
  restoreEntry,
  togglePin,
  countEntriesByKind,
  listDeletedEntries,
  listPendingEntries,
  setPendingSync,
  // Wave 11.6.1 — expenses
  EXPENSE_SOURCES,
  createExpense,
  getExpense,
  updateExpense,
  softDeleteExpense,
  restoreExpense,
  listExpensesByRange,
  listExpensesByMonth,
  listExpensesByDate,
  searchExpenses,
  sumExpensesByCategoryMonth,
  sumExpensesMonth,
  findExpenseBySmsRaw,
  // Wave 11.6.4a — merchant_rules
  RULE_SCOPES,
  createMerchantRule,
  upsertUserMerchantRule,
  listMerchantRules,
  autoMatchMerchantRule,
  createExpenseWithAutoMatch,
  // Wave 11.7.1 — comments
  createComment,
  getComment,
  updateComment,
  softDeleteComment,
  listCommentsByEntry,
  countCommentsByEntry,
  countCommentsByEntries,
  // Wave 11.7.1 — notifications
  listNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
};

if (typeof window !== 'undefined') {
  window.todayQueries = Queries;
}

export default Queries;
