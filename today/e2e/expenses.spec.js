/**
 * Wave 11.6.3 — 가계부 대시보드/타임라인 e2e
 *
 * 검증 (비인증 상태에서 page.evaluate 로 직접 호출):
 *   - window.todayExpenses 노출
 *   - renderExpenseRecentsFromRows 가 #recentsList 패치 (data-tx-id, jumpToExpenseTx onclick)
 *   - patchHeadlineFromRows 가 .exp-headline-title strong / .exp-headline-sub strong 갱신
 *   - patchCalendarFromRows 가 .exp-month-day-amount + .high / .is-zero 클래스 갱신
 *   - renderTimelineFromRows 가 .exp-tl-list 재구성 (.exp-tl-row + .is-cont + onclick="openExpenseModal(...)")
 *
 * 비대상:
 *   - 실 OAuth 통과 → mocks 마운트 → MutationObserver 자동 감지 (사용자 환경 의존, leftjap 실기)
 */
import { test, expect } from '@playwright/test';

test.describe('Wave 11.6.3 expenses', () => {
  test('window.todayExpenses 노출 — 모든 멤버 (Wave 11.6.3 + 11.6.4b)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const exposed = await page.evaluate(() => {
      const e = window.todayExpenses;
      const required = [
        'mountExpensesView', 'rebindCategoryObserver',
        'formatAmount', 'isoToMockDate', 'rowToMockTx',
        'dailyTotalsFromRows', 'summarizeMonth', 'escapeHtml',
        'renderExpenseRecentsFromRows', 'patchHeadlineFromRows',
        'patchCalendarFromRows', 'renderTimelineFromRows',
        // Wave 11.6.3.1
        'formatManwon', 'rankMerchantsByMonth', 'escapeAttr',
        'patchRankSectionFromRows',
        'datetimeLocalToIso', 'isoToDatetimeLocal',
        'extractExpenseFromForm', 'populateExpenseForm',
        'validateExpenseForm', 'saveExpenseFromForm', 'deleteExpenseFromForm',
        'patchExpenseModalHandlers',
      ];
      const missing = required.filter((k) => !(k in (e || {})));
      return { hasExpenses: !!e, missing };
    });
    expect(exposed.hasExpenses).toBe(true);
    expect(exposed.missing).toEqual([]);
  });

  test('renderExpenseRecentsFromRows — #recentsList 패치 + onclick', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => {
      document.querySelector('#recentsList')?.remove();
      const list = document.createElement('div');
      list.id = 'recentsList';
      document.body.appendChild(list);
      const ok = window.todayExpenses.renderExpenseRecentsFromRows([
        { id: 'tx-1', spent_at: '2026-04-11T10:00:00Z', amount_krw: 24000, memo: '점심', category: '외식' },
        { id: 'tx-2', spent_at: '2026-04-12T15:00:00Z', amount_krw: 5000, memo: '<script>X</script>', category: '편의점' },
      ]);
      const html = list.innerHTML;
      const txIds = [...list.querySelectorAll('[data-tx-id]')].map((el) => el.getAttribute('data-tx-id'));
      const onclickAttr = list.querySelector('[data-tx-id="tx-1"]')?.getAttribute('onclick');
      list.remove();
      return { ok, html, txIds, onclickAttr };
    });
    expect(result.ok).toBe(true);
    expect(result.txIds).toEqual(['tx-1', 'tx-2']);
    expect(result.onclickAttr).toContain("jumpToExpenseTx('tx-1')");
    expect(result.html).toContain('점심');
    expect(result.html).toContain('24,000');
    expect(result.html).toContain('&lt;script&gt;');
    expect(result.html).not.toContain('<script>X</script>');
  });

  test('renderExpenseRecentsFromRows — rows=0 → no-op (mocks fixture 보존)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => {
      document.querySelector('#recentsList')?.remove();
      const list = document.createElement('div');
      list.id = 'recentsList';
      list.innerHTML = '<div class="sb__item--recent">기존 fixture</div>';
      document.body.appendChild(list);
      const ok = window.todayExpenses.renderExpenseRecentsFromRows([]);
      const html = list.innerHTML;
      list.remove();
      return { ok, html };
    });
    expect(result.ok).toBe(false);
    expect(result.html).toContain('기존 fixture');
  });

  test('patchHeadlineFromRows — strong 텍스트만 갱신 (inline onclick 보존)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => {
      const root = document.createElement('div');
      root.innerHTML = `
        <div class="exp-headline" onclick="origHandler()">
          <div class="exp-headline-title">4월에는 <strong>0만원</strong> 쓰고 있어요</div>
          <div class="exp-headline-sub">하루 평균 <strong>0원</strong> 쓰고 있어요</div>
        </div>
      `;
      document.body.appendChild(root);
      const rows = [
        { amount_krw: 1000000 },
        { amount_krw: 1150000 },
      ];
      const ok = window.todayExpenses.patchHeadlineFromRows(rows, { todayDay: 27 });
      const titleStrong = root.querySelector('.exp-headline-title strong')?.textContent;
      const subStrong = root.querySelector('.exp-headline-sub strong')?.textContent;
      const headlineOnclick = root.querySelector('.exp-headline')?.getAttribute('onclick');
      root.remove();
      return { ok, titleStrong, subStrong, headlineOnclick };
    });
    expect(result.ok).toBe(true);
    expect(result.titleStrong).toBe('215만원');
    expect(result.subStrong).toBe('79,630원');
    // 부분 patch — onclick 보존
    expect(result.headlineOnclick).toBe('origHandler()');
  });

  test('patchCalendarFromRows — .exp-month-day-amount + .high / .is-zero 갱신', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => {
      const root = document.createElement('div');
      root.innerHTML = `
        <div class="exp-month-cal">
          <div class="exp-month-day" data-date="04-11"><div class="exp-month-day-num">11</div><div class="exp-month-day-amount">FIX</div></div>
          <div class="exp-month-day today" data-date="04-27"><div class="exp-month-day-num">27</div><div class="exp-month-day-amount">FIX</div></div>
          <div class="exp-month-day" data-date="04-28"><div class="exp-month-day-num">28</div><div class="exp-month-day-amount">FIX</div></div>
        </div>
      `;
      document.body.appendChild(root);
      // 04-11 큰 거래 (high), 04-27 작은 거래 (today), 04-28 거래 0 (is-zero)
      const rows = [
        { spent_at: '2026-04-11T10:00:00Z', amount_krw: 1490000 },
        { spent_at: '2026-04-27T10:00:00Z', amount_krw: 5000 },
      ];
      const ok = window.todayExpenses.patchCalendarFromRows(rows, { todayDay: 27 });
      const c11 = root.querySelector('[data-date="04-11"]');
      const c27 = root.querySelector('[data-date="04-27"]');
      const c28 = root.querySelector('[data-date="04-28"]');
      const result = {
        ok,
        c11Amount: c11?.querySelector('.exp-month-day-amount')?.textContent,
        c11High: c11?.querySelector('.exp-month-day-amount')?.classList.contains('high'),
        c11IsZero: c11?.classList.contains('is-zero'),
        c27Amount: c27?.querySelector('.exp-month-day-amount')?.textContent,
        c27IsZero: c27?.classList.contains('is-zero'),
        c28Amount: c28?.querySelector('.exp-month-day-amount')?.textContent,
        c28IsZero: c28?.classList.contains('is-zero'),
      };
      root.remove();
      return result;
    });
    expect(result.ok).toBe(true);
    expect(result.c11Amount).toBe('1,490,000');
    expect(result.c11High).toBe(true);
    expect(result.c11IsZero).toBe(false);
    expect(result.c27Amount).toBe('5,000');
    // today 는 거래 적어도 is-zero 안 매기는 mocks 정책
    expect(result.c27IsZero).toBe(false);
    // 04-28 거래 0 → is-zero
    expect(result.c28Amount).toBe('');
    expect(result.c28IsZero).toBe(true);
  });

  test('extractExpenseFromForm — DOM input 에서 데이터 추출 + .is-active category', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const data = await page.evaluate(() => {
      const root = document.createElement('div');
      root.innerHTML = `
        <input id="expModalAmount" value="21,500" />
        <input id="expModalDatetime" value="2026-04-15T12:30" />
        <input id="expModalMerchant" value="파인만컴" />
        <input id="expModalCard" value="삼성카드" />
        <input id="expModalMemo" value="점심" />
        <input id="expModalUrl" value="https://example.com" />
        <div id="expModalCatGrid">
          <button class="exp-cat-cell" data-cat="외식">외식</button>
          <button class="exp-cat-cell is-active" data-cat="간식">간식</button>
        </div>
      `;
      document.body.appendChild(root);
      const result = window.todayExpenses.extractExpenseFromForm();
      root.remove();
      return result;
    });
    expect(data.amount_krw).toBe(21500);
    expect(data.merchant).toBe('파인만컴');
    expect(data.card).toBe('삼성카드');
    expect(data.memo).toBe('점심');
    expect(data.merchant_url).toBe('https://example.com');
    expect(data.category).toBe('간식');
    expect(typeof data.spent_at).toBe('string');
    expect(data.spent_at).toContain('2026-04-15');
  });

  test('populateExpenseForm — Dexie row → 모달 폼 채움 (.is-active 카테고리 포함)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => {
      const root = document.createElement('div');
      root.innerHTML = `
        <input id="expModalAmount" />
        <input id="expModalDatetime" />
        <input id="expModalMerchant" />
        <input id="expModalCard" />
        <input id="expModalMemo" />
        <input id="expModalUrl" />
        <div id="expModalCardLabel"></div>
        <div id="expModalDtText"></div>
        <div id="expModalCatGrid">
          <button class="exp-cat-cell" data-cat="외식">외식</button>
          <button class="exp-cat-cell" data-cat="간식">간식</button>
          <button class="exp-cat-cell" data-cat="패션">패션</button>
        </div>
      `;
      document.body.appendChild(root);
      const ok = window.todayExpenses.populateExpenseForm({
        id: 'r-1',
        amount_krw: 305000,
        spent_at: '2026-04-27T19:00:00+09:00',
        merchant: '네이버페이',
        card: '신한카드',
        memo: '봄 자켓',
        merchant_url: 'https://shop.example.com',
        category: '패션',
      });
      const result = {
        ok,
        amount: document.getElementById('expModalAmount').value,
        merchant: document.getElementById('expModalMerchant').value,
        memo: document.getElementById('expModalMemo').value,
        url: document.getElementById('expModalUrl').value,
        card: document.getElementById('expModalCard').value,
        cardLabel: document.getElementById('expModalCardLabel').textContent,
        activeCat: document.querySelector('#expModalCatGrid .exp-cat-cell.is-active')?.getAttribute('data-cat'),
      };
      root.remove();
      return result;
    });
    expect(result.ok).toBe(true);
    expect(result.amount).toBe('305,000');
    expect(result.merchant).toBe('네이버페이');
    expect(result.memo).toBe('봄 자켓');
    expect(result.url).toBe('https://shop.example.com');
    expect(result.card).toBe('신한카드');
    expect(result.cardLabel).toBe('신한카드');
    expect(result.activeCat).toBe('패션');
  });

  test('renderTimelineFromRows — .exp-tl-list 재구성 + .is-cont + openExpenseModal onclick', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => {
      const root = document.createElement('div');
      root.innerHTML = `<div class="exp-tab-panel--feed"><div class="exp-tl-list">FIX</div></div>`;
      document.body.appendChild(root);
      // 같은 날 2건 + 다른 날 1건 → 그룹 헤더 + .is-cont
      const rows = [
        { id: 'a1', spent_at: '2026-04-19T18:00:00Z', amount_krw: 50000, brand: '회식 1차', category: '외식', card: '현대카드' },
        { id: 'a2', spent_at: '2026-04-19T20:00:00Z', amount_krw: 22570, brand: '회식 2차', category: '외식', card: '현대카드' },
        { id: 'b1', spent_at: '2026-04-15T12:00:00Z', amount_krw: 21500, brand: '파인만컴', category: '외식', card: '삼성카드' },
      ];
      const ok = window.todayExpenses.renderTimelineFromRows(rows, { todayDay: 27 }, document, 2026);
      const list = root.querySelector('.exp-tl-list');
      const allRows = [...list.querySelectorAll('.exp-tl-row')];
      const isContCount = allRows.filter((r) => r.classList.contains('is-cont')).length;
      const firstRowOnclick = allRows[0]?.getAttribute('onclick');
      const a2Onclick = list.querySelector('[data-tx-id="a2"]')?.getAttribute('onclick');
      const html = list.innerHTML;
      const result = {
        ok,
        rowCount: allRows.length,
        isContCount,
        // 04-19 desc 우선 → 첫 row 가 a1 (먼저 시간순?). spent_at desc 정렬이 listExpensesByMonth 의 책임.
        // 여기선 입력 순서대로 들어왔다고 가정 — date 그룹화로 04-19 가 04-15 보다 위.
        firstRowDataId: allRows[0]?.getAttribute('data-tx-id'),
        firstRowOnclick,
        a2Onclick,
        containsCont: isContCount === 1, // 04-19 두 번째 row 만 cont
        containsHigh: html.includes('is-high'),
      };
      root.remove();
      return result;
    });
    expect(result.ok).toBe(true);
    expect(result.rowCount).toBe(3);
    expect(result.isContCount).toBe(1);
    expect(result.firstRowOnclick).toContain("openExpenseModal('edit'");
    expect(result.a2Onclick).toContain("openExpenseModal('edit', 'a2')");
  });

  test('patchRankSectionFromRows — 1위 카드 부분 patch + 2~N위 그리드 + onclick 보존', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => {
      const root = document.createElement('div');
      root.innerHTML = `
        <div class="exp-rank-section">
          <div class="exp-headline-title">4월에는 <strong>FIX</strong>에 많이 쓰고 있어요</div>
          <div class="exp-rank-1" onclick="origRank1Handler()">
            <span class="exp-rank-1__num">FIX</span>
            <span class="exp-rank-1__avatar">FIX</span>
            <div class="exp-rank-1__info">
              <span class="exp-rank-1__name">FIX</span>
              <span class="exp-rank-1__meta">FIX</span>
            </div>
            <span class="exp-rank-1__amt">FIX</span>
          </div>
          <div class="exp-rank-grid">FIX-GRID</div>
        </div>
      `;
      document.body.appendChild(root);
      // 4 가맹점 — 쿠팡 (다중 거래 합산 1위), 파인만컴, 주식회사우아, 양화정
      const rows = [
        { amount_krw: 1000000, brand: '쿠팡', category: '온라인쇼핑' },
        { amount_krw: 550000, brand: '쿠팡', category: '온라인쇼핑' },
        { amount_krw: 300000, brand: '파인만컴', category: '외식' },
        { amount_krw: 90000, brand: '주식회사우아', category: '배달' },
        { amount_krw: 60000, brand: '양화정', category: '외식' },
      ];
      const ok = window.todayExpenses.patchRankSectionFromRows(rows);
      const rank1 = root.querySelector('.exp-rank-1');
      const grid = root.querySelector('.exp-rank-grid');
      const cards = [...grid.querySelectorAll('.exp-rank-card')];
      const result = {
        ok,
        headlineStrong: root.querySelector('.exp-headline-title strong')?.textContent,
        rank1Num: rank1.querySelector('.exp-rank-1__num')?.textContent,
        rank1Avatar: rank1.querySelector('.exp-rank-1__avatar')?.textContent,
        rank1Name: rank1.querySelector('.exp-rank-1__name')?.textContent,
        rank1Meta: rank1.querySelector('.exp-rank-1__meta')?.textContent,
        rank1Amt: rank1.querySelector('.exp-rank-1__amt')?.textContent,
        rank1Onclick: rank1.getAttribute('onclick'),
        gridCardCount: cards.length,
        gridCard0: {
          num: cards[0]?.querySelector('.exp-rank-card__num')?.textContent,
          chip: cards[0]?.querySelector('.exp-rank-card__chip')?.textContent,
          name: cards[0]?.querySelector('.exp-rank-card__name')?.textContent,
          amt: cards[0]?.querySelector('.exp-rank-card__amt')?.textContent,
          onclick: cards[0]?.getAttribute('onclick'),
        },
        gridCard2Name: cards[2]?.querySelector('.exp-rank-card__name')?.textContent,
      };
      root.remove();
      return result;
    });
    expect(result.ok).toBe(true);
    expect(result.headlineStrong).toBe('쿠팡');
    expect(result.rank1Num).toBe('1');
    expect(result.rank1Avatar).toBe('쿠');
    expect(result.rank1Name).toBe('쿠팡');
    // share = 1550000 / 2000000 = 77.5%
    expect(result.rank1Meta).toBe('2건 · 77.5%');
    expect(result.rank1Amt).toBe('155만원');
    expect(result.rank1Onclick).toContain("openMerchantDetail('쿠팡', event)");
    // 2~N위 그리드 — 3개 (쿠팡 1위 분리 후 나머지 3 가맹점)
    expect(result.gridCardCount).toBe(3);
    expect(result.gridCard0.num).toBe('2');
    expect(result.gridCard0.chip).toBe('외식');
    expect(result.gridCard0.name).toBe('파인만컴');
    expect(result.gridCard0.amt).toBe('30만원');
    expect(result.gridCard0.onclick).toContain("openMerchantDetail('파인만컴', event)");
    expect(result.gridCard2Name).toBe('양화정');
  });

  test('patchRankSectionFromRows — rows=0 → no-op (mocks fixture 보존)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => {
      const root = document.createElement('div');
      root.innerHTML = `
        <div class="exp-rank-section">
          <div class="exp-rank-1"><span class="exp-rank-1__name">FIXTURE</span></div>
          <div class="exp-rank-grid">FIXTURE-GRID</div>
        </div>
      `;
      document.body.appendChild(root);
      const ok = window.todayExpenses.patchRankSectionFromRows([]);
      const result = {
        ok,
        rank1Name: root.querySelector('.exp-rank-1__name')?.textContent,
        gridText: root.querySelector('.exp-rank-grid')?.textContent,
      };
      root.remove();
      return result;
    });
    expect(result.ok).toBe(false);
    expect(result.rank1Name).toBe('FIXTURE');
    expect(result.gridText).toBe('FIXTURE-GRID');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Wave 11.6.3.2 — 일자 popover hijack
