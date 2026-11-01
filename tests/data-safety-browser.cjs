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
    const origin = 'http://127.0.0.1:' + server.address().port;
    const keys = ['movies','estrenos','tudum','series','tv','animados','radios','videoteca'];
    const errors = [];
    async function open(seed, hash = 'overview', quota = false) {
        const page = await browser.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.route('https://**/*', route => route.abort());
        await page.addInitScript(({seed, quota}) => {
            if (!sessionStorage.getItem('seeded')) {
                for (const [key, value] of Object.entries(seed)) localStorage.setItem('boxplay_admin_' + key, JSON.stringify(value));
                sessionStorage.setItem('seeded', '1');
            }
            if (quota) {
                const original = Storage.prototype.setItem;
                Storage.prototype.setItem = function(key, value) {
                    if (key.startsWith('boxplay_admin_')) throw new DOMException('Full', 'QuotaExceededError');
                    return original.call(this, key, value);
                };
            }
        }, {seed, quota});
        await page.goto(origin + '/#' + hash);
        await page.locator('main').waitFor();
        return page;
    }
    async function stored(page, key) { return page.evaluate(key => JSON.parse(localStorage.getItem('boxplay_admin_' + key)), key); }
    async function undo(page) {
        await page.locator('.admin-actions-menu summary').click();
        await page.getByTitle('Deshacer última acción').click();
        await page.locator('.admin-actions-menu summary').click();
        await page.waitForTimeout(500);
    }
    try {
        // A missing catalog and failed network must never replace a saved draft.
        let page = await open({movies:[{id:'draft', titulo:'Borrador sin publicar'}]}, 'movies');
        assert.equal((await stored(page, 'movies'))[0].titulo, 'Borrador sin publicar');
        assert.equal(await stored(page, 'radios'), null, 'Failed download is not cached as an empty catalog');
        assert(await page.getByRole('alert').filter({hasText:'No se pudieron descargar'}).count());
        await page.reload();
        await page.locator('main').waitFor();
        assert.equal((await stored(page, 'movies'))[0].titulo, 'Borrador sin publicar');
        await page.close();

        const empty = Object.fromEntries(keys.map(key => [key, []]));
        page = await open(empty, 'movies', true);
        assert(await page.getByRole('alert').filter({hasText:'Descarga un Backup'}).count(), 'Quota warning remains visible');
        await page.close();

        // A successful empty remote catalog must clear the old local data on explicit reload.
        page = await open({...empty, movies:[{id:'old',titulo:'Título eliminado'}]}, 'movies');
        await page.route('**/peliculas.json?*', route => route.fulfill({json:[]}));
        await page.locator('.admin-actions-menu summary').click();
        await page.getByRole('button',{name:'Recargar',exact:true}).click();
        await page.getByRole('button',{name:'Confirmar',exact:true}).click();
        await page.waitForFunction(() => localStorage.getItem('boxplay_admin_movies') === '[]');
        assert.deepEqual(await stored(page, 'movies'), []);
        await page.close();

        for (const key of ['series','animados']) {
            const sample = {id:'series-1',tituloSerie:'Serie de prueba',temporadas:[
                {numeroTemporada:1,episodios:[{id:'ep-1',tituloEpisodio:'Piloto',urlDrive:'https://example.com/video'}]},
                {numeroTemporada:3,episodios:[]}
            ]};
            page = await open({...empty,[key]:[sample]}, key);
            await page.locator('[data-poster-card] button').first().click();
            await page.getByRole('button',{name:'Añadir Temporada',exact:true}).click();
            await page.waitForTimeout(500);
            assert.deepEqual((await stored(page,key))[0].temporadas.map(s=>s.numeroTemporada),[1,3,4]);
            await undo(page);
            assert.deepEqual((await stored(page,key))[0].temporadas.map(s=>s.numeroTemporada),[1,3], 'First edit can be undone');
            await page.locator('[data-poster-card] button').first().click();
            await page.getByRole('button',{name:'Editar episodio',exact:true}).click();
            await page.locator('input[name="tituloEpisodio"]').fill('PILOTO');
            await page.locator('form').filter({has:page.locator('input[name="tituloEpisodio"]')}).locator('button[type=submit]').click();
            await page.waitForTimeout(500);
            assert.equal((await stored(page,key))[0].temporadas[0].episodios[0].tituloEpisodio,'PILOTO', 'Case-only title edit is allowed');
            await page.getByRole('button',{name:'Añadir Temporada',exact:true}).click();
            await page.waitForTimeout(500);
            await undo(page);
            assert.equal((await stored(page,key))[0].temporadas[0].episodios[0].tituloEpisodio,'PILOTO');
            await undo(page);
            assert.equal((await stored(page,key))[0].temporadas[0].episodios[0].tituloEpisodio,'Piloto', 'Nested edit does not mutate undo history');
            await page.close();
        }
        assert.deepEqual(errors, []);
        console.log('Passed: partial recovery, failed downloads, empty reload, quota warning, season numbering, episode editing and repeated undo.');
    } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
