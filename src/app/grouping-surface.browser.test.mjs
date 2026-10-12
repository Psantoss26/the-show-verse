import assert from 'node:assert/strict';
import test from 'node:test';

test('grouping surface matches search glass before and after pinning on mobile and desktop', {
  skip: !process.env.PLAYWRIGHT_MODULE,
}, async () => {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.goto(process.env.TEST_BASE_URL || 'http://localhost:3000');
    // Exercise the real application stylesheet without requiring a signed-in
    // account with grouped favorites/watchlist data.
    await page.evaluate(() => {
      const fixture = document.createElement('div');
      fixture.id = 'grouping-style-fixture';
      fixture.setAttribute('data-group-divider', '');
      fixture.innerHTML = '<div class="sv-group-surface bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg"></div><input class="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg">';
      document.body.append(fixture);
    });
    for (const width of [390, 639, 640, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      for (const pinned of [false, true, false]) {
        const styles = await page.evaluate((pinned) => {
          const fixture = document.getElementById('grouping-style-fixture');
          fixture.dataset.menuPinned = String(pinned);
          const read = (el) => {
            const s = getComputedStyle(el);
            return { image: s.backgroundImage, color: s.backgroundColor, blur: s.backdropFilter };
          };
          return { group: read(fixture.firstElementChild), search: read(fixture.lastElementChild) };
        }, pinned);
        assert.deepEqual(styles.group, styles.search, `matching glass at ${width}px, pinned=${pinned}`);
        assert.equal(styles.group.image === 'none', pinned, 'gradient only disappears when pinned');
      }
    }
  } finally {
    await browser.close();
  }
});