// ───────────────────────────────────────────────────────────────────────────

test.describe('Wave 11.6.3.2 day popover', () => {
  test('window.todayExpenses 의 popover 함수 4종 노출', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const ok = await page.evaluate(() => {
      const e = window.todayExpenses;
      return ['rowToPopoverHtml','monthDayToIsoDate','dayOfWeekFromMonthDay','patchDayPopoverFromRows','patchDayPopoverHandlers']
        .every((k) => typeof e?.[k] === 'function');
    });
    expect(ok).toBe(true);
  });

  test('patchDayPopoverFromRows — 1건 시 foot.style.display="none"', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => {
      const root = document.createElement('div');
      root.innerHTML = `
        <div id="expDayPopover">
          <span class="exp-day-detail__date"></span>
          <div class="expense-list"></div>
          <div class="exp-day-detail__foot">
            <span class="exp-day-detail__foot-count"></span>
            <span class="exp-day-detail__foot-sum"></span>
          </div>
        </div>
      `;
      document.body.appendChild(root);
      const r = window.todayExpenses.patchDayPopoverFromRows({
        monthDay: '04-12',
        rows: [{ id: 'a', category: '배달', merchant: '주식회사우아', amount_krw: 11880 }],
        doc: document,
      });
      const popover = document.getElementById('expDayPopover');
      const data = {
        applied: r.applied,
        count: r.count,
        date: popover.querySelector('.exp-day-detail__date').textContent,
        listHtml: popover.querySelector('.expense-list').innerHTML,
        footDisplay: popover.querySelector('.exp-day-detail__foot').style.display,
      };
      root.remove();
      return data;
    });
    expect(result.applied).toBe(true);
    expect(result.count).toBe(1);
    expect(result.date).toMatch(/^4월 12일 [일월화수목금토]요일$/);
    expect(result.listHtml).toContain('주식회사우아');
    expect(result.listHtml).toContain('11,880');
    expect(result.footDisplay).toBe('none');
  });

  test('patchDayPopoverFromRows — 2건+ 시 foot 표시 + count + sum', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => {
      const root = document.createElement('div');
      root.innerHTML = `
        <div id="expDayPopover">
          <span class="exp-day-detail__date"></span>
          <div class="expense-list"></div>
          <div class="exp-day-detail__foot">
            <span class="exp-day-detail__foot-count"></span>
            <span class="exp-day-detail__foot-sum"></span>
          </div>
        </div>
      `;
      document.body.appendChild(root);
      window.todayExpenses.patchDayPopoverFromRows({
        monthDay: '04-25',
        rows: [
          { id: 'a', category: '편의점', merchant: 'GS25', amount_krw: 5000 },
          { id: 'b', category: '간식', merchant: '빵집', amount_krw: 3000 },
        ],
        doc: document,
      });
      const popover = document.getElementById('expDayPopover');
      const data = {
        footDisplay: popover.querySelector('.exp-day-detail__foot').style.display,
        footCount: popover.querySelector('.exp-day-detail__foot-count').textContent,
        footSum: popover.querySelector('.exp-day-detail__foot-sum').innerHTML,
        rowCount: popover.querySelectorAll('.exp-popover-row').length,
      };
      root.remove();
      return data;
    });
    expect(result.footDisplay).toBe('');
    expect(result.footCount).toBe('2건');
    expect(result.footSum).toContain('8,000');
    expect(result.rowCount).toBe(2);
  });

  test('patchDayPopoverFromRows — 0건 시 empty 메시지 + foot 숨김', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => {
      const root = document.createElement('div');
      root.innerHTML = `
        <div id="expDayPopover">
          <span class="exp-day-detail__date"></span>
          <div class="expense-list"></div>
          <div class="exp-day-detail__foot">
            <span class="exp-day-detail__foot-count"></span>
            <span class="exp-day-detail__foot-sum"></span>
          </div>
        </div>
      `;
      document.body.appendChild(root);
      const r = window.todayExpenses.patchDayPopoverFromRows({
        monthDay: '04-01',
        rows: [],
        doc: document,
      });
      const popover = document.getElementById('expDayPopover');
      const data = {
        applied: r.applied,
        count: r.count,
        listHtml: popover.querySelector('.expense-list').innerHTML,
        footDisplay: popover.querySelector('.exp-day-detail__foot').style.display,
      };
      root.remove();
      return data;
    });
    expect(result.applied).toBe(true);
    expect(result.count).toBe(0);
    expect(result.listHtml).toContain('이 날의 거래가 없습니다');
    expect(result.footDisplay).toBe('none');
  });

});

