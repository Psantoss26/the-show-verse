// Record the real app UI. User-page captures use a demo session and curated favorites.
// No real account or stored preferences are modified. PREVIEW_SCOPE=userPages selects Favoritos.
// Start the app, then set PLAYWRIGHT_MODULE and FFMPEG_PATH to local installs.
// FFmpeg must include the PNG decoder and libvpx encoder (not the bundled Playwright binary).
// PREVIEW_VARIANT optionally selects a comma-separated subset to regenerate.
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
const userPages = process.env.PREVIEW_SCOPE === 'userPages';
const output = `public/previews/detail-open${userPages ? '/user-pages' : ''}`;
let favorites = [];
if (userPages) {
  createRequire(import.meta.url)('@next/env').loadEnvConfig(process.cwd(), true);
  favorites = await Promise.all([550, 27205, 157336, 238, 680, 155, 13, 603, 129, 120, 424, 807].map(async (id) => {
    const url = new URL(`https://api.themoviedb.org/3/movie/${id}`);
    url.searchParams.set('api_key', process.env.NEXT_PUBLIC_TMDB_API_KEY || '');
    url.searchParams.set('language', 'es-ES');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load sample movie ${id}: ${response.status}`);
    return { ...await response.json(), media_type: 'movie' };
  }));
}
const temp = await mkdtemp(join(tmpdir(), 'sv-preview-'));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--no-sandbox'] });
try {
  for (const variant of ['center', 'overlay-modal', 'docked-modal', 'overlay-mobile', 'docked-mobile', 'page'].filter(value => !process.env.PREVIEW_VARIANT || process.env.PREVIEW_VARIANT.split(',').includes(value))) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2, locale: 'es-ES' });
    if (userPages) {
      const preferences = { language: 'es-ES', uiSettings: { detailOpen: { userPages: {
        target: variant === 'page' ? 'page' : 'panel',
        placement: variant === 'center' ? 'center' : 'right',
        drawerView: variant.startsWith('docked') ? 'docked' : 'overlay',
        contentView: variant.endsWith('mobile') ? 'mobile' : 'modal',
      } } } };
      await context.route('**/api/auth/me', route => route.fulfill({ json: { authenticated: true, user: { id: 'preview-demo', username: 'cine', displayName: 'Cine' } } }));
      await context.route('**/api/user/preferences', route => route.fulfill({ json: { preferences } }));
      await context.route('**/api/tmdb/account/favorite', route => route.fulfill({ json: { favorites } }));
      await context.route('**/api/trakt/ratings?*', route => route.fulfill({ json: { results: [] } }));
      await context.route('**/api/trakt/history?*', route => route.fulfill({ json: { results: [] } }));
    }
    await context.addInitScript(({ variant }) => {
      localStorage.setItem('showverse:dashboard:detailModalPlacement', variant === 'center' ? 'center' : 'right');
      localStorage.setItem('showverse:dashboard:detailModalView', variant.startsWith('docked') ? 'docked' : 'overlay');
      localStorage.setItem('showverse:dashboard:detailModalContentView', variant.endsWith('mobile') ? 'mobile' : 'modal');
    }, { variant });
    const page = await context.newPage();
    await page.goto(`${base}${userPages ? (variant === 'page' ? '/favorites' : '/favorites?preview=movie-550') : (variant === 'page' ? '/details/movie/550' : '/movies?preview=movie-550')}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    if (userPages) await page.getByRole('heading', { name: /Favorit/i }).first().waitFor({ timeout: 60000 });
    if (!(userPages && variant === 'page')) await page.locator('body').getByText('1999', { exact: false }).filter({ visible: true }).first().waitFor({ timeout: 60000 });
    // Allow artwork, fonts and async rating sources to settle before recording.
    await page.waitForTimeout(10000);
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await page.evaluate(() => { document.querySelectorAll('video,audio').forEach(media => { media.muted = true; media.pause(); }); });
    if (variant !== 'page') await page.locator('[aria-label="Cerrar modal"]').waitFor();
    // Capture original pixels, avoiding Playwright's lossy video intermediate.
    // Freeze timers so dashboard carousels do not jump between sampled frames.
    if (!(userPages && variant === 'page')) {
      await page.clock.install();
      await page.clock.pauseAt(new Date());
    }
    await page.screenshot({ path: `${output}/${variant}.jpg`, type: 'jpeg', quality: 96 });
    const frames = join(temp, variant);
    await mkdir(frames);
    let previousTop = -1;
    let previousFrame;
    for (let frame = 0; frame < 120; frame++) {
      if (userPages && variant === 'page' && frame === 24) {
        await page.goto(`${base}/details/movie/550`, { waitUntil: 'domcontentloaded' });
        await page.locator('body').getByText('1999', { exact: false }).filter({ visible: true }).first().waitFor();
        await page.waitForTimeout(5000);
        await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
        await page.clock.install();
        await page.clock.pauseAt(new Date());
        previousTop = -1;
      }
      const ease = (progress) => (1 - Math.cos(Math.PI * progress)) / 2;
      const top = Math.round(frame < 24 ? 0 : frame < 48 ? 420 * ease((frame - 24) / 24) : frame < 72 ? 420 : frame < 96 ? 420 * (1 - ease((frame - 72) / 24)) : 0);
      const filename = join(frames, `${String(frame).padStart(3, '0')}.png`);
      if (top === previousTop) {
        await copyFile(previousFrame, filename);
      } else {
        await page.evaluate(({ variant, top }) => {
          const scroller = variant === 'page' ? document.scrollingElement : document.querySelector('.sv-drawer-panel .overflow-y-auto') || [...document.querySelectorAll('.overflow-y-auto')].find(el => el.scrollHeight > el.clientHeight + 100);
          scroller?.scrollTo({ top, behavior: 'instant' });
        }, { variant, top });
        await page.screenshot({ path: filename });
      }
      previousTop = top;
      previousFrame = filename;
    }
    await context.close();
    // 2880 × 1620, 30 fps, four seconds. Short enough to play without controls.
    execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-y', '-framerate', '30', '-i', join(frames, '%03d.png'), '-an', '-c:v', 'libvpx', '-threads', '4', '-deadline', 'good', '-cpu-used', '2', '-b:v', '12M', '-crf', '8', '-pix_fmt', 'yuv420p', `${output}/${variant}.webm`], { stdio: ['ignore', 'ignore', 'inherit'] });
    await rm(frames, { recursive: true, force: true });
    console.log(`Recorded ${variant}`);
  }
} finally {
  await browser.close();
  await rm(temp, { recursive: true, force: true });
}
