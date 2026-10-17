import assert from 'node:assert/strict';
import test from 'node:test';

async function getChromium() {
  const mod = await import(process.env.PLAYWRIGHT_MODULE);
  return mod.chromium || mod.default?.chromium;
}

test('actor portrait loads eagerly, keeps its frame and handles image failure', {
  skip: !process.env.PLAYWRIGHT_MODULE,
}, async () => {
  const chromium = await getChromium();
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

test('actor action buttons match list details sizing and have distinct colors', {
  skip: !process.env.PLAYWRIGHT_MODULE,
}, async () => {
  const chromium = await getChromium();
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    args: ['--no-sandbox'],
  });
  try {
    const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';

    // Test sizing on mobile (360px, 390px), tablet (768px) and desktop (1280px)
    for (const width of [360, 390, 768, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      await page.goto(`${baseUrl}/details/person/287`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);

      const buttons = page.locator('[data-group-id="actor-details-actions"]');
      const count = await buttons.count();
      assert.equal(count, 4, 'there should be 4 action buttons');

      const firstBox = await buttons.nth(0).boundingBox();
      // DetailsClient's sizes: on phones its 8-button share of the row
      // (36.25px at 360, 40px at 390), 48px from `sm`, 52px from `lg`.
      const expectedSize = width === 360 ? 36.25 : width === 390 ? 40 : width < 1024 ? 48 : 52;
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

      // Verify popularity widget matches IMDb styling with current rank visible (without visible label)
      const popularity = page.locator('[data-actor-popularity]');
      await popularity.waitFor({ state: 'visible' });
      const popText = await popularity.innerText();
      assert.ok(popText.includes('33'), 'popularity widget must show current rank position 33 by default');

      // Verify presence of popularity circular icon and ranking variation delta
      const popIcon = popularity.locator('svg').first();
      await popIcon.waitFor({ state: 'visible' });
      const hasDelta = popText.includes('▲') || popText.includes('▼');
      assert.ok(hasDelta, 'popularity widget must show ranking variation delta indicator');

      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test('actor metadata displays deathday before height and place of birth in a single row', {
  skip: !process.env.PLAYWRIGHT_MODULE,
}, async () => {
  const chromium = await getChromium();
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

      // Phone: the data is the first tab ("Perfil", open by default) of the
      // info menu, revealed on scroll; from 640px it is the header row.
      const phone = width < 640;
      if (phone) {
        assert.equal(await page.locator('[data-actor-metadata]').isVisible(), false, 'the header row is hidden on phones');
        await page.evaluate(() => window.scrollTo(0, 450));
        const tabNames = await page.locator('button').evaluateAll((buttons) => buttons
          .map((button) => button.textContent.trim())
          .filter((label) => ['Perfil', 'Detalles', 'Popular', 'Biografía'].includes(label)));
        assert.deepEqual(tabNames, ['Perfil', 'Detalles', 'Popular', 'Biografía'], 'Perfil is the first info tab on phones');
      }
      const metadata = phone
        ? page.locator('.sv-info-cards-scope').first()
        : page.locator('[data-actor-metadata]');
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

      const box = await metadata.boundingBox();
      if (width >= 640) {
        // Verify single-line layout (no multiline wrap)
        assert.ok(box.height < 40, `metadata row height (${box.height}px) must be a single line (<40px)`);
      } else {
        // Phone: every card fits fully inside the viewport
        const outside = await metadata.evaluate((el) => [...el.querySelectorAll('*')].some((item) => {
          const r = item.getBoundingClientRect();
          return r.width > 0 && (r.left < 0 || r.right > window.innerWidth);
        }));
        assert.equal(outside, false, 'every profile card must be fully visible on phones');
      }

      // Verify "Conocido por" section has correct TMDB titles
      const popularSection = page.locator('#section-popular');
      await popularSection.waitFor({ state: 'visible' });
      const popularText = await popularSection.innerText();

      assert.ok(popularText.includes('Fast & Furious 6'), 'Known For must include Fast & Furious 6');
      assert.ok(popularText.includes('Fast & Furious 5'), 'Known For must include Fast & Furious 5');
      assert.ok(
        popularText.includes('Fast & Furious: Aún más rápido') || popularText.includes('Fast & Furious'),
        'Known For must include Fast & Furious'
      );
      assert.ok(popularText.includes('Fast & Furious 7'), 'Known For must include Fast & Furious 7');
      assert.ok(popularText.includes('A todo gas'), 'Known For must include A todo gas');
      assert.ok(popularText.includes('2 Fast 2 Furious'), 'Known For must include 2 Fast 2 Furious');

      // Timeline and She's All That (Alguien como tú) should not be among the top Known For
      const cards = await page.locator('#section-popular a[href*="/details/"]').allInnerTexts();
      const firstSix = cards.slice(0, 6).join(' ');
      assert.ok(!firstSix.includes('Timeline'), 'Timeline should not be in the top 6 Known For');
      assert.ok(!firstSix.includes('Alguien como tú'), 'Alguien como tú should not be in the top 6 Known For');

      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test('actor details page renders a full-screen poster collage background with known-for titles', {
  skip: !process.env.PLAYWRIGHT_MODULE,
}, async () => {
  const chromium = await getChromium();
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    args: ['--no-sandbox'],
  });

  try {
    for (const width of [390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(`${process.env.TEST_BASE_URL || 'http://localhost:3000'}/details/person/8167`, { waitUntil: 'domcontentloaded' });

      const bg = page.locator('[data-actor-background="collage"]');
      await bg.waitFor({ state: 'attached' });

      // Check fixed full-screen positioning
      const isFixed = await bg.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return style.position === 'fixed' && style.top === '0px' && style.left === '0px';
      });
      assert.ok(isFixed, 'actor background must be fixed at (0, 0) covering the viewport');

      // Wait for grid and poster images to populate
      const grid = page.locator('[data-actor-collage-grid]');
      await grid.waitFor({ state: 'attached', timeout: 5000 });
      const imgCount = await grid.locator('img').count();
      assert.ok(imgCount >= (width < 640 ? 10 : 20), `collage grid must have multiple poster tiles (found ${imgCount})`);

      // Verify that images include posters of known titles and are unique
      const srcs = await grid.locator('img').evaluateAll((imgs) => imgs.map((img) => img.src));
      assert.ok(srcs.length > 0 && srcs.some((s) => s.includes('image.tmdb.org')), 'collage tiles must load TMDb posters');
      const uniqueCount = new Set(srcs).size;
      assert.equal(uniqueCount, srcs.length, `all ${srcs.length} tiles must be unique without duplicate posters`);

      // Verify absence of heavy green blur blobs
      const blobCount = await bg.locator('.rounded-full').count();
      assert.equal(blobCount, 0, 'heavy blur blobs must be removed for a clean list-details look');

      await page.close();
    }
  } finally {
    await browser.close();
  }
});
