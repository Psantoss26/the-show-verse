import assert from "node:assert/strict";
import test from "node:test";

const enabled = Boolean(process.env.PLAYWRIGHT_MODULE);
const base = process.env.TEST_BASE_URL || "http://localhost:3000";
async function launch() {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
  return chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH, args: ["--no-sandbox"] });
}

test("phone shell overlays controls and waits for artwork, without a separate header", { skip: !enabled }, async () => {
  const browser = await launch();
  let releaseImages;
  const imagesAllowed = new Promise(resolve => { releaseImages = resolve; });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.addInitScript(() => {
      localStorage.setItem("showverse:detailModalContentView", "mobile");
      localStorage.setItem("showverse:detailModalPlacement", "right");
    });
    await page.route('**/image.tmdb.org/**', async route => { await imagesAllowed; await route.continue(); });
    await page.goto(`${base}/favorites?preview=season-1399-1`, { waitUntil: 'domcontentloaded' });
    await page.frameLocator('iframe').locator('[data-embedded-details]').waitFor({ timeout: 60000 });
    assert.equal(await page.locator('[aria-busy="true"]:has(> iframe)').count(), 1);
    assert.equal(await page.locator('iframe').evaluate(el => getComputedStyle(el).opacity), '0');
    const layout = await page.locator('.sv-drawer-panel').evaluate(el => ({
      radius: getComputedStyle(el).borderTopLeftRadius,
      top: el.getBoundingClientRect().top,
      frameTop: el.querySelector('iframe').getBoundingClientRect().top,
      closeTop: el.querySelector('[aria-label="Cerrar modal"]').getBoundingClientRect().top,
    }));
    assert.equal(layout.radius, '16px');
    assert.equal(layout.top, layout.frameTop);
    assert.equal(layout.closeTop - layout.top, 16);
    releaseImages();
    await page.locator('[aria-busy="false"]:has(> iframe)').waitFor({ timeout: 60000 });
  } finally { releaseImages(); await browser.close(); }
});

test("season phone panel drills into actual episode page, returns, and releases docked space", { skip: !enabled }, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.addInitScript(() => {
      localStorage.setItem("showverse:detailModalContentView", "mobile");
      localStorage.setItem("showverse:detailModalPlacement", "right");
      localStorage.setItem("showverse:detailModalView", "docked");
    });
    await page.goto(`${base}/favorites?preview=season-1399-1`);
    const season = page.frameLocator('iframe[title="Temporada 1"]');
    const episodeLink = season.locator('a[href="/details/tv/1399/season/1/episode/1"]').first();
    await episodeLink.waitFor({ timeout: 60000 });
    const box = await page.locator('.sv-drawer-panel').boundingBox();
    assert.ok(box.width < 640);
    assert.equal(Math.round(box.x + box.width), 1440);
    assert.match(await page.locator('[data-detail-page-content]').getAttribute('style'), /margin-right: \d+px/);
    await episodeLink.click();
    await page.locator('iframe[title="Episodio 1×1"]').waitFor();
    assert.match(page.url(), /preview=ep-1399-1-1/);
    await page.frameLocator('iframe[title="Episodio 1×1"]').locator('[data-embedded-details]').waitFor({ timeout: 60000 });
    await page.getByRole('button', { name: 'Mostrar ficha móvil', exact: true, pressed: true }).click();
    await page.locator('iframe[title="Episodio 1×1"]').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Mostrar ficha móvil', exact: true }).click();
    await page.locator('iframe[title="Episodio 1×1"]').waitFor();
    await page.goBack();
    await page.locator('iframe[title="Episodio 1×1"]').waitFor({ state: "detached" });
    await page.getByRole('button', { name: 'Acoplar panel lateral', exact: true, pressed: true }).click();
    assert.equal(await page.locator('[data-detail-page-content]').evaluate(el => el.style.marginRight), "");
    await page.getByRole('button', { name: 'Cerrar modal', exact: true }).click();
    await page.locator('.sv-drawer-panel').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--sv-detail-drawer-inset')), "");
  } finally { await browser.close(); }
});

test("mobile opens season and episode full pages despite phone panel preference", { skip: !enabled }, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    for (const [token, path] of [["season-1399-0", "/details/tv/1399/season/0"], ["ep-1399-1-1", "/details/tv/1399/season/1/episode/1"]]) {
      await page.goto(`${base}/favorites?preview=${token}`);
      await page.waitForURL(`${base}${path}`, { timeout: 60000 });
      assert.equal(await page.locator('.sv-drawer-panel').count(), 0);
    }
  } finally { await browser.close(); }
});

test("saved user-page preference overrides local panel choice and dashboard scope", { skip: !enabled }, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.route('**/api/auth/me', route => route.fulfill({ json: { authenticated: true, user: { id: 'preview-test', username: 'preview-test' } } }));
    await page.route('**/api/user/preferences', route => route.fulfill({ json: { preferences: { uiSettings: { detailOpen: {
      userPages: { target: 'page' }, dashboard: { target: 'panel', placement: 'right', contentView: 'mobile' },
    } } } } }));
    for (const [token, path] of [["season-1399-1", "/details/tv/1399/season/1"], ["ep-1399-1-1", "/details/tv/1399/season/1/episode/1"]]) {
      await page.goto(`${base}/favorites?preview=${token}`);
      await page.waitForURL(`${base}${path}`, { timeout: 60000 });
      assert.equal(await page.locator('.sv-drawer-panel').count(), 0);
    }
  } finally { await browser.close(); }
});
