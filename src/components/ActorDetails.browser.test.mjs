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

test('actor action buttons match DetailsClient sizing and have distinct colors', {
  skip: !process.env.PLAYWRIGHT_MODULE,
}, async () => {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    args: ['--no-sandbox'],
  });
  try {
    const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';

    // Test sizing on mobile (390px) and desktop (1280px)
    for (const width of [390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      await page.goto(`${baseUrl}/details/person/287`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);

      const buttons = page.locator('[data-group-id="actor-details-actions"]');
      const count = await buttons.count();
      assert.equal(count, 4, 'there should be 4 action buttons');

      const firstBox = await buttons.nth(0).boundingBox();
      const expectedSize = width < 640 ? 40 : 52;
      assert.ok(
        Math.abs(firstBox.width - expectedSize) <= 1,
        `actor action button width on ${width}px (${firstBox.width}) should match ${expectedSize}px`
      );
      assert.ok(
        Math.abs(firstBox.height - expectedSize) <= 1,
        `actor action button height on ${width}px (${firstBox.height}) should match ${expectedSize}px`
      );

      // Verify each button has a distinct hover/active glow color
      if (width === 1280) {
        const expectedTones = [
          'rgba(239, 68, 68',   // red
          'rgba(59, 130, 246',   // blue
          'rgba(168, 85, 247',  // purple
          'rgba(16, 185, 129',  // emerald
        ];
        for (let i = 0; i < 4; i++) {
          const btn = buttons.nth(i);
          await btn.hover();
          await page.waitForTimeout(150);
          const shadow = await btn.evaluate((el) => el.style.boxShadow);
          assert.ok(
            shadow.includes(expectedTones[i]),
            `button ${i} shadow (${shadow}) must contain ${expectedTones[i]}`
          );
        }
      }

      // Verify popularity widget matches IMDb styling with current rank visible
      const popularity = page.locator('dl:has(dt:has-text("POPULARIDAD"))');
      await popularity.waitFor({ state: 'visible' });
      const popText = await popularity.innerText();
      assert.ok(popText.includes('TMDb'), 'popularity widget must show TMDb');
      assert.ok(popText.includes('POPULARIDAD'), 'popularity widget must show POPULARIDAD');
      assert.ok(popText.includes('33'), 'popularity widget must show current rank position 33 by default');
      assert.ok(popText.includes('Los 500 mejores'), 'popularity widget must show Los 500 mejores');

      // Click to toggle compact rank view
      const popBtn = popularity.locator('button');
      await popBtn.click();
      await page.waitForTimeout(100);
      const toggledText = await popularity.innerText();
      assert.ok(toggledText.includes('33'), 'toggled popularity widget must still show rank 33');
      assert.ok(!toggledText.includes('Los 500 mejores'), 'toggled popularity widget hides extra text for compact view');

      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test('actor metadata displays deathday before height and place of birth in a single row', {
  skip: !process.env.PLAYWRIGHT_MODULE,
}, async () => {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    args: ['--no-sandbox'],
  });
  try {
    const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';

    for (const width of [390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      await page.goto(`${baseUrl}/details/person/8167`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);

      const metadata = page.locator('[data-actor-metadata]');
      await metadata.waitFor({ state: 'visible' });
      const text = await metadata.innerText();

      // Check content
      assert.ok(text.includes('12 de septiembre de 1973'), 'must contain birthday');
      assert.ok(text.includes('30 de noviembre de 2013'), 'must contain deathday');
      assert.ok(text.includes('1,88 m'), 'must contain height');
      assert.ok(text.includes('California, USA'), 'must contain simplified place of birth (California, USA)');
      assert.ok(!text.includes('Glendale'), 'must not contain local municipality (Glendale)');

      // Verify order: deathday before height, height before place
      const deathIndex = text.indexOf('30 de noviembre de 2013');
      const heightIndex = text.indexOf('1,88 m');
      const placeIndex = text.indexOf('California, USA');

      assert.ok(deathIndex !== -1 && heightIndex !== -1, 'both deathday and height must be present');
      assert.ok(deathIndex < heightIndex, 'deathday must be displayed BEFORE height');
      assert.ok(heightIndex < placeIndex, 'height must be displayed before place of birth');

      // Verify single-line layout (no multiline wrap)
      const box = await metadata.boundingBox();
      assert.ok(box.height < 40, `metadata row height (${box.height}px) must be a single line (<40px)`);

      await page.close();
    }
  } finally {
    await browser.close();
  }
});
