import { test, expect } from '@playwright/test';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * 사이드바 스크롤 영역 — 2026-09-29 실기기 보고 회귀 방지.
 * 모바일 드로어에서 캘린더 아래 리센츠만 스크롤돼, 캘린더 위에서는 아무것도 안 움직이고
 * 리센츠는 글 두 개 높이(≈149px @375×812)만 보였다.
 *
 * 목업 셸(mocks/today-mac.html)을 그대로 연다 — 앱이 이 파일을 ?raw 로 주입하므로 사이드바
 * CSS·마크업이 같다. 캘린더 28칸·리센츠 30행·전체 보기는 실제 앱에서 JS 가 그리므로 여기서 채운다.
 */
const MOCK_URL = pathToFileURL(fileURLToPath(new URL('../mocks/today-mac.html', import.meta.url))).href;

async function fillSidebar(page) {
  await page.evaluate(() => {
    document.getElementById('sbCalGrid').innerHTML = Array.from(
      { length: 28 },
      (_, i) => `<div class="sb__cal-cell is-on">${i + 1}</div>`,
    ).join('');
    // 실제 앱 렌더(entries.renderRecentsFromRows) 와 같은 2줄 행 + 리스트 뒤 전체 보기(ensureRecentsMore)
    const list = document.getElementById('recentsList');
    list.innerHTML = Array.from({ length: 30 }, (_, i) => `
      <div class="sb__item sb__item--recent is-doc" data-doc-id="d${i}">
        <div class="rc-main"><span class="rc-title">글 ${i + 1}</span></div>
        <div class="rc-sub">${i}일 전</div>
      </div>`).join('');
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'sb__more';
    more.textContent = '전체 보기';
    list.insertAdjacentElement('afterend', more);
  });
}

const topOf = (page, sel) => page.locator(sel).evaluate((el) => el.getBoundingClientRect().top);

async function wheelOver(page, sel, dy) {
  const box = await page.locator(sel).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, dy);
}

test('모바일 드로어: 캘린더 위에서 스크롤하면 메뉴·캘린더·리센츠가 함께 올라가고 상단 줄·계정 줄은 고정', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(MOCK_URL);
  await fillSidebar(page);
  await page.evaluate(() => { document.body.dataset.drawerOpen = 'true'; });
  await expect.poll(() => page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().left)).toBe(0);

  const before = {
    top: await topOf(page, '.sb__top'),
    cal: await topOf(page, '.sb__cal'),
    footer: await topOf(page, '.sb__footer'),
  };
  await wheelOver(page, '.sb__cal', 400);

  await expect.poll(() => topOf(page, '.sb__cal')).toBeLessThan(before.cal - 200);
  expect(await topOf(page, '.sb__top')).toBe(before.top);
  expect(await topOf(page, '.sb__footer')).toBe(before.footer);
  // 리센츠가 따로 스크롤된 게 아니라 가운데 영역 전체가 움직였다
  expect(await page.locator('.sb__group--recents').evaluate((el) => el.scrollTop)).toBe(0);

  // 끝까지 내리면 전체 보기가 계정 줄 위에 온전히 보인다 — 휠은 상단 줄과 계정 줄 사이 화면 안 지점에서
  // (리센츠 그룹은 이제 30행 전체 높이라 중심점이 화면 밖)
  const topBar = await page.locator('.sb__top').boundingBox();
  await page.mouse.move(topBar.x + topBar.width / 2, (topBar.y + topBar.height + before.footer) / 2);
  await page.mouse.wheel(0, 5000);
  await expect.poll(async () => {
    const more = await page.locator('.sb__more').boundingBox();
    return more.y + more.height <= before.footer;
  }).toBe(true);
});

test('PC: 캘린더는 고정되고 리센츠만 스크롤된다 (캘린더 작업지시서 §8)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(MOCK_URL);
  await fillSidebar(page);

  const calBefore = await topOf(page, '.sb__cal');
  await wheelOver(page, '.sb__cal', 400);
  await wheelOver(page, '.sb__group--recents', 400);

  await expect.poll(() => page.locator('.sb__group--recents').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await topOf(page, '.sb__cal')).toBe(calBefore);
});
