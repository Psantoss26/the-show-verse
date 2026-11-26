// Captures the README screenshots (docs/assets/readme/) from the running local app with a real session.
//
// The session is a short-lived access token signed with backend/src/lib/jwt.js for README_USERNAME
// (default: pablosantos) and placed in an ISOLATED Playwright context: it never touches the cookies of
// your own browser. Your stored preferences (how titles open, phone scores, bottom bar…) come with the
// session; per-page views kept in localStorage can be provided with README_STORAGE=<file.json>
// ({ "showverse:favorites:imageMode": "poster", … }). Nothing is written to the account: only buttons
// that open a modal are clicked, never favourite / watchlist toggles.
//
// Requirements: frontend on :3000 and backend on :3001 (npm run dev), local Postgres with that user.
// Usage:
//   PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs CHROME_PATH=/usr/bin/google-chrome \
//     node scripts/capture-readme-screenshots.mjs [shot-name …]
// With shot names only those are retaken (composites are rebuilt when any of their parts is).
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const root = new URL('..', import.meta.url).pathname;
const require = createRequire(join(root, 'package.json'));
const sharp = require('sharp');
const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
const username = process.env.README_USERNAME || 'pablosantos';
const output = join(root, 'docs/assets/readme');
const temp = join(root, '.readme-shots-tmp');
const only = new Set(process.argv.slice(2));

// Sample titles: a film and a series with real activity on the account.
const MOVIE = 27205; // Origen
const MOVIE_2 = 157336; // Interstellar
const TV = 1396; // Breaking Bad
const SEASON = `/details/tv/${TV}/season/5`;
const EPISODE = `/details/tv/${TV}/season/5/episode/14`;

const DESKTOP = { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, out: { width: 1600 } };
const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, out: { width: 780 } };

// Action buttons of the title page, by accessible name, with the modal each one opens.
const ACTIONS = [
  ['action-trailer', 'Ver Tráiler'],
  ['action-soundtrack', 'Reproducir soundtrack'],
  ['action-trakt', /historial de vistos/i],
  ['action-rating', /^Tu puntuación/],
  ['action-lists', 'Añadir o gestionar en listas de reproducción'],
  ['action-reviews', 'Ver reseñas de la comunidad'],
  ['action-activity', 'Ver la actividad de quienes sigues'],
  ['action-links', 'Abrir enlaces externos'],
  ['action-share', 'Compartir'],
];

const SHOTS = [
  // Title pages, desktop.
  { name: 'details-movie', device: DESKTOP, path: `/details/movie/${MOVIE}` },
  { name: 'details-movie-scroll', device: DESKTOP, path: `/details/movie/${MOVIE}`, scroll: 1000 },
  { name: 'details-tv', device: DESKTOP, path: `/details/tv/${TV}` },
  { name: 'details-tv-scroll', device: DESKTOP, path: `/details/tv/${TV}`, scroll: 1000 },
  { name: 'season', device: DESKTOP, path: SEASON },
  { name: 'episode', device: DESKTOP, path: EPISODE },
  // Action buttons and their modals (film page; the series one for the episode tracker).
  ...ACTIONS.map(([name, label]) => ({ name, device: DESKTOP, path: `/details/movie/${MOVIE}`, click: label })),
  { name: 'action-trakt-tv', device: DESKTOP, path: `/details/tv/${TV}`, click: /historial de vistos|episodios vistos/i },
  // Title pages, phone.
  { name: 'm-movie', device: MOBILE, path: `/details/movie/${MOVIE}` },
  { name: 'm-movie-2', device: MOBILE, path: `/details/movie/${MOVIE_2}` },
  { name: 'm-tv', device: MOBILE, path: `/details/tv/${TV}` },
  { name: 'm-movie-scroll', device: MOBILE, path: `/details/movie/${MOVIE}`, scroll: 760 },
  { name: 'm-season', device: MOBILE, path: SEASON },
  { name: 'm-episode', device: MOBILE, path: EPISODE },
  // User pages with the account's current view, and one with the side panel open.
  { name: 'favorites', device: DESKTOP, path: '/favorites' },
  { name: 'watchlist', device: DESKTOP, path: '/watchlist' },
  { name: 'history', device: DESKTOP, path: '/history' },
  { name: 'inprogress', device: DESKTOP, path: '/in-progress' },
  { name: 'continue', device: DESKTOP, path: '/continue-watching' },
  { name: 'completed', device: DESKTOP, path: '/completed' },
  { name: 'biblio', device: DESKTOP, path: '/biblioteca' },
  { name: 'drawer-favorites', device: DESKTOP, path: `/favorites?preview=movie-${MOVIE}`, drawer: true },
  { name: 'drawer-watchlist', device: DESKTOP, path: `/watchlist?preview=tv-${TV}`, drawer: true },
  { name: 'drawer-watchlist-scroll', device: DESKTOP, path: `/watchlist?preview=tv-${TV}`, drawer: true, scroll: 900 },
];

// Side-by-side phone composites for the README.
const COMPOSITES = [
  { name: 'mobile-details', parts: ['m-movie', 'm-tv', 'm-movie-2', 'm-movie-scroll'] },
  { name: 'mobile-season-episode', parts: ['m-season', 'm-episode'] },
];

