import assert from 'node:assert/strict';
import test from 'node:test';

test('collections and summary cards do not wait for likes unless sorting needs them', {
  skip: !process.env.PLAYWRIGHT_MODULE,
}, async () => {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    args: ['--no-sandbox'],
  });
  try {
    for (const [width, sortMode] of [[390, 'items_desc'], [1280, 'items_desc'], [390, 'likes_desc'], [1280, 'likes_asc']]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.addInitScript((sortMode) => {
        localStorage.setItem('showverse:lists:menu:v2', JSON.stringify({ source: 'collections', viewMode: 'grid', sortMode, query: '' }));
      }, sortMode);
      let releaseCatalog;
      let releaseLikes;
      const catalogReady = new Promise((resolve) => { releaseCatalog = resolve; });
      const likesReady = new Promise((resolve) => { releaseLikes = resolve; });
      let likesRequested = false;
      await page.route('**/api/tmdb/collections/featured*', async (route) => {
        await catalogReady;
        await route.fulfill({ json: { collections: [
          { id: '10', name: 'Saga Alfa', item_count: 5 },
          { id: '1241', name: 'Saga Beta', item_count: 2 },
        ] } });
      });
      await page.route('**/api/community/collections/likes?*', async (route) => {
        likesRequested = true;
        await likesReady;
        await route.fulfill({ json: { likes: { 10: { likes: 1 }, 1241: { likes: 6 } } } });
      });
      await page.route('**/api/tmdb/collection?*', (route) => route.fulfill({ json: { items: [] } }));
      await page.goto(`${process.env.TEST_BASE_URL || 'http://localhost:3000'}/lists`, { waitUntil: 'domcontentloaded' });
      const stats = page.locator('[data-lists-stats="collections"]:visible');
      await stats.waitFor();
      // The catalog is still held: likes must already be in flight.
      for (let i = 0; i < 50 && !likesRequested; i++) await page.waitForTimeout(100);
      assert.ok(likesRequested, 'likes start in parallel with the catalog');
      releaseCatalog();
      await stats.locator('[data-list-stat="count"][aria-busy="false"]').waitFor();
      assert.match(await stats.locator('[data-list-stat="count"]').innerText(), /2/);
      assert.match(await stats.locator('[data-list-stat="items"]').innerText(), /7/);
      assert.equal(await stats.locator('[data-list-stat="likes"]').getAttribute('aria-busy'), 'true');
      const initialBox = await stats.boundingBox();
      const cards = page.locator('[data-lists-content="collections"] a[href^="/lists/collection/"]');
      if (sortMode.startsWith('likes_')) assert.equal(await cards.count(), 0);
      else await cards.first().waitFor({ state: 'visible' });
      releaseLikes();
      await stats.locator('[data-list-stat="likes"][aria-busy="false"]').waitFor();
      assert.match(await stats.locator('[data-list-stat="likes"]').innerText(), /7/);
      await cards.first().waitFor({ state: 'visible' });
      const expectedFirst = sortMode === 'likes_desc' ? '1241' : '10';
      assert.equal(await cards.first().getAttribute('href'), `/lists/collection/${expectedFirst}`);
      const finalBox = await stats.boundingBox();
      assert.ok(Math.abs(initialBox.height - finalBox.height) < 1, 'resolving counts must not resize the header');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
