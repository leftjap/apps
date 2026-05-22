/**
 * comments.js 단위 테스트 (Wave 11.7.1 — 댓글 CRUD + composer + Realtime).
 *
 * 범위:
 *   - escapeHtml / formatCommentTime — pure
 *   - commentToHtml — mine vs partner / 삭제 버튼 / XSS escape
 *   - commentsToSectionHtml — 빈 상태 / 다건
 *   - mountForArticle — listCommentsByEntry → article 끝에 .doc__comments 추가
 *   - syncComposerState — disabled / placeholder
 *   - handleRealtimeCommentChange — INSERT / DELETE / dedup / entry mismatch
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  Comments,
  commentToHtml,
  commentsToSectionHtml,
  formatCommentTime,
  escapeHtml,
  mountForArticle,
  syncComposerState,
  handleRealtimeCommentChange,
  __resetCommentsState,
} from './comments.js';
import { CLAUDE_USER_ID } from './entries.js';
import { createTodayDB } from '../db/schema.js';

const OWNER = '11111111-2222-3333-4444-555555555555';
const PARTNER = '22222222-3333-4444-5555-666666666666';

beforeEach(() => {
  __resetCommentsState();
});

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
      'escapeHtml',
    ];
    for (const k of required) {
      expect(typeof Comments[k]).toBe('function');
    }
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

describe('formatCommentTime', () => {
  it('오늘 ISO → "HH:MM"', () => {
    const now = new Date('2026-04-30T15:30:00Z');
    const iso = now.toISOString();
    const r = formatCommentTime(iso, now);
    expect(r).toMatch(/^\d{2}:\d{2}$/);
  });
  it('다른 날 → "M월 D일"', () => {
    const now = new Date('2026-04-30T10:00:00');
    const r = formatCommentTime('2026-04-15T10:00:00Z', now);
    expect(r).toMatch(/^\d+월 \d+일$/);
  });
  it('null/잘못된 → ""', () => {
    expect(formatCommentTime(null)).toBe('');
    expect(formatCommentTime('not-a-date')).toBe('');
  });
});

describe('commentToHtml', () => {
  it('mine=true → bubble + 삭제 버튼 + data-mine="1" + author "나" + 아바타 렌더', () => {
    const html = commentToHtml(
      { id: 'c1', body: '댓글', created_at: '2026-04-30T15:00:00Z', author_id: OWNER },
      { currentUserId: OWNER },
    );
    expect(html).toContain('data-comment-id="c1"');
    expect(html).toContain('data-mine="1"');
    expect(html).toContain('comment-row__delete');
    expect(html).toContain('>나<');
    expect(html).toContain('comment-row__bubble');
    expect(html).toContain('>댓글</div>');
    // 사용자별 아바타 — mine 도 아바타 렌더 (우측 정렬)
    expect(html).toContain('comment-row__avatar');
  });

  it('mine=false → 삭제 버튼 없음 + partnerName + 아바타', () => {
    const html = commentToHtml(
      { id: 'c2', body: '파트너 댓글', author_id: PARTNER },
      { currentUserId: OWNER, partnerName: '소연' },
    );
    expect(html).toContain('data-mine="0"');
    expect(html).not.toContain('comment-row__delete');
    expect(html).toContain('>소연<');
    expect(html).toContain('comment-row__bubble');
    // 사용자별 아바타 (initial = '소')
    expect(html).toContain('comment-row__avatar');
    expect(html).toMatch(/comment-row__avatar"[^>]*>소<\/span>/);
  });

  it('partnerName 없음 → 기본 아바타 "소"', () => {
    const html = commentToHtml({ id: 'c3', body: 'x', author_id: PARTNER }, { currentUserId: OWNER });
    expect(html).toContain('comment-row__avatar');
    expect(html).toMatch(/comment-row__avatar"[^>]*>소<\/span>/);
  });

  it('클로드 작성자 → 라벨 "클로드" + 로고 SVG 아바타', () => {
    const html = commentToHtml(
      { id: 'cl', body: 'hi', author_id: CLAUDE_USER_ID },
      { currentUserId: OWNER },
    );
    expect(html).toContain('data-mine="0"');
    expect(html).toContain('>클로드<');
    expect(html).toContain('comment-row__avatar--claude');
    expect(html).toContain('<svg');
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

describe('commentsToSectionHtml', () => {
  it('빈 배열 → 빈 string (Wave 11.6.8a — 0건 시 영역 자체 미렌더)', () => {
    const html = commentsToSectionHtml([], { currentUserId: OWNER });
    expect(html).toBe('');
  });

  it('다건 → 각 row + 헤더 (카운트)', () => {
    const html = commentsToSectionHtml(
      [
        { id: 'c1', body: 'A', author_id: OWNER },
        { id: 'c2', body: 'B', author_id: PARTNER },
      ],
      { currentUserId: OWNER, partnerName: '소연' },
    );
    expect(html).toContain('class="doc__comments"');
    expect(html).toContain('class="doc__comments-header"');
    expect(html).toContain('class="doc__comments-count">2<');
    expect(html).toContain('data-comment-id="c1"');
    expect(html).toContain('data-comment-id="c2"');
    expect(html).not.toContain('comment-empty');
  });
});

describe('syncComposerState', () => {
  it('canComment=true → disabled 제거 + 기본 placeholder', () => {
    const input = {
      attrs: {},
      removeAttribute(k) { delete this.attrs[k]; },
      setAttribute(k, v) { this.attrs[k] = v; },
      get disabled() { return 'disabled' in this.attrs; },
      value: '',
    };
    const fakeDoc = { querySelector: () => input };
    syncComposerState(true, fakeDoc);
    expect(input.attrs.placeholder).toBe('댓글을 남겨보세요');
    expect(input.disabled).toBe(false);
  });

  it('canComment=false → disabled + 안내 placeholder + value clear', () => {
    const input = {
      attrs: {},
      removeAttribute(k) { delete this.attrs[k]; },
      setAttribute(k, v) { this.attrs[k] = v; },
      value: '입력 중인 댓글',
    };
    const fakeDoc = { querySelector: () => input };
    syncComposerState(false, fakeDoc);
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

  it('미저장 article → reason=unsaved', async () => {
    const article = { dataset: { entryId: 'new-1' } };
    const r = await mountForArticle(article, { currentUserId: OWNER });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('unsaved');
  });

  it('shared entry + 댓글 0건 → ok=true count=0 mounted=false (Wave 11.6.8a — 영역 미렌더)', async () => {
    const { Queries } = await import('../db/queries.js');
    const e = await Queries.createEntry({ owner_id: OWNER, kind: 'navi', title: '글', is_shared: 1 });
    const sectionContainer = [];
    const article = {
      dataset: { entryId: e.id },
      querySelector: () => null,
      insertAdjacentHTML: (where, html) => sectionContainer.push(html),
    };
    const r = await mountForArticle(article, {
      currentUserId: OWNER,
      doc: { querySelector: () => null },
    });
    expect(r.ok).toBe(true);
    expect(r.canComment).toBe(true);
    expect(r.count).toBe(0);
    expect(r.mounted).toBe(false);
    expect(sectionContainer.length).toBe(0);
  });

  it('shared entry + 댓글 2건 → count=2 + commentToHtml row 2개', async () => {
    const { Queries } = await import('../db/queries.js');
    const e = await Queries.createEntry({ owner_id: OWNER, kind: 'navi', is_shared: 1 });
    await Queries.createComment({ entry_id: e.id, author_id: OWNER, body: '본인 댓글' });
    await Queries.createComment({ entry_id: e.id, author_id: PARTNER, body: '파트너 댓글' });
    const sectionContainer = [];
    const article = {
      dataset: { entryId: e.id },
      querySelector: () => null,
      insertAdjacentHTML: (where, html) => sectionContainer.push(html),
    };
    const r = await mountForArticle(article, {
      currentUserId: OWNER,
      doc: { querySelector: () => null },
      partnerName: '소연',
    });
    expect(r.count).toBe(2);
    expect(sectionContainer[0]).toContain('본인 댓글');
    expect(sectionContainer[0]).toContain('파트너 댓글');
    expect(sectionContainer[0]).toContain('>소연<');
  });

  // 본인 글은 is_shared=false 라도 댓글 가능 (2026-05-13 결정). 따라서 차단 경계는 "파트너의 비공유 글".
  it('파트너의 is_shared=false entry → canComment=false', async () => {
    const { Queries } = await import('../db/queries.js');
    const e = await Queries.createEntry({ owner_id: PARTNER, kind: 'navi', is_shared: 0 });
    const article = {
      dataset: { entryId: e.id },
      querySelector: () => null,
      insertAdjacentHTML: () => {},
    };
    const r = await mountForArticle(article, {
      currentUserId: OWNER,
      doc: { querySelector: () => null },
    });
    expect(r.canComment).toBe(false);
  });
});

describe('handleRealtimeCommentChange', () => {
  function makeFakeArticleWithList(entryId, existingIds = []) {
    const rows = new Map(existingIds.map((id) => [id, { remove: vi.fn() }]));
    const empty = { remove: vi.fn() };
    const list = {
      _appended: [],
      insertAdjacentHTML: function (where, html) { this._appended.push(html); },
      querySelector: function (sel) {
        const m = sel.match(/data-comment-id="([^"]+)"/);
        if (m) return rows.get(m[1]) || null;
        if (sel === '.comment-empty') return empty;
        return null;
      },
    };
    const article = {
      dataset: { entryId },
      querySelector: (sel) => (sel === '.doc__comments-list' ? list : null),
    };
    const doc = {
      querySelector: (sel) => (sel === '#mainView article.doc' ? article : null),
    };
    return { doc, article, list, rows, empty };
  }

  it('table mismatch → applied=false', async () => {
    const r = await handleRealtimeCommentChange(
      { table: 'today_entries', eventType: 'INSERT', new: { id: 'x' } },
      {},
    );
    expect(r.applied).toBe(false);
    expect(r.reason).toBe('table_mismatch');
  });

  it('INSERT — 매치 entry → list append', async () => {
    const { doc, list } = makeFakeArticleWithList('e-1');
    const r = await handleRealtimeCommentChange(
      {
        table: 'today_comments',
        eventType: 'INSERT',
        new: { id: 'c-1', entry_id: 'e-1', body: '새 댓글', author_id: PARTNER },
      },
      doc,
    );
    expect(r.applied).toBe(true);
    expect(r.reason).toBe('appended');
    expect(list._appended.length).toBe(1);
    expect(list._appended[0]).toContain('새 댓글');
  });

  it('INSERT — 다른 entry → entry_mismatch', async () => {
    const { doc, list } = makeFakeArticleWithList('e-1');
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
    const { doc, list } = makeFakeArticleWithList('e-1', ['c-1']);
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
    const { doc, rows } = makeFakeArticleWithList('e-1', ['c-1']);
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
    const { doc, rows } = makeFakeArticleWithList('e-1', ['c-1']);
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
