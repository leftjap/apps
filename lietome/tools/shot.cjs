// 사용: node tools/shot.cjs <html 경로> <png 경로> [폭] [높이]
const { chromium } = require('/Users/gio_c/apps/pick/node_modules/.pnpm/playwright@1.60.0/node_modules/playwright');
(async () => {
  const [, , src, out, w = '1180', h = '900'] = process.argv;
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
  await pg.goto(src.startsWith('http') ? src : 'file://' + src);
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: out, fullPage: true });
  await b.close();
})();
