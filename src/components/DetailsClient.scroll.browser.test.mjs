import assert from 'node:assert/strict';
import test from 'node:test';

// Run against a local app with PLAYWRIGHT_MODULE pointing to an installed
// Playwright module. No browser dependency is required for the unit suite.
test('mobile scoreboard starts compact, expands on scroll and collapses at the top', {
  skip: !process.env.PLAYWRIGHT_MODULE,
}, async () => {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    args: ['--no-sandbox'],
  });
  try {
    for (const reducedMotion of ['no-preference', 'reduce']) {
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion,
      });
      await page.goto(`${process.env.TEST_BASE_URL || 'http://localhost:3000'}/details/movie/550`);
      await page.locator('[data-mobile-reveal-stats] [data-scoreboard-stats]').waitFor({ state: 'attached' });
      await page.waitForTimeout(2500);
      const result = await page.evaluate(async () => {
        const row = document.querySelector('[data-mobile-reveal-stats] [data-scoreboard-stats]');
        const holder = row.closest('[data-mobile-reveal-stats]');
        const initialHidden = holder.dataset.mobileRevealStats === 'hidden' && row.inert;
        const samples = [];
        for (let i = 0; i <= 40; i++) {
          window.scrollTo({ top: i * 8, behavior: 'instant' });
          await new Promise((resolve) => setTimeout(resolve, 20));
          samples.push({ height: row.getBoundingClientRect().height, state: holder.dataset.mobileRevealStats });
        }
        const revealed = holder.dataset.mobileRevealStats === 'shown' && !row.inert;
        window.scrollTo({ top: 0, behavior: 'instant' });
        const collapseSamples = [];
        const started = performance.now();
        while (performance.now() - started < 550) {
          await new Promise(requestAnimationFrame);
          collapseSamples.push({
            height: row.getBoundingClientRect().height,
            cover: getComputedStyle(holder).getPropertyValue('--mobile-cover-h').trim(),
          });
        }
        return {
          samples, collapseSamples, revealed, initialHidden,
          collapsedHeight: row.getBoundingClientRect().height,
          reset: holder.dataset.mobileRevealStats === 'hidden' && row.inert,
          overflow: document.documentElement.scrollWidth > innerWidth,
          duration: getComputedStyle(row).transitionDuration,
        };
      });
      const heights = result.samples.map((sample) => sample.height);
      assert.ok(heights[0] <= 2, 'compact stats must not reserve an empty strip');
      assert.ok(heights.at(-1) > 20, 'scroll must expand the stats row');
      assert.ok(result.collapsedHeight <= 2, 'returning to the top must restore the compact shape');
      if (reducedMotion === 'no-preference') {
        assert.ok(heights.some((height) => height > 2 && height < heights.at(-1) - 2), 'expansion must have intermediate animation frames');
        assert.ok(result.collapseSamples.some(({ height }) => height > 2 && height < heights.at(-1) - 2), 'collapse must also have intermediate frames');
      }
      assert.equal(new Set(result.collapseSamples.map(({ cover }) => cover)).size, 1, 'stats animation must not resize the poster');
      assert.ok(result.initialHidden, 'async stats must start outside the focus order');
      assert.ok(result.revealed, 'stats must reveal and become accessible');
      assert.ok(result.reset, 'hidden stats must leave the focus order');
      assert.equal(result.overflow, false);
      if (reducedMotion === 'reduce') assert.ok(parseFloat(result.duration) <= 0.001);
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.waitForTimeout(300);
      assert.equal(await page.locator('[data-scoreboard-stats]').first().evaluate((row) => row.inert), false);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test('mobile hero logo shadow can fade beyond the poster frame', {
  skip: !process.env.PLAYWRIGHT_MODULE,
}, async () => {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    args: ['--no-sandbox'],
  });
  try {
    for (const [width, height, deviceScaleFactor] of [[360, 740, 3], [390, 844, 2], [550, 950, 1.25]]) {
      const page = await browser.newPage({
        viewport: { width, height }, deviceScaleFactor, isMobile: true, hasTouch: true,
      });
      await page.goto(`${process.env.TEST_BASE_URL || 'http://localhost:3000'}/details/movie/27205`);
      const frame = page.locator('.poster-aspect-box');
      await frame.waitFor({ state: 'visible' });
      const clipping = await frame.evaluate((el) => {
        const elements = [el, el.closest('.poster-tilt-corner-mask')];
        return elements.map((node) => {
          const style = getComputedStyle(node);
          return { overflow: style.overflowY, contain: style.contain };
        });
      });
      for (const style of clipping) {
        assert.equal(style.overflow, 'visible', 'the logo shadow must not end at the poster boundary');
        assert.doesNotMatch(style.contain, /paint|strict|content/, 'paint containment clips the shadow too');
      }
      await page.setViewportSize({ width: 1280, height: 900 });
      assert.equal(await frame.evaluate((el) => getComputedStyle(el).overflowY), 'hidden');
      assert.match(await frame.evaluate((el) => getComputedStyle(el).contain), /paint/);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
