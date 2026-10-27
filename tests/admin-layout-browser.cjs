/* Layout/navigation regression; fixtures stay in isolated browser storage. */
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
    if (name.includes('..')) { res.writeHead(404); return res.end(); }
    try {
        res.setHeader('Content-Type', name.endsWith('.html') ? 'text/html' : name.endsWith('.css') ? 'text/css' : 'application/javascript');
        res.end(fs.readFileSync(path.join(root, name)));
    } catch { res.writeHead(404); res.end(); }
});
(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('https://**/*', route => route.abort());
        await page.addInitScript(() => {
            const items = Array.from({length:40}, (_, i) => ({id:'test-'+i, titulo:'Prueba '+i, title:'Prueba '+i, year:'2026', descripcion:'Descripción '+i}));
            for (const name of ['movies','estrenos','tudum','series','tv','animados','radios','videoteca']) localStorage.setItem('boxplay_admin_'+name, JSON.stringify(['movies','estrenos','tudum'].includes(name) ? items : []));
        });
        const origin = 'http://127.0.0.1:'+server.address().port;
        for (const width of [1920, 1366, 390]) {
            await page.setViewportSize({width, height:900});
            for (const section of ['movies','estrenos2026','tudum']) {
                await page.goto(origin+'/#'+section);
                const cards = page.locator('[data-poster-card]');
                await cards.last().waitFor();
                for (const [index, editButton] of [[39,false],[39,true],[38,false]]) {
                    const button = editButton ? cards.nth(index).getByRole('button', {name:/^Editar/}).last() : cards.nth(index).locator('button').first();
                    await button.scrollIntoViewIfNeeded();
                    await button.click();
                    await page.waitForTimeout(350);
                    const geometry = await page.locator('.admin-inline-editor').evaluate(editor => ({top:editor.getBoundingClientRect().top, header:document.querySelector('.admin-header').getBoundingClientRect().bottom, focused:document.activeElement===editor}));
                    assert(geometry.top >= geometry.header - 1 && geometry.top < geometry.header + 35, JSON.stringify({width,section,geometry}));
                    assert(geometry.focused, 'Editor receives focus');
                }
                const mainWidth = await page.locator('main').evaluate(el => el.getBoundingClientRect().width);
                assert(mainWidth >= width - 2, 'Main uses monitor width');
                assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
                const title = page.locator('.admin-inline-editor input[name="titulo"],.admin-inline-editor input[name="title"]').first();
                await title.fill('Cambio local');
                const y = await page.evaluate(() => scrollY);
                await title.press('End'); await title.press('!');
                await page.waitForTimeout(100);
                assert.equal(await page.evaluate(() => scrollY), y, 'Typing does not scroll back to editor heading');
            }
        }
        assert.deepEqual(errors, []);
        console.log('Passed: full-width layout, mobile overflow, repeated card selection, focus and typing stability in three catalogs.');
    } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
