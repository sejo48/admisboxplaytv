/* Offline integration checks: local React/Babel/HLS/Tailwind assets, no Firebase or media services. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const C = require('/workspace/StreamTube-V20/catalog.js');
const root = path.resolve(__dirname, '..');
const principalRoot = '/workspace/StreamTube-V20';
const moduleFile = (name, file) => path.join(path.dirname(require.resolve(name + '/package.json')), file);
const styles = fs.readFileSync(process.env.BOXPLAY_TEST_CSS, 'utf8');
const files = new Map();
let requestsWithWrites = [];
const server = http.createServer((req, res) => {
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
    const url = new URL(req.url, 'http://localhost');
    const mount = url.pathname.startsWith('/principal/') ? '/principal/' : '/admin/';
    const filename = url.pathname.slice(mount.length) || 'index.html';
    if (filename.includes('..') || (filename.includes('/') && !/^(?:icons|assets)\/[\w.-]+$/.test(filename))) {res.writeHead(404);return res.end();}
    try {
        const base = mount === '/principal/' ? principalRoot : root;
        let body = mount === '/principal/' && files.has(filename) ? files.get(filename) : fs.readFileSync(path.join(base, filename));
        if (filename.endsWith('.html')) body=body.toString().replace(/<script type="module">[\s\S]*?<\/script>/g,'<!-- Firebase excluded from offline test -->');
        res.setHeader('Content-Type',filename.endsWith('.html')?'text/html; charset=utf-8':filename.endsWith('.js')?'application/javascript':filename.endsWith('.css')?'text/css':filename.endsWith('.png')?'image/png':filename.endsWith('.webmanifest')?'application/manifest+json':'application/json');
        res.end(body);
    } catch {res.writeHead(404);res.end();}
});
(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
    const context = await browser.newContext({ acceptDownloads: true });
    const errors = [];
    await context.route('https://**/*', async route => {
        const request = route.request(), url = request.url();
        if (!['GET', 'HEAD'].includes(request.method())) requestsWithWrites.push(request.method() + ' ' + url);
        let resource;
        if (url.includes('unpkg.com/react-dom@')) resource = moduleFile('react-dom', 'umd/react-dom.development.js');
        else if (url.includes('unpkg.com/react@')) resource = moduleFile('react', 'umd/react.development.js');
        else if (url.includes('unpkg.com/@babel/standalone')) resource = moduleFile('@babel/standalone', 'babel.min.js');
        else if (url.includes('cdn.jsdelivr.net/npm/hls.js')) resource = moduleFile('hls.js', 'dist/hls.js');
        if (resource) return route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(resource) });
        if (url.includes('cdn.tailwindcss.com')) return route.fulfill({ contentType: 'application/javascript', body: `window.tailwind={};const style=document.createElement('style');style.textContent=${JSON.stringify(styles)};document.head.appendChild(style);` });
        if (request.resourceType() === 'image') return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=', 'base64') });
        return route.abort();
    });
    try {
        const N=require('../notices.js');
        let repositoryFeed={schemaVersion:1,notices:[]},sha='version-0',writes=0,dropResponse=false,apiReads=0;
        await context.route('https://api.github.com/**',async route=>{
            const request=route.request(),url=new URL(request.url());
            assert.equal(url.pathname,'/repos/sejo48/StreamTube-V20/contents/avisos.json');
            if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, PUT','Access-Control-Allow-Headers':'Authorization, Accept, Content-Type, X-GitHub-Api-Version'}});
            if(request.method()==='GET')apiReads++;
            if(request.headers()['authorization']!=='Bearer example-test-credential')return route.fulfill({status:401,headers:{'Access-Control-Allow-Origin':'*'},json:{message:'Bad credentials'}});
            if(request.method()==='GET')return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{sha,encoding:'base64',content:N.encode(repositoryFeed)}});
            assert.equal(request.method(),'PUT');
            const body=request.postDataJSON();
            if(body.sha!==sha)return route.fulfill({status:409,json:{message:'Conflict'}});
            repositoryFeed=N.validate(N.decode(body.content));sha='version-'+(++writes);
            files.set('avisos.json',JSON.stringify(repositoryFeed));
            if(dropResponse){dropResponse=false;return route.abort();}
            return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{commit:{sha:'commit-'+writes},content:{sha}}});
        });
        await context.route('https://raw.githubusercontent.com/sejo48/StreamTube-V20/main/**',async route=>{
            const filename=new URL(route.request().url()).pathname.split('/').pop();
            const body=files.has(filename)?files.get(filename):fs.readFileSync(path.join(principalRoot,filename));
            return route.fulfill({contentType:filename.endsWith('.m3u')?'text/plain':'application/json',headers:{'Access-Control-Allow-Origin':'*'},body});
        });
        const adminWarnings=[];const admin=await context.newPage();admin.on('console',message=>adminWarnings.push(message.text()));admin.on('pageerror',e=>errors.push(e.message));await admin.addInitScript(()=>localStorage.setItem('boxplay_github_pat','example-expired-credential')); await admin.goto(origin+'/admin/index.html#avisos');
        await admin.getByRole('heading',{name:'Avisos para la aplicación principal',exact:true}).waitFor();
        assert(await admin.getByRole('button',{name:'GitHub Sync',exact:true}).isVisible());
        await admin.getByRole('button',{name:/^Explorar TMDB/}).click();
        await admin.getByRole('heading',{name:'Explorar TMDB',exact:true}).waitFor();
        for (const [tab, filename, placeholder, saveLabel] of [
            [/^Películas/, 'peliculas.json', /Buscar película/, 'Guardar Película'],
            [/^Estrenos 2026/, 'peliculas2.json', /Buscar estreno/, 'Guardar Estreno']
        ]) {
            await admin.getByRole('button',{name:tab}).click();
            const cards=admin.locator('[data-poster-card]');
            await cards.first().waitFor();
            for (const width of [1280,390]) {
                await admin.setViewportSize({width,height:900});
                const first=await cards.nth(0).boundingBox(),second=await cards.nth(1).boundingBox();
                assert(Math.abs(first.y-second.y)<2);assert(second.x>first.x);
                assert(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
            }
            const title=JSON.parse(fs.readFileSync(path.join(principalRoot,filename),'utf8'))[0].titulo;
            await admin.getByPlaceholder(placeholder).fill(title);
            const card=cards.filter({has:admin.getByRole('button',{name:'Editar '+title,exact:true})}).first();
            await card.getByRole('button',{name:'Editar',exact:true}).click();
            await admin.getByRole('button',{name:saveLabel,exact:true}).waitFor();
            await admin.getByRole('button',{name:'Cancelar',exact:true}).click();
        }
        await admin.setViewportSize({width:1280,height:900});
        console.log('PASS: cuadrículas de portadas en PC y móvil, búsqueda y edición de películas y estrenos');
        await admin.getByRole('button',{name:'Enviar avisos',exact:true}).click();
        await admin.getByRole('heading',{name:'Avisos para la aplicación principal',exact:true}).waitFor();
        assert.equal(new URL(admin.url()).hash,'#avisos');
        assert.equal(await admin.getByLabel('Token personal de GitHub (PAT)').inputValue(),'example-expired-credential');
        assert.equal(apiReads,0);
        console.log('PASS: enlace directo, botón visible, credencial existente y Explorar TMDB conservado');

        await admin.getByRole('textbox',{name:'Título del aviso',exact:true}).fill('Estrenos de la semana');
        await admin.getByRole('textbox',{name:'Mensaje del aviso',exact:true}).fill('Películas nuevas <em>para todos</em> 🎬');
        await admin.getByRole('combobox',{name:'Sección del aviso',exact:true}).selectOption('movies2');
        assert(await admin.getByRole('button',{name:'Publicar aviso',exact:true}).isDisabled());
        await admin.getByRole('button',{name:'Comprobar conexión',exact:true}).click();
        await admin.getByRole('alert').filter({hasText:'GitHub rechazó el token'}).waitFor();
        assert.equal(writes,0);
        assert.equal(await admin.getByRole('textbox',{name:'Título del aviso',exact:true}).inputValue(),'Estrenos de la semana');
        assert(await admin.getByRole('button',{name:'Publicar aviso',exact:true}).isDisabled());
        await admin.getByLabel('Token personal de GitHub (PAT)').fill('example-test-credential');
        await admin.getByRole('button',{name:'Comprobar conexión',exact:true}).click();
        await admin.getByRole('status').filter({hasText:'Conexión verificada'}).waitFor();
        assert(!adminWarnings.some(text=>/cdn\.tailwindcss\.com should not|in-browser Babel transformer/.test(text)));
        console.log('PASS: producción sin transformadores CDN, lectura pública sin credencial, 401 diagnosticado, borrador conservado y conexión comprobada');
        await admin.getByRole('button',{name:'Publicar aviso',exact:true}).click();
        await admin.getByText('Aviso publicado. Aparecerá en la principal cuando se actualice el sitio.',{exact:true}).waitFor();
        assert.equal(repositoryFeed.notices.length,1);assert.equal(writes,1);
        assert.equal(await admin.evaluate(()=>localStorage.getItem('boxplay_github_pat')),'example-expired-credential');
        const primary=await context.newPage();primary.on('pageerror',e=>errors.push(e.message));
        await primary.setViewportSize({width:390,height:800});
        await primary.addInitScript(()=>{window.badgeCalls=[];Object.defineProperty(navigator,'setAppBadge',{configurable:true,value:async count=>window.badgeCalls.push(count)});Object.defineProperty(navigator,'clearAppBadge',{configurable:true,value:async()=>window.badgeCalls.push('clear')});});
        await primary.goto(origin+'/principal/');
        const bell=primary.getByRole('button',{name:'Avisos, 1 sin leer',exact:true});await bell.waitFor();
        assert(await primary.evaluate(()=>window.badgeCalls.includes(1)));
        const bellBox=await bell.boundingBox();assert(bellBox.x>=0 && bellBox.x+bellBox.width<=390);
        await bell.click();const panel=primary.getByRole('dialog',{name:'Avisos de Box Play TV'});await panel.waitFor();
        assert(await panel.getByText('Películas nuevas <em>para todos</em> 🎬',{exact:true}).isVisible());assert.equal(await panel.locator('em').count(),0);
        await panel.getByRole('button',{name:'Marcar todos como leídos',exact:true}).click();
        assert.equal(await primary.evaluate(()=>window.badgeCalls.at(-1)),'clear');
        await panel.getByRole('button',{name:'Cerrar avisos',exact:true}).click();
        await primary.reload();await primary.getByRole('button',{name:'Avisos',exact:true}).waitFor();
        assert.equal(await primary.getByRole('button',{name:'Avisos, 1 sin leer',exact:true}).count(),0);
        console.log('PASS: publicación desde administrador, aviso en principal, contador de campana/icono, texto escapado y lectura persistente');
        await admin.getByRole('textbox',{name:'Título del aviso',exact:true}).fill('Aviso de prueba con respuesta perdida');
        await admin.getByRole('textbox',{name:'Mensaje del aviso',exact:true}).fill('Un reintento no debe duplicar este aviso.');
        dropResponse=true;
        await admin.getByRole('button',{name:'Publicar aviso',exact:true}).click();
        await admin.getByRole('alert').filter({hasText:'No se confirmó'}).waitFor();
        assert.equal(repositoryFeed.notices.length,2);assert.equal(writes,2);
        await admin.getByRole('button',{name:'Publicar aviso',exact:true}).click();
        await admin.waitForFunction(()=>document.querySelector('input[aria-label="Título del aviso"]').value==='');
        assert.equal(repositoryFeed.notices.length,2);assert.equal(writes,2);
        await primary.getByRole('button',{name:'Avisos',exact:true}).click();
        await primary.getByText('Aviso de prueba con respuesta perdida',{exact:true}).waitFor();
        assert(await primary.evaluate(()=>window.badgeCalls.at(-1)===1));
        await admin.locator('article').filter({hasText:'Aviso de prueba con respuesta perdida'}).getByRole('button',{name:'Retirar aviso',exact:true}).click();
        await admin.getByRole('button',{name:'Confirmar',exact:true}).click();
        await admin.getByText('Aviso retirado. El cambio aparecerá al actualizarse el sitio.',{exact:true}).waitFor();
        await panel.getByRole('button',{name:'Actualizar avisos',exact:true}).click();
        await panel.getByText('Estás al día',{exact:true}).waitFor();assert.equal(await primary.evaluate(()=>window.badgeCalls.at(-1)),'clear');
        assert.equal(writes,3);assert.equal(repositoryFeed.notices.length,1);
        console.log('PASS: publicación idempotente después de respuesta perdida, retiro de aviso y limpieza del contador');
        await panel.getByRole('button',{name:'Cerrar avisos',exact:true}).click();
        await primary.setViewportSize({width:1280,height:900});
        const desktopBell=await primary.getByRole('button',{name:'Avisos',exact:true}).boundingBox();
        assert(desktopBell.x>=0 && desktopBell.x+desktopBell.width<=1280);
        assert.deepEqual(errors,[]);assert.deepEqual(requestsWithWrites,[]);
        console.log('PASS: sin excepciones; publicación simulada exclusivamente en avisos.json de StreamTube-V20');
        } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
