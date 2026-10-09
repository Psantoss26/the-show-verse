import assert from 'node:assert/strict';
import test from 'node:test';

test('actor portrait loads eagerly, keeps its frame and handles image failure', {
  skip: !process.env.PLAYWRIGHT_MODULE,
}, async () => {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    args: ['--no-sandbox'],
  });
  try {
    for (const width of [390, 1280]) {
      for (const reducedMotion of ['no-preference', 'reduce']) {
        const page = await browser.newPage({
          viewport: { width, height: 900 },
          isMobile: width < 640, hasTouch: width < 640, reducedMotion,
        });
        let releaseImage;
        const imageReady = new Promise((resolve) => { releaseImage = resolve; });
        await page.route('**/t/p/h632/**', async (route) => {
          await imageReady;
          await route.fulfill({
            contentType: 'image/svg+xml',
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="422" height="632"><rect width="422" height="632" fill="#456"/></svg>',
          });
        });
        await page.goto(`${process.env.TEST_BASE_URL || 'http://localhost:3000'}/details/person/287`, { waitUntil: 'domcontentloaded' });
        const frame = page.locator('[data-actor-portrait]:visible');
        await frame.waitFor({ state: 'visible' });
        const portrait = frame.locator('img');
        const before = await frame.boundingBox();
        assert.ok(before.height > 400, 'the frame reserves its height before the image arrives');
        assert.equal(await portrait.getAttribute('loading'), 'eager');
        assert.equal(await portrait.getAttribute('fetchpriority'), 'high');
        assert.equal(await frame.evaluate((el) => {
          for (let node = el; node; node = node.parentElement) {
            if (getComputedStyle(node).opacity === '0') return false;
          }
          return true;
        }), true, 'the hero must not start behind a hydration animation');
        releaseImage();
        await page.waitForFunction(() => {
          const img = document.querySelector('[data-actor-portrait] img');
          return img?.complete && img.naturalWidth > 0;
        });
        const after = await frame.boundingBox();
        assert.ok(Math.abs(before.height - after.height) < 1);
        assert.ok(Math.abs(before.y - after.y) < 1);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.unroute('**/t/p/h632/**');
        await page.route('**/t/p/h632/**', (route) => route.abort());
        await page.reload({ waitUntil: 'domcontentloaded' });
        await frame.getByRole('img', { name: 'Sin foto de Brad Pitt' }).waitFor();
        assert.ok(Math.abs((await frame.boundingBox()).height - before.height) < 1, 'failed images keep the same frame');
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
});