async function sessionToken() {
  process.chdir(join(root, 'backend'));
  await import(join(root, 'backend/src/config/load-env.js'));
  const { db, closeDb } = await import(join(root, 'backend/src/db/client.js'));
  const { users } = await import(join(root, 'backend/src/db/schema.js'));
  const { eq } = await import(require.resolve('drizzle-orm', { paths: [join(root, 'backend')] }));
  const { signAccessToken } = await import(join(root, 'backend/src/lib/jwt.js'));
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
  await closeDb();
  process.chdir(root);
  if (!user) throw new Error(`User ${username} not found in the local database`);
  return signAccessToken({ sub: user.id });
}

async function assertSignedIn(page) {
  const response = await page.request.get(`${base}/api/auth/me`);
  const body = await response.json().catch(() => ({}));
  if (!body.authenticated || body.user?.username !== username) {
    throw new Error(`No session for ${username} (GET /api/auth/me → ${response.status()})`);
  }
}

async function settle(page, ms) {
  await page.waitForLoadState('load', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(ms);
  await page.evaluate(() => document.querySelectorAll('video,audio').forEach(media => { media.muted = true; }));
}

async function capture(browser, token, storage, shot) {
  const { out, ...device } = shot.device;
  const context = await browser.newContext({ ...device, locale: 'es-ES', timezoneId: 'Europe/Madrid', colorScheme: 'dark', serviceWorkers: 'block' });
  try {
    await context.addCookies([{ name: 'showverse_access_token', value: token, domain: new URL(base).hostname, path: '/' }]);
    await context.addInitScript(entries => { for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value); }, storage);
    // Hide the Next.js dev indicator.
    await context.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = 'nextjs-portal { display: none !important; }';
      document.head.append(style);
    }));
    const page = await context.newPage();
    await assertSignedIn(page);
    await page.goto(`${base}${shot.path}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await settle(page, 9000);
    if (await page.getByRole('link', { name: /Iniciar sesión/i }).filter({ visible: true }).count()) {
      throw new Error(`${shot.name}: the page shows the signed-out state`);
    }
    if (shot.drawer) await page.locator('.sv-drawer-panel').first().waitFor({ timeout: 30000 });
    if (shot.click) {
      await page.getByRole('button', { name: shot.click }).filter({ visible: true }).first().click();
      await page.waitForTimeout(4500);
    }
    if (shot.scroll) {
      await page.evaluate(({ top, drawer }) => {
        const panel = drawer && [...document.querySelectorAll('.sv-drawer-panel *')].find(el => el.scrollHeight > el.clientHeight + 100 && /(auto|scroll)/.test(getComputedStyle(el).overflowY));
        (panel || document.scrollingElement).scrollTo({ top, behavior: 'instant' });
      }, { top: shot.scroll, drawer: !!shot.drawer });
      await page.waitForTimeout(3500);
    }
    const raw = join(temp, `${shot.name}.png`);
    await page.screenshot({ path: raw });
    await sharp(raw).resize(out).jpeg({ quality: 86, mozjpeg: true }).toFile(join(output, `${shot.name}.jpg`));
    console.log(`✓ ${shot.name}`);
  } finally {
    await context.close();
  }
}

async function composite({ name, parts }) {
  const missing = parts.filter(part => !existsSync(join(output, `${part}.jpg`)));
  if (missing.length) return console.warn(`… ${name} skipped, missing: ${missing.join(', ')}`);
  const gap = 36;
  const images = await Promise.all(parts.map(part => sharp(join(output, `${part}.jpg`)).toBuffer({ resolveWithObject: true })));
  const width = images.reduce((sum, { info }) => sum + info.width, 0) + gap * (images.length + 1);
  const height = Math.max(...images.map(({ info }) => info.height)) + gap * 2;
  let left = gap;
  const layers = [];
  for (const { data, info } of images) {
    // Rounded corners, like a phone screen.
    const mask = Buffer.from(`<svg width="${info.width}" height="${info.height}"><rect width="100%" height="100%" rx="44" ry="44"/></svg>`);
    const rounded = await sharp(data).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
    layers.push({ input: rounded, left, top: gap });
    left += info.width + gap;
  }
  await sharp({ create: { width, height, channels: 3, background: '#0b0b0d' } }).composite(layers).jpeg({ quality: 86, mozjpeg: true }).toFile(join(output, `${name}.jpg`));
  console.log(`✓ ${name} (composite)`);
}

const storage = process.env.README_STORAGE ? JSON.parse(await readFile(process.env.README_STORAGE, 'utf8')) : {};
const token = await sessionToken();
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
await mkdir(temp, { recursive: true });
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const failed = [];
try {
  for (const shot of SHOTS.filter(shot => !only.size || only.has(shot.name))) {
    try {
      await capture(browser, token, storage, shot);
    } catch (error) {
      failed.push(shot.name);
      console.error(`✗ ${shot.name}: ${error.message}`);
      if (/No session|signed-out/.test(error.message)) throw error;
    }
  }
  for (const item of COMPOSITES.filter(item => !only.size || only.has(item.name) || item.parts.some(part => only.has(part)))) {
    await composite(item);
  }
} finally {
  await browser.close();
  await rm(temp, { recursive: true, force: true });
}
if (failed.length) {
  console.error(`Failed: ${failed.join(', ')}`);
  process.exitCode = 1;
}
