// capture-reference.mjs — Drive a real browser over the reference page and wait
// for it to POST its measurements back to reference.json.
//
//   node test/layout-conformance/serve.js &
//   npx --yes -p playwright node test/layout-conformance/capture-reference.mjs
//
// Uses the system Google Chrome (channel: 'chrome') so there's no 120MB
// Chromium download. Falls back to playwright's bundled chromium if Chrome
// isn't available. Headless is fine — and more reproducible than headed —
// because the page loads KaTeX's own woff2 fonts explicitly, so glyph metrics
// come from those files rather than from system font substitution.

import { chromium } from 'playwright';

const URL = process.env.MTX_REF_URL || 'http://localhost:8777/';
const TIMEOUT_MS = 60000;

async function launch() {
    try {
        return await chromium.launch({ channel: 'chrome' });
    } catch (e) {
        console.error('system Chrome unavailable, falling back to bundled chromium');
        return await chromium.launch();
    }
}

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

page.on('console', m => console.error(`[page:${m.type()}] ${m.text()}`));
page.on('pageerror', e => console.error(`[page:error] ${e.message}`));

let saved = false;
page.on('requestfinished', req => {
    if (req.method() === 'POST' && req.url().endsWith('/save')) saved = true;
});

console.error(`navigating to ${URL}`);
await page.goto(URL, { waitUntil: 'networkidle', timeout: TIMEOUT_MS });

// The page sets its status line when the run completes, one way or another.
await page.waitForFunction(
    () => {
        const t = document.getElementById('status')?.textContent || '';
        return t.startsWith('✅') || t.startsWith('⚠️') || t.startsWith('❌');
    },
    { timeout: TIMEOUT_MS },
);

const status = await page.textContent('#status');
const result = await page.evaluate(() => window.__RESULT__ || null);

console.error(`status: ${status}`);
console.error(`saved via POST: ${saved}`);
if (result) {
    const withItems = result.formulas.filter(f => (f.items || []).length > 0).length;
    console.error(`formulas measured: ${withItems}/${result.formulas.length}`);
    const errs = result.formulas.filter(f => f.error);
    for (const e of errs) console.error(`  #${e.id} ERROR ${e.error}`);
}

await browser.close();

if (!result) { console.error('no result on page'); process.exit(1); }
if (!saved) {
    // Server POST failed; write it ourselves so the run isn't wasted.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const dir = path.dirname(url.fileURLToPath(import.meta.url));
    fs.writeFileSync(path.join(dir, 'reference.json'), JSON.stringify(result, null, 2));
    console.error('wrote reference.json directly (POST did not land)');
}
