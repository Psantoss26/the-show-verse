import assert from 'node:assert/strict';
import test from 'node:test';

// PLAYWRIGHT_MODULE points to an existing Playwright installation; the app
// needs to be running at TEST_BASE_URL (default localhost:3000).
const enabled = Boolean(process.env.PLAYWRIGHT_MODULE);

async function launch() {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
  return chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    args: ['--no-sandbox'],
  });
}

async function instrument(page, { docked, contentView, interrupt = false }) {
  await page.addInitScript(({ docked, contentView, interrupt }) => {
    localStorage.setItem('showverse:detailModalView', docked ? 'docked' : 'overlay');
    localStorage.setItem('showverse:detailModalContentView', contentView);
    window.drawerAnimations = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      const animation = animate.call(this, keyframes, options);
      if (this.classList.contains('sv-drawer-panel') && keyframes.transform) {
        window.drawerAnimations.push({ transform: keyframes.transform, duration: options.duration });
        if (interrupt && window.drawerAnimations.length === 1) {
          setTimeout(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })), 60);
        }
      }
      return animation;
    };
  }, { docked, contentView, interrupt });
}

for (const width of [1280, 834]) {
  for (const contentView of ['modal', 'mobile']) {
    test(`drawer completes native entry and exit at ${width}px with ${contentView} content`, { skip: !enabled }, async () => {
      const browser = await launch();
      try {
        for (const docked of [false, true]) {
          const page = await browser.newPage({
            viewport: { width, height: 1000 }, isMobile: width < 1024, hasTouch: width < 1024,
          });
          await instrument(page, { docked, contentView });
          await page.goto(`${process.env.TEST_BASE_URL || 'http://localhost:3000'}/favorites?preview=movie-550`, { waitUntil: 'domcontentloaded' });
          const panel = page.locator('.sv-drawer-panel');
          await panel.waitFor();
          await page.waitForFunction(() => document.querySelector('.sv-drawer-panel')?.style.willChange === 'auto');
          const opened = await panel.evaluate((el) => ({
            right: el.getBoundingClientRect().right,
            viewport: innerWidth,
            animations: window.drawerAnimations,
            margin: document.querySelector('[data-detail-page-content]').style.marginRight,
          }));
          assert.ok(opened.animations.some(({ transform, duration }) => duration > 0 && transform.some((value) => value.includes('100%'))),
            'entry must use a native transform animation instead of per-frame JS writes');
          assert.ok(Math.abs(opened.right - opened.viewport) < 1, 'open panel must reach the right edge');
          assert.equal(Boolean(opened.margin), docked);
          const exiting = await page.evaluate(async () => {
            document.querySelector('[aria-label="Cerrar modal"]').click();
            await new Promise(requestAnimationFrame);
            await new Promise(requestAnimationFrame);
            return {
              exists: Boolean(document.querySelector('.sv-drawer-panel')),
              margin: document.querySelector('[data-detail-page-content]').style.marginRight,
              animations: window.drawerAnimations,
            };
          });
          assert.ok(exiting.exists, 'panel must stay mounted for its exit');
          assert.equal(exiting.margin, '', 'docked page must recover its width while the panel exits, not after');
          await panel.waitFor({ state: 'detached' });
          assert.ok(await page.evaluate(() => window.drawerAnimations.some(({ transform, duration }) =>
            duration > 0 && transform.at(-1).includes('100%'))), 'exit must also use a native transform');
          assert.equal(await page.locator('[data-detail-page-content]').evaluate((el) => el.style.marginRight), '');
          assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--sv-detail-drawer-inset')), '');
          await page.close();
        }
      } finally {
        await browser.close();
      }
    });
  }
}

test('drawer supports reduced motion and closing during entry', { skip: !enabled }, async () => {
  const browser = await launch();
  try {
    for (const reducedMotion of ['reduce', 'no-preference']) {
      const page = await browser.newPage({ viewport: { width: 834, height: 1000 }, isMobile: true, hasTouch: true, reducedMotion });
      await instrument(page, { docked: true, contentView: 'mobile', interrupt: reducedMotion !== 'reduce' });
      await page.goto(`${process.env.TEST_BASE_URL || 'http://localhost:3000'}/favorites?preview=movie-550`, { waitUntil: 'domcontentloaded' });
      if (reducedMotion === 'reduce') {
        await page.locator('.sv-drawer-panel').waitFor();
        await page.waitForFunction(() => document.querySelector('.sv-drawer-panel')?.style.willChange === 'auto');
        assert.equal(await page.evaluate(() => window.drawerAnimations.some(({ duration }) => duration > 0)), false);
        await page.keyboard.press('Escape');
      } else {
        await page.waitForFunction(() => window.drawerAnimations.length >= 2);
      }
      await page.locator('.sv-drawer-panel').waitFor({ state: 'detached' });
      assert.equal(await page.locator('[data-detail-page-content]').evaluate((el) => el.style.marginRight), '');
      assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--sv-detail-drawer-inset')), '');
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
