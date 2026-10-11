import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: process.env.CHROME }); const pg = await b.newPage(); const errs=[]; pg.on('pageerror', e=>errs.push(e.message));
await pg.goto('http://localhost:4180/baller-connection/?api=http://localhost:8799#/coach'); await pg.waitForTimeout(1200);
console.log(await pg.locator('.demotag').innerText()); console.log((await pg.locator('.qrow').count()) + ' rows');
await pg.goto('http://localhost:4180/baller-connection/#/app?p=riley'); await pg.waitForTimeout(800); console.log(await pg.locator('.path-panel .pill').innerText());
await pg.evaluate(()=>localStorage.removeItem('bc-api')); console.log(errs.join('|')||'no errors'); await b.close();
