import assert from 'node:assert/strict';
import test from 'node:test';

// Run against a local app. Authentication and preference writes are intercepted.
test('detail opening settings preserve scope, media and dialog accessibility', { skip: !process.env.PLAYWRIGHT_MODULE, timeout: 120000 }, async () => {
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const browser = await chromium.launch({...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),headless:true,args:['--no-sandbox']});
const context = await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
let preferences = {uiSettings:{},language:'es-ES'};
await context.route('**/api/auth/me', route => route.fulfill({json:{authenticated:true,user:{id:'preview-test',username:'preview-test',name:'Preview'}}}));
await context.route('**/api/user/preferences', route => {
 if(route.request().method()==='PATCH') preferences={...preferences,...route.request().postDataJSON()};
 return route.fulfill({json:{preferences}});
});
const page = await context.newPage();
try {
 await page.goto(`${process.env.TEST_BASE_URL || 'http://localhost:3000'}/profile/settings`,{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Preferencias',exact:true}).click({timeout:60000});
 const row=page.locator('div.group').filter({has:page.getByRole('heading',{name:'Al abrir un título',exact:true})}).last();
 await row.getByRole('button',{name:'Personalizar'}).click();
 const dialog=page.getByRole('dialog',{name:'Al abrir un título'});
 await dialog.waitFor();
 assert.equal(await dialog.locator('video').getAttribute('src'),'/previews/detail-open/center.webm');
 assert.equal(await dialog.locator('video').evaluate(v=>v.paused),true);
 assert.equal(await dialog.locator('video').evaluate(v=>v.controls),false);
 assert.equal(await dialog.getByText(/Grabado en/).count(),0);
 // The native picker keeps its keyboard behavior when visually customized.
 await dialog.getByLabel('Posición de la ficha',{exact:true}).focus();
 await page.keyboard.press('Space');
 await page.keyboard.press('Escape');
 assert.equal(await dialog.isVisible(),true);
 await dialog.getByLabel('Posición de la ficha',{exact:true}).selectOption('right');
 await dialog.getByLabel('Panel lateral',{exact:true}).selectOption('docked');
 await dialog.getByLabel('Contenido del panel',{exact:true}).selectOption('mobile');
 assert.equal(await dialog.locator('video').getAttribute('src'),'/previews/detail-open/docked-mobile.webm');
 await dialog.locator('label').filter({has:page.getByRole('radio',{name:'Páginas de usuario',exact:true})}).click();
 assert.equal(await dialog.locator('video').getAttribute('src'),'/previews/detail-open/user-pages/overlay-modal.webm');
 await dialog.getByLabel('Al seleccionar un título',{exact:true}).selectOption('page');
 assert.equal(await dialog.locator('video').getAttribute('src'),'/previews/detail-open/user-pages/page.webm');
 assert.equal(await dialog.getByLabel('Posición de la ficha',{exact:true}).isDisabled(),true);
 await dialog.locator('label').filter({has:page.getByRole('radio',{name:'Dashboards',exact:true})}).click();
 assert.equal(await dialog.locator('video').getAttribute('src'),'/previews/detail-open/docked-mobile.webm');
 await page.keyboard.press('Escape');
 assert.equal(await dialog.isVisible(),false);
 assert.equal(await row.getByRole('button',{name:'Personalizar'}).evaluate(el=>el===document.activeElement),true);
 await page.setViewportSize({width:390,height:844});
 await row.getByRole('button',{name:'Personalizar'}).click();
 assert.equal(await dialog.evaluate(el=>el.scrollWidth <= el.clientWidth),true);
 await dialog.getByRole('button',{name:'Cerrar',exact:true}).click();
 for (const prefix of ['', 'user-pages/']) {
 for (const variant of ['center', 'overlay-modal', 'docked-modal', 'overlay-mobile', 'docked-mobile', 'page']) {
   const media = await page.evaluate((variant) => new Promise((resolve, reject) => {
     const video = document.createElement('video');
     video.preload = 'metadata';
     video.onloadedmetadata = () => resolve({ width: video.videoWidth, height: video.videoHeight, duration: video.duration });
     video.onerror = () => reject(new Error(`Cannot decode ${variant}`));
     video.src = `/previews/detail-open/${variant}.webm`;
   }), `${prefix}${variant}`);
   assert.equal(media.width, 2880, variant);
   assert.equal(media.height, 1620, variant);
   assert.ok(media.duration <= 4.1, variant);
 }

}
} finally {await browser.close();}

});