test.describe('별 wave C — openExpSearch Dexie wiring', () => {
  test('window.todayExpenses — 신규 3 함수 노출', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const exposed = await page.evaluate(() => {
      const e = window.todayExpenses;
      const required = ['rowToExpSearchHtml', 'renderExpSearchDexie', 'patchExpSearchHandlers'];
      return required.filter((k) => typeof (e || {})[k] !== 'function');
    });
    expect(exposed).toEqual([]);
  });

  test('rowToExpSearchHtml — 직렬화 + XSS escape', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => {
      const e = window.todayExpenses;
      return {
        normal: e.rowToExpSearchHtml({ merchant: '쿠팡', card: '신한카드', category: '쇼핑', amount_krw: 50000 }),
        xss: e.rowToExpSearchHtml({ merchant: '<script>x</script>', card: 'A&B', category: '"q"', amount_krw: 100 }),
      };
    });
    expect(result.normal).toContain('쿠팡');
    expect(result.normal).toContain('50,000');
    expect(result.xss).not.toContain('<script>');
    expect(result.xss).toContain('&lt;script&gt;');
    expect(result.xss).toContain('A&amp;B');
  });

  test('renderExpSearchDexie — fake doc q 빈 → placeholder', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(async () => {
      const body = { innerHTML: '' };
      const fakeDoc = { getElementById: (id) => (id === 'expSearchResults' ? body : null) };
      const ok = await window.todayExpenses.renderExpSearchDexie('', fakeDoc);
      return { ok, html: body.innerHTML };
    });
    expect(result.ok).toBe(true);
    expect(result.html).toContain('거래 키워드를 입력하세요');
  });
});
