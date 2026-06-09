/**
 * Wave 11.5.2b — 자동저장 + DOM 패치 e2e
 *
 * 검증 (비인증 상태에서 page.evaluate 로 직접 호출):
 *   - window.todayEntries 노출 (15개 멤버)
 *   - renderRecentsFromRows 가 #recentsList 패치 + escapeHtml 적용
 *   - renderDocFromRow 가 #mainView 의 article 구조 (h1/meta/body) 생성
 *   - wrapNewArticle 가 mocks newDoc 의 article 본문을 contenteditable 로 wrap
 *
 * 비대상 (사용자 환경 / 별 wave):
 *   - 실 OAuth 통과 후 saveArticle → Supabase upload (별 검증, leftjap 실기)
 *   - MutationObserver 기반 카테고리 자동 감지 (mocks 마운트 의존 — 인증 e2e 별 wave)
 */
import { test, expect } from '@playwright/test';

test.describe('Wave 11.5.2b autosave', () => {
  test('window.todayEntries 노출 — 자동저장 함수 포함', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card', { timeout: 5_000 });
    const exposed = await page.evaluate(() => {
      const e = window.todayEntries;
      const required = [
        'ENTRY_KINDS', 'mountEntriesView', 'rebindCategoryObserver', 'debounce',
        'rowToMockDoc', 'buildMockMeta', 'formatSavedTime', 'countWords', 'escapeHtml',
        'renderRecentsFromRows', 'renderDocFromRow',
        'getCurrentKind', 'setSaveStatus', 'saveArticle', 'wrapNewArticle',
        'injectEditorStyles', 'syncShareToggleFromRow',
        'isEditorDirty', 'markArticleDirty', 'clearArticleDirty',
        'showServerUpdateBadge', 'hideServerUpdateBadge', 'handleRealtimeEntryChange',
      ];
      const missing = required.filter((k) => !(k in (e || {})));
      return { hasEntries: !!e, missing };
    });
    expect(exposed.hasEntries).toBe(true);
    expect(exposed.missing).toEqual([]);
  });

  test('injectEditorStyles — .doc__body 빈 contenteditable placeholder', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => {
      // 1회 주입 — idempotent
      window.todayEntries.injectEditorStyles();
      window.todayEntries.injectEditorStyles();
      const styleEls = document.querySelectorAll('#today-editor-styles');

      const view = document.createElement('div');
      view.id = 'mainView-test';
      view.innerHTML = `
        <article class="doc">
          <h1 class="doc__h1"></h1>
          <div class="doc__meta"></div>
          <div class="doc__body" contenteditable="true"></div>
        </article>
      `;
      document.body.appendChild(view);

      const body = view.querySelector('.doc__body');
      const cs = getComputedStyle(body, '::before');
      const beforeContent = cs.content;
      const emptyBefore = body.matches(':empty');

      // 사용자 입력 시 :empty 미매치 → placeholder 시각 비노출
      body.textContent = '입력함';
      const emptyAfter = body.matches(':empty');

      view.remove();
      return {
        styleCount: styleEls.length,
        beforeContent,
        emptyBefore,
        emptyAfter,
      };
    });
    expect(result.styleCount).toBe(1);
    expect(result.beforeContent).toContain('본문을 입력하세요');
    expect(result.emptyBefore).toBe(true);
    expect(result.emptyAfter).toBe(false);
  });

  test('renderRecentsFromRows — fake #recentsList 패치 + XSS escape', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => {
      document.querySelector('#recentsList')?.remove();
      const list = document.createElement('div');
      list.id = 'recentsList';
      document.body.appendChild(list);
      const ok = window.todayEntries.renderRecentsFromRows('navi', [
        { id: 'abc-1', title: '<script>alert(1)</script>' },
        { id: 'abc-2', title: '두 번째' },
      ]);
      const html = list.innerHTML;
      list.remove();
      return { ok, html };
    });
    expect(result.ok).toBe(true);
    expect(result.html).toContain('data-doc-id="abc-1"');
    expect(result.html).toContain('data-doc-id="abc-2"');
    expect(result.html).toContain('&lt;script&gt;');
    expect(result.html).not.toContain('<script>alert');
    expect(result.html).toContain('두 번째');
  });

  test('renderRecentsFromRows — rows=0 → no-op (mocks fixture 보존)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => {
      document.querySelector('#recentsList')?.remove();
      const list = document.createElement('div');
      list.id = 'recentsList';
      list.innerHTML = '<div class="sb__item--recent">기존 fixture</div>';
      document.body.appendChild(list);
      const ok = window.todayEntries.renderRecentsFromRows('navi', []);
      const html = list.innerHTML;
      list.remove();
      return { ok, html };
    });
    expect(result.ok).toBe(false);
    expect(result.html).toContain('기존 fixture');
  });

  test('renderDocFromRow — article 구조 (h1 contenteditable + meta + body contenteditable)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => {
      document.querySelector('#mainView')?.remove();
      const view = document.createElement('div');
      view.id = 'mainView';
      document.body.appendChild(view);
      const ok = window.todayEntries.renderDocFromRow({
        id: 'row-1',
        title: '제목 X',
        content: '<p>본문 Y</p>',
        updated_at: new Date().toISOString(),
      });
      const article = view.querySelector('article.doc');
      const h1 = article?.querySelector('.doc__h1');
      const body = article?.querySelector('.doc__body');
      const meta = article?.querySelector('.doc__meta');
      const result = {
        ok,
        entryId: article?.getAttribute('data-entry-id'),
        h1Editable: h1?.isContentEditable,
        h1Text: h1?.textContent,
        bodyEditable: body?.isContentEditable,
        bodyHtml: body?.innerHTML,
        metaHasSave: !!meta?.querySelector('.save'),
      };
      view.remove();
      return result;
    });
    expect(result.ok).toBe(true);
    expect(result.entryId).toBe('row-1');
    expect(result.h1Editable).toBe(true);
    expect(result.h1Text).toBe('제목 X');
    expect(result.bodyEditable).toBe(true);
    expect(result.bodyHtml).toBe('<p>본문 Y</p>');
    expect(result.metaHasSave).toBe(true);
  });

  test('wrapNewArticle — mocks newDoc article 의 본문 wrap + new- entryId', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => {
      document.querySelector('#mainView')?.remove();
      const view = document.createElement('div');
      view.id = 'mainView';
      // mocks newDoc (today-mac.html L4679-4685) 가 그리는 article 모방
      view.innerHTML = `
        <article class="doc">
          <h1 class="doc__h1" contenteditable spellcheck="false" data-empty-title="제목 없음"></h1>
          <div class="doc__meta">새 글<span class="sep">·</span>0단어<span class="sep">·</span><span class="save">자동 저장 대기</span></div>
          <p class="doc__p" style="color:var(--ink-4);">본문을 입력하세요…</p>
        </article>
      `;
      document.body.appendChild(view);
      const ok = window.todayEntries.wrapNewArticle();
      const article = view.querySelector('article.doc');
      const body = article?.querySelector('.doc__body');
      const stillHasFloatingP = !!view.querySelector('article.doc > p.doc__p');
      const result = {
        ok,
        entryIdPrefix: article?.dataset.entryId?.startsWith('new-'),
        bodyExists: !!body,
        bodyEditable: body?.isContentEditable,
        bodyEmpty: body?.innerHTML === '',
        stillHasFloatingP,
      };
      view.remove();
      return result;
    });
    expect(result.ok).toBe(true);
    expect(result.entryIdPrefix).toBe(true);
    expect(result.bodyExists).toBe(true);
    expect(result.bodyEditable).toBe(true);
    expect(result.bodyEmpty).toBe(true);
    expect(result.stillHasFloatingP).toBe(false);
  });

  test('syncShareToggleFromRow — .share 클래스 동기화 + wrapNewArticle 시 OFF 추가', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => {
      const root = document.createElement('div');
      root.innerHTML = `<div class="share"><span class="label">소연에게 공유</span><span class="switch"></span></div>`;
      document.body.appendChild(root);

      const onResult = window.todayEntries.syncShareToggleFromRow({ is_shared: 1 });
      const afterOn = root.querySelector('.share').className;
      const offResult = window.todayEntries.syncShareToggleFromRow({ is_shared: 0 });
      const afterOff = root.querySelector('.share').className;

      // wrapNewArticle 후 .share--off 자동 추가 검증
      document.querySelector('#mainView')?.remove();
      const view = document.createElement('div');
      view.id = 'mainView';
      view.innerHTML = `
        <article class="doc">
          <h1 class="doc__h1"></h1>
          <div class="doc__meta"></div>
          <p class="doc__p">본문</p>
        </article>
      `;
      document.body.appendChild(view);
      // share 초기화 (ON 상태)
      root.querySelector('.share').className = 'share';
      const shareBeforeWrap = root.querySelector('.share').className;
      const wrapOk = window.todayEntries.wrapNewArticle();
      const shareAfterWrap = root.querySelector('.share').className;

      view.remove();
      root.remove();
      return { onResult, afterOn, offResult, afterOff, wrapOk, shareBeforeWrap, shareAfterWrap };
    });
    expect(result.onResult).toBe(true);
    expect(result.afterOn).toContain('share');
    expect(result.afterOn).not.toContain('share--off');
    expect(result.offResult).toBe(true);
    expect(result.afterOff).toContain('share--off');
    // wrapNewArticle 시 자동 OFF
    expect(result.wrapOk).toBe(true);
    expect(result.shareBeforeWrap).not.toContain('share--off');
    expect(result.shareAfterWrap).toContain('share--off');
  });

  test('handleRealtimeEntryChange — dirty 매치 시 배지 표시 + mainView 변경 X', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(async () => {
      document.querySelector('#mainView')?.remove();
      const view = document.createElement('div');
      view.id = 'mainView';
      view.innerHTML = `
        <article class="doc" data-entry-id="rt-1">
          <h1 class="doc__h1">기존 제목</h1>
          <div class="doc__meta"><span class="save">방금 저장됨</span></div>
          <div class="doc__body" contenteditable="true">기존 본문</div>
        </article>
      `;
      document.body.appendChild(view);

      const article = view.querySelector('article.doc');
      window.todayEntries.markArticleDirty(article);
      const isDirty = window.todayEntries.isEditorDirty(article);

      const r = await window.todayEntries.handleRealtimeEntryChange({
        table: 'today_entries',
        eventType: 'UPDATE',
        new: { id: 'rt-1', title: '서버 새 제목', content: '<p>서버 새 본문</p>', updated_at: new Date().toISOString() },
      });

      const titleAfter = view.querySelector('.doc__h1')?.textContent;
      const badge = view.querySelector('.server-update-badge');
      view.remove();
      window.todayEntries.clearArticleDirty(article);
      return {
        isDirty,
        applied: r.applied,
        reason: r.reason,
        matched: r.matched,
        titleAfter,
        badgeText: badge?.textContent,
        badgeHidden: badge?.hidden,
      };
    });
    expect(result.isDirty).toBe(true);
    expect(result.applied).toBe(true);
    expect(result.reason).toBe('dirty_badge');
    expect(result.matched).toBe(true);
    // dirty 라 mainView 갱신 안 됨
    expect(result.titleAfter).toBe('기존 제목');
    // 배지 표시
    expect(result.badgeText).toBe('서버에 새 버전 있음');
    expect(result.badgeHidden).toBe(false);
  });

  test('handleRealtimeEntryChange — not dirty 매치 시 mainView 재패치', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(async () => {
      document.querySelector('#mainView')?.remove();
      const view = document.createElement('div');
      view.id = 'mainView';
      view.innerHTML = `
        <article class="doc" data-entry-id="rt-2">
          <h1 class="doc__h1">기존 제목</h1>
          <div class="doc__meta"><span class="save">방금 저장됨</span></div>
          <div class="doc__body" contenteditable="true">기존 본문</div>
        </article>
      `;
      document.body.appendChild(view);

      // dirty 마킹 안 함
      const r = await window.todayEntries.handleRealtimeEntryChange({
        table: 'today_entries',
        eventType: 'UPDATE',
        new: { id: 'rt-2', title: '서버 새 제목', content: '<p>서버 새 본문</p>', updated_at: new Date().toISOString() },
      });

      const titleAfter = view.querySelector('.doc__h1')?.textContent;
      const bodyAfter = view.querySelector('.doc__body')?.innerHTML;
      view.remove();
      return {
        applied: r.applied,
        reason: r.reason,
        matched: r.matched,
        titleAfter,
        bodyAfter,
      };
    });
    expect(result.applied).toBe(true);
    expect(result.reason).toBe('reloaded');
    expect(result.matched).toBe(true);
    expect(result.titleAfter).toBe('서버 새 제목');
    expect(result.bodyAfter).toBe('<p>서버 새 본문</p>');
  });

  test('wrapNewArticle — 이미 wrap 됐으면 no-op', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const ok = await page.evaluate(() => {
      document.querySelector('#mainView')?.remove();
      const view = document.createElement('div');
      view.id = 'mainView';
      view.innerHTML = `
        <article class="doc" data-entry-id="existing-id">
          <h1 class="doc__h1"></h1>
          <div class="doc__meta"></div>
          <div class="doc__body" contenteditable="true"></div>
        </article>
      `;
      document.body.appendChild(view);
      const result = window.todayEntries.wrapNewArticle();
      view.remove();
      return result;
    });
    expect(ok).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Wave 11.7.3 — recents share 라벨 (사용자 결정 2026-04-30 — 세그먼트 UI 폐기)
// ───────────────────────────────────────────────────────────────────────────

test.describe('Wave 11.7.3 recents share 라벨', () => {
  test('renderRecentsFromRows — soyoun_navi kind row 에 \'소연\' 라벨 추가', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => {
      document.querySelector('#recentsList')?.remove();
      const list = document.createElement('div');
      list.id = 'recentsList';
      document.body.appendChild(list);
      const rows = [
        { id: 'r-mine', kind: 'navi', title: '내 글' },
        { id: 'r-partner', kind: 'soyoun_navi', title: '소연 글' },
      ];
      const ok = window.todayEntries.renderRecentsFromRows('navi', rows);
      const items = [...list.querySelectorAll('.sb__item--recent')];
      const result = items.map((it) => ({
        id: it.getAttribute('data-doc-id'),
        title: it.textContent.replace('소연', '').trim(),
        hasLabel: !!it.querySelector('.rc-sub .sh'),
        labelText: it.querySelector('.rc-sub .sh')?.textContent || '',
      }));
      list.remove();
      return { ok, items: result };
    });
    expect(result.ok).toBe(true);
    expect(result.items.length).toBe(2);
    expect(result.items[0].id).toBe('r-mine');
    expect(result.items[0].hasLabel).toBe(false);
    expect(result.items[1].id).toBe('r-partner');
    expect(result.items[1].hasLabel).toBe(true);
    expect(result.items[1].labelText).toBe('소연');
  });
});
