/**
 * comments.js 단위 테스트 — 대화 패널 (Today 리디자인 §4.2).
 *
 * 범위:
 *   - escapeHtml / formatCommentTime / formatDayLabel / dayKeyOf — pure
 *   - commentToHtml — mine vs partner vs 클로드(자동) / 삭제 버튼 / XSS escape
 *   - commentsToSectionHtml — 빈 상태 / 날짜 구분 그룹핑
 *   - mountForArticle — listCommentsByEntry → #convoList 타임라인 렌더
 *   - syncComposerState — disabled / placeholder
 *   - handleRealtimeCommentChange — INSERT / DELETE / dedup / entry mismatch
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  Comments,
  CLAUDE_AUTHOR_ID,
  commentToHtml,
  commentsToSectionHtml,
  formatCommentTime,
  formatDayLabel,
  dayKeyOf,
  escapeHtml,
  mountForArticle,
  syncComposerState,
  handleRealtimeCommentChange,
  __resetCommentsState,
} from './comments.js';
import { USER_ID_TO_DISPLAY_NAME } from './entries.js';
import { createTodayDB } from '../db/schema.js';

const OWNER = '11111111-2222-3333-4444-555555555555';
const PARTNER = '22222222-3333-4444-5555-666666666666';
const GIO_UUID = Object.keys(USER_ID_TO_DISPLAY_NAME)[0]; // 실 매핑 ('지오')

beforeEach(() => {
  __resetCommentsState();
});

/** 대화 패널 fake doc — convoList / convoCount / composer input. */
function makePanelDoc() {
  const list = {
    innerHTML: '',
    scrollTop: 0,
    scrollHeight: 50,
    insertAdjacentHTML(_, html) { this.innerHTML += html; },
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const count = { textContent: '' };
  const input = {
    attrs: {},
    value: '',
    removeAttribute(k) { delete this.attrs[k]; },
    setAttribute(k, v) { this.attrs[k] = v; },
    get disabled() { return 'disabled' in this.attrs; },
  };
  const doc = {
    getElementById: (id) => (id === 'convoList' ? list : id === 'convoCount' ? count : null),
    querySelector: (sel) => (sel === '#convoPanel .composer input' ? input : null),
    querySelectorAll: () => [],
  };
  return { doc, list, count, input };
}

describe('Comments 인터페이스 노출', () => {
  it('필수 멤버 노출', () => {
    const required = [
      'mountCommentsView',
      'mountForArticle',
      'syncComposerState',
      'handleRealtimeCommentChange',
      'commentToHtml',
      'commentsToSectionHtml',
      'formatCommentTime',
      'formatDayLabel',
      'dayKeyOf',
      'clearPanel',
      'escapeHtml',
    ];
    for (const k of required) {
      expect(typeof Comments[k]).toBe('function');
    }
    expect(typeof Comments.CLAUDE_AUTHOR_ID).toBe('string');
  });
});

describe('escapeHtml', () => {
  it('HTML 위험 문자 escape', () => {
    expect(escapeHtml('<a href="x">&\'</a>'))
      .toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  });
  it('null/undefined → ""', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('formatCommentTime — HH:MM (날짜는 .cv-day 구분이 담당)', () => {
  it('ISO → "HH:MM"', () => {
    expect(formatCommentTime('2026-04-30T15:30:00')).toBe('15:30');
  });
  it('다른 날도 HH:MM (날짜 구분이 날짜 표시)', () => {
    expect(formatCommentTime('2026-04-15T09:05:00')).toMatch(/^\d{2}:\d{2}$/);
  });
  it('null/잘못된 → ""', () => {
    expect(formatCommentTime(null)).toBe('');
    expect(formatCommentTime('not-a-date')).toBe('');
  });
});

describe('formatDayLabel / dayKeyOf', () => {
  it('ISO → "M월 D일" / "YYYY-MM-DD"', () => {
    expect(formatDayLabel('2026-06-04T21:07:00')).toBe('6월 4일');
    expect(dayKeyOf('2026-06-04T21:07:00')).toBe('2026-06-04');
  });
  it('null → ""', () => {
    expect(formatDayLabel(null)).toBe('');
    expect(dayKeyOf(null)).toBe('');
  });
});

describe('commentToHtml', () => {
  it('mine → .cv-msg + data-mine="1" + 삭제 버튼 + 아바타(--me)', () => {
    const html = commentToHtml(
      { id: 'c1', body: '댓글', created_at: '2026-04-30T15:00:00', author_id: OWNER },
      { currentUserId: OWNER },
    );
    expect(html).toContain('data-comment-id="c1"');
    expect(html).toContain('data-mine="1"');
    expect(html).toContain('cv-msg__del');
    expect(html).toContain('cv-msg__avatar--me');
    expect(html).toContain('>댓글</div>');
    expect(html).toContain('15:00');
  });

  it('partner → 삭제 버튼 없음 + 아바타(--partner) + partnerName', () => {
    const html = commentToHtml(
      { id: 'c2', body: '파트너 댓글', author_id: PARTNER },
      { currentUserId: OWNER, partnerName: '소연' },
    );
    expect(html).toContain('data-mine="0"');
    expect(html).not.toContain('cv-msg__del');
    expect(html).toContain('cv-msg__avatar--partner');
    expect(html).toContain('>소연<');
  });

  it('실 UUID 매핑 → 표시 이름 "지오"', () => {
    const html = commentToHtml(
      { id: 'c3', body: 'x', author_id: GIO_UUID },
      { currentUserId: OWNER },
    );
    expect(html).toContain('>지오<');
  });

  it('클로드 자동 댓글 → sunken 카드 + "자동" 태그 + 2줄 클램프 + 더 보기', () => {
    const html = commentToHtml(
      { id: 'ai1', body: '자동 코멘트', created_at: '2026-06-04T21:12:00', author_id: CLAUDE_AUTHOR_ID },
      { currentUserId: OWNER },
    );
    expect(html).toContain('cv-msg--ai');
    expect(html).toContain('cv-msg__card');
    expect(html).toContain('>클로드<');
    expect(html).toContain('ai-tag');
    expect(html).toContain('자동');
    expect(html).toContain('is-clamped');
    expect(html).toContain('cv-msg__more');
    expect(html).toContain('cv-msg__avatar--ai');
    expect(html).not.toContain('cv-msg__del');
  });

  it('XSS escape', () => {
    const html = commentToHtml(
      { id: 'x', body: '<script>alert(1)</script>', author_id: PARTNER },
      { currentUserId: OWNER },
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('commentsToSectionHtml — 타임라인 + 날짜 구분', () => {
  it('빈 배열 → 빈 string', () => {
    expect(commentsToSectionHtml([], { currentUserId: OWNER })).toBe('');
  });

  it('같은 날 2건 → 날짜 구분 1개 + 메시지 2개', () => {
    const html = commentsToSectionHtml(
      [
        { id: 'c1', body: 'A', author_id: OWNER, created_at: '2026-06-04T10:00:00' },
        { id: 'c2', body: 'B', author_id: PARTNER, created_at: '2026-06-04T11:00:00' },
      ],
      { currentUserId: OWNER, partnerName: '소연' },
    );
    expect(html.match(/class="cv-day"/g)?.length).toBe(1);
    expect(html).toContain('6월 4일');
    expect(html).toContain('data-comment-id="c1"');
    expect(html).toContain('data-comment-id="c2"');
  });

  it('다른 날 2건 → 날짜 구분 2개', () => {
    const html = commentsToSectionHtml(
      [
        { id: 'c1', body: 'A', author_id: OWNER, created_at: '2026-06-03T10:00:00' },
        { id: 'c2', body: 'B', author_id: PARTNER, created_at: '2026-06-04T11:00:00' },
      ],
      { currentUserId: OWNER },
    );
    expect(html.match(/class="cv-day"/g)?.length).toBe(2);
    expect(html).toContain('6월 3일');
    expect(html).toContain('6월 4일');
  });
});

describe('syncComposerState', () => {
  it('canComment=true → disabled 제거 + 기본 placeholder', () => {
    const { doc, input } = makePanelDoc();
    syncComposerState(true, doc);
    expect(input.attrs.placeholder).toBe('댓글을 남겨보세요…');
    expect(input.disabled).toBe(false);
  });

  it('canComment=false → disabled + 안내 placeholder + value clear', () => {
    const { doc, input } = makePanelDoc();
    input.value = '입력 중인 댓글';
    syncComposerState(false, doc);
    expect(input.attrs.disabled).toBe('true');
    expect(input.attrs.placeholder).toContain('공유된 글에만');
    expect(input.value).toBe('');
  });
});

describe('mountForArticle', () => {
  beforeEach(async () => {
    const dbName = 'today_test_' + Math.random().toString(36).slice(2, 10);
    globalThis.todayDB = createTodayDB(dbName);
  });

  afterEach(async () => {
    if (globalThis.todayDB) {
      await globalThis.todayDB.delete();
      globalThis.todayDB = null;
    }
  });

  it('미저장 article → reason=unsaved + 패널 비움', async () => {
    const { doc, list } = makePanelDoc();
    list.innerHTML = '이전 글 잔재';
    const article = { dataset: { entryId: 'new-1' } };
    const r = await mountForArticle(article, { currentUserId: OWNER, doc });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('unsaved');
    expect(list.innerHTML).toBe('');
  });

  it('shared entry + 댓글 0건 → ok=true count=0 mounted=false + 빈 타임라인', async () => {
    const { Queries } = await import('../db/queries.js');
    const e = await Queries.createEntry({ owner_id: OWNER, kind: 'navi', title: '글', is_shared: 1 });
    const { doc, list } = makePanelDoc();
    const article = { dataset: { entryId: e.id } };
    const r = await mountForArticle(article, { currentUserId: OWNER, doc });
    expect(r.ok).toBe(true);
    expect(r.canComment).toBe(true);
    expect(r.count).toBe(0);
    expect(r.mounted).toBe(false);
    expect(list.innerHTML).toBe('');
  });

  it('shared entry + 댓글 2건 → count=2 + 타임라인 메시지 2개', async () => {
    const { Queries } = await import('../db/queries.js');
    const e = await Queries.createEntry({ owner_id: OWNER, kind: 'navi', is_shared: 1 });
    await Queries.createComment({ entry_id: e.id, author_id: OWNER, body: '본인 댓글' });
    await Queries.createComment({ entry_id: e.id, author_id: PARTNER, body: '파트너 댓글' });
    const { doc, list } = makePanelDoc();
    const article = { dataset: { entryId: e.id } };
    const r = await mountForArticle(article, { currentUserId: OWNER, doc, partnerName: '소연' });
    expect(r.count).toBe(2);
    expect(list.innerHTML).toContain('본인 댓글');
    expect(list.innerHTML).toContain('파트너 댓글');
    expect(list.innerHTML).toContain('>소연<');
    expect(list.innerHTML).toContain('class="cv-day"');
  });

  it('파트너의 is_shared=false entry → canComment=false + 빈 타임라인', async () => {
    const { Queries } = await import('../db/queries.js');
    const e = await Queries.createEntry({ owner_id: OWNER, kind: 'navi', is_shared: 0 });
    const { doc, input } = makePanelDoc();
    const article = { dataset: { entryId: e.id } };
    const r = await mountForArticle(article, { currentUserId: 'u-partner-not-owner', doc });
    expect(r.canComment).toBe(false);
    expect(input.disabled).toBe(true);
  });

  it('본인 글은 is_shared=false 여도 canComment=true (2026-05-13 정책 — 메모·추가내용 용도)', async () => {
    const { Queries } = await import('../db/queries.js');
    const e = await Queries.createEntry({ owner_id: OWNER, kind: 'navi', is_shared: 0 });
    const { doc } = makePanelDoc();
    const article = { dataset: { entryId: e.id } };
    const r = await mountForArticle(article, { currentUserId: OWNER, doc });
    expect(r.canComment).toBe(true);
  });
});

describe('handleRealtimeCommentChange', () => {
  function makeRealtimeDoc(entryId, existingIds = []) {
    const rows = new Map(existingIds.map((id) => [id, {
      remove: vi.fn(),
      getAttribute: () => '2026-06-04',
    }]));
    const list = {
      _appended: [],
      innerHTML: '',
      scrollTop: 0,
      scrollHeight: 50,
      insertAdjacentHTML(_, html) { this._appended.push(html); },
      querySelector(sel) {
        const m = sel.match(/data-comment-id="([^"]+)"/);
        if (m) return rows.get(m[1]) || null;
        return null;
      },
      querySelectorAll: () => [],
    };
    const count = { textContent: '' };
    const article = { dataset: { entryId } };
    const doc = {
      getElementById: (id) => (id === 'convoList' ? list : id === 'convoCount' ? count : null),
      querySelector: (sel) => (sel === '#mainView article.doc' ? article : null),
      querySelectorAll: () => [],
    };
    return { doc, article, list, rows };
  }

  it('table mismatch → applied=false', async () => {
    const r = await handleRealtimeCommentChange(
      { table: 'today_entries', eventType: 'INSERT', new: { id: 'x' } },
      {},
    );
    expect(r.applied).toBe(false);
    expect(r.reason).toBe('table_mismatch');
  });

  it('INSERT — 매치 entry → 타임라인 append (날짜 구분 + 메시지)', async () => {
    const { doc, list } = makeRealtimeDoc('e-1');
    const r = await handleRealtimeCommentChange(
      {
        table: 'today_comments',
        eventType: 'INSERT',
        new: { id: 'c-1', entry_id: 'e-1', body: '새 댓글', author_id: PARTNER, created_at: '2026-06-04T10:00:00' },
      },
      doc,
    );
    expect(r.applied).toBe(true);
    expect(r.reason).toBe('appended');
    // 날짜 구분 + 메시지 — 2회 insertAdjacentHTML
    expect(list._appended.length).toBe(2);
    expect(list._appended[0]).toContain('cv-day');
    expect(list._appended[1]).toContain('새 댓글');
  });

  it('INSERT — 다른 entry → entry_mismatch', async () => {
    const { doc, list } = makeRealtimeDoc('e-1');
    const r = await handleRealtimeCommentChange(
      {
        table: 'today_comments',
        eventType: 'INSERT',
        new: { id: 'c-2', entry_id: 'OTHER', body: 'x', author_id: PARTNER },
      },
      doc,
    );
    expect(r.applied).toBe(false);
    expect(r.reason).toBe('entry_mismatch');
    expect(list._appended.length).toBe(0);
  });

  it('INSERT — dedup (이미 row 존재)', async () => {
    const { doc, list } = makeRealtimeDoc('e-1', ['c-1']);
    const r = await handleRealtimeCommentChange(
      {
        table: 'today_comments',
        eventType: 'INSERT',
        new: { id: 'c-1', entry_id: 'e-1', body: 'dup', author_id: OWNER },
      },
      doc,
    );
    expect(r.applied).toBe(true);
    expect(r.reason).toBe('dedup');
    expect(list._appended.length).toBe(0);
  });

  it('DELETE — 매치 row.remove 호출', async () => {
    const { doc, rows } = makeRealtimeDoc('e-1', ['c-1']);
    const r = await handleRealtimeCommentChange(
      {
        table: 'today_comments',
        eventType: 'DELETE',
        old: { id: 'c-1' },
      },
      doc,
    );
    expect(r.applied).toBe(true);
    expect(r.reason).toBe('removed');
    expect(rows.get('c-1').remove).toHaveBeenCalled();
  });

  it('UPDATE with deleted_at → soft delete (removed)', async () => {
    const { doc, rows } = makeRealtimeDoc('e-1', ['c-1']);
    const r = await handleRealtimeCommentChange(
      {
        table: 'today_comments',
        eventType: 'UPDATE',
        new: { id: 'c-1', entry_id: 'e-1', body: 'x', deleted_at: '2026-04-30T10:00:00Z' },
      },
      doc,
    );
    expect(r.applied).toBe(true);
    expect(r.reason).toBe('removed');
    expect(rows.get('c-1').remove).toHaveBeenCalled();
  });
});
