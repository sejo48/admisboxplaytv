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
            if (localStorage.getItem('review_fixture_ready')) return;
            localStorage.setItem('review_fixture_ready','1');
            const complete = {titulo:'Ficha completa',year:'2026',descripcion:'Sinopsis',imagen:'https://images.test/poster.jpg',director:'Directora',runtimeMin:90,genres:['Drama'],urlDrive:'https://drive.google.com/file/d/test/view'};
            for (const name of ['movies','estrenos','tudum','series','tv','animados','radios','videoteca']) localStorage.setItem('boxplay_admin_'+name, '[]');
            localStorage.setItem('boxplay_admin_movies', JSON.stringify([
                {...complete,id:'missing-drive',titulo:'Sin Drive',urlDrive:'  ',urlOkRu:'https://ok.ru/video/123'},
                {...complete,id:'missing-director',titulo:'Sin director',director:''},
                {...complete,id:'complete'}
            ]));
            localStorage.setItem('boxplay_admin_estrenos',JSON.stringify([{...complete,id:'premiere',titulo:'Estreno sin Drive',urlDrive:''}]));
        });
        const origin = 'http://127.0.0.1:'+server.address().port;
        await page.setViewportSize({width:1920,height:1000});
        await page.goto(origin+'/#review');
        await page.getByRole('button',{name:'Completar Sin Drive',exact:true}).waitFor();
        assert.equal(await page.locator('.review-list li').count(),2, 'Drive filter includes both catalogs, excludes existing Drive');
        await page.getByLabel('Información que falta',{exact:true}).selectOption('director');
        assert.equal(await page.locator('.review-list li').count(),1);
        await page.getByLabel('Información que falta',{exact:true}).selectOption('');
        assert.equal(await page.locator('.review-list li').count(),3);
        await page.getByLabel('Buscar película para revisar').fill('director');
        assert.equal(await page.locator('.review-list li').count(),1);
        await page.getByLabel('Buscar película para revisar').fill('');
        await page.getByLabel('Catálogo a revisar').selectOption('estrenos2026');
        assert.equal(await page.locator('.review-list li').count(),1);
        await page.getByLabel('Catálogo a revisar').selectOption('all');
        await page.getByRole('button',{name:'Completar Sin Drive',exact:true}).click();
        const editor=page.getByRole('region',{name:'Editor de película',exact:true});
        await editor.waitFor();
        assert.equal(await editor.locator('input[name="titulo"]').inputValue(),'Sin Drive');
        await editor.locator('input[name="urlDrive"]').fill('https://drive.google.com/file/d/fixed/view');
        await editor.getByRole('button',{name:/Guardar/}).click();
        await editor.waitFor({state:'detached'});
        await page.getByRole('button',{name:/Revisar fichas/}).click();
        await page.getByRole('button',{name:'Completar Estreno sin Drive',exact:true}).waitFor();
        assert.equal(await page.locator('.review-list li').count(),1,'Saved Drive disappears from pending list');
        const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('boxplay_admin_movies')));
        assert.equal(stored[0].urlDrive,'https://drive.google.com/file/d/fixed/view');
        assert.equal(stored[0].urlOkRu,'https://ok.ru/video/123');
        await page.reload();
        await page.getByRole('button',{name:'Completar Estreno sin Drive',exact:true}).waitFor();
        assert.equal(await page.locator('.review-list li').count(),1,'Saved result survives reload');
        await page.getByLabel('Buscar película para revisar').fill('no existe');
        await page.getByText('No hay películas con datos faltantes para estos filtros.').waitFor();
        await page.getByLabel('Buscar película para revisar').fill('');
        await page.setViewportSize({width:390,height:844});
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile layout has no overflow');
        assert.deepEqual(errors, []);
        console.log('Passed: missing Drive vs alternative playback, filters, editor navigation, save, refreshed review, persistence and mobile layout.');
    } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
