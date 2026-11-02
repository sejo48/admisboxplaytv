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
    const browser = await chromium.launch({ executablePath:'/usr/bin/chromium',args:['--no-sandbox'] });
    const origin = 'http://127.0.0.1:'+server.address().port;
    const errors=[];
    try {
        for (const width of [1366,390]) {
            const page=await browser.newPage({viewport:{width,height:900}});
            page.on('pageerror',error=>errors.push(error.message));
            await page.route('https://**/*',route=>route.abort());
            await page.route('https://api.themoviedb.org/3/**',route=>{
                const url=route.request().url();
                const movie={id:99,title:'Prueba TMDB',overview:'Sinopsis importada',poster_path:'/poster.jpg',release_date:'2026-10-01',runtime:120,genres:[{name:'Drama'}],credits:{crew:[{job:'Director',name:'Directora'}],cast:[]}};
                return route.fulfill({json:url.includes('/search/')?{results:[movie],total_pages:1}:url.includes('/configuration')?{}:movie});
            });
            await page.addInitScript(()=>{
                for(const key of ['movies','estrenos','series','tudum','tv','animados','doramas','radios','videoteca']) localStorage.setItem('boxplay_admin_'+key,'[]');
            });
            for(const [section,key,saveLabel] of [['movies','movies','Guardar Película'],['estrenos2026','estrenos','Guardar Estreno']]) {
                await page.goto(origin+'/#'+section);
                await page.locator('.admin-primary-actions .admin-add-button').click();
                const workflow=page.locator('.movie-workflow');
                await workflow.getByRole('tab',{name:'1 Buscar ficha'}).waitFor();
                assert.equal(await workflow.getByRole('tab',{selected:true}).textContent(),'1Buscar ficha');
                await workflow.getByLabel('Buscar películas en TMDB').fill('Prueba');
                await workflow.getByLabel('Buscar películas en TMDB').press('Enter');
                await workflow.locator('.tmdb-results button').first().click();
                await workflow.getByRole('button',{name:'Usar ficha y continuar'}).click();
                assert.equal(await workflow.getByRole('tab',{selected:true}).textContent(),'2Datos y enlaces');
                assert.equal(await workflow.locator('input[name="titulo"]').inputValue(),'Prueba TMDB');
                await workflow.locator('input[name="urlDrive"]').fill('https://drive.google.com/file/d/example/view');
                await workflow.getByRole('tab',{name:'3 Opciones'}).click();
                await workflow.locator('input[name="codigo"]').fill('1234');
                await workflow.locator('input[name="navidad"]').check();
                await workflow.getByRole('tab',{name:'2 Datos y enlaces'}).click();
                assert.equal(await workflow.locator('input[name="urlDrive"]').inputValue(),'https://drive.google.com/file/d/example/view');
                const save=workflow.getByRole('button',{name:saveLabel,exact:true});
                await save.scrollIntoViewIfNeeded();
                const box=await save.boundingBox();
                assert(box.y>=0 && box.y+box.height<=900,'Save stays within viewport');
                assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
                await save.click();
                await workflow.waitFor({state:'detached'});
                const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem('boxplay_admin_'+key))[0],key);
                assert.equal(saved.titulo,'Prueba TMDB');assert.equal(saved.codigo,'1234');assert.equal(saved.navidad,true);assert.equal(saved.director,'Directora');assert.equal(saved.runtimeMin,120);
                assert.equal(saved.urlDrive,'https://drive.google.com/file/d/example/view');

                // Saving from Options reveals missing required fields instead of losing the form.
                await page.getByRole('button',{name:section==='movies'?'Nueva Película':'Nuevo Estreno',exact:false}).first().click();
                await workflow.getByRole('tab',{name:'3 Opciones'}).click();
                await workflow.getByRole('button',{name:saveLabel,exact:true}).click();
                assert.equal(await workflow.getByRole('tab',{selected:true}).textContent(),'2Datos y enlaces');
                assert(await workflow.getByRole('alert').count());
                await workflow.getByRole('button',{name:'Cancelar',exact:true}).click();
            }
            await page.close();
        }
        assert.deepEqual(errors,[]);
        console.log('Passed: desktop/mobile contextual entry, TMDB search with Enter, automatic next step, retained fields and metadata, save and hidden-field validation in both catalogs.');
    } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
