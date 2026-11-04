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
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];let fail=false;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',route=>route.abort());
  await page.route('https://www.googleapis.com/drive/v3/**',route=>{
   const u=new URL(route.request().url());
   assert.equal(u.searchParams.get('key'),'fake-key');
   if(u.pathname==='/drive/v3/files/folder_123456')return route.fulfill({json:{id:'folder_123456',name:'Temporada de prueba',mimeType:'application/vnd.google-apps.folder'}});
   if(u.pathname!=='/drive/v3/files')return route.fulfill({status:404,body:'Not found'});
   if(fail&&u.searchParams.has('pageToken'))return route.fulfill({status:403,json:{error:{message:'Denied'}}});
   return route.fulfill({json:u.searchParams.has('pageToken')?{files:[{id:'one',name:'E01.mp4',mimeType:'video/mp4'},{id:'two',name:'E02.mp4',mimeType:'video/mp4'}]}:{nextPageToken:'next',files:[{id:'ten',name:'E10.mp4',mimeType:'video/mp4'},{id:'known',name:'Piloto.mp4',mimeType:'video/mp4'},{id:'poster',name:'Portada.jpg',mimeType:'image/jpeg'}]}});
  });
  await page.addInitScript(()=>{
   for(const key of ['movies','estrenos','tudum','series','tv','animados','radios','videoteca'])localStorage.setItem('boxplay_admin_'+key,'[]');
   localStorage.setItem('boxplay_drive_api_key','fake-key');
   localStorage.setItem('boxplay_admin_series',JSON.stringify([{id:'serie',tituloSerie:'Serie prueba',imagen:'https://example.com/poster.jpg',codigo:'1234',temporadas:[{numeroTemporada:1,episodios:[{id:'existing',tituloEpisodio:'Piloto',urlDrive:'https://drive.google.com/file/d/known/view'}]}]}]));
  });
  await page.goto('http://127.0.0.1:'+server.address().port+'/#series');
  await page.locator('[data-poster-card] button').first().click();
  const open=page.getByRole('button',{name:'Importar episodios de Google Drive',exact:true});
  await open.click();let dialog=page.getByRole('dialog',{name:'Importar episodios de Google Drive'});
  await dialog.getByLabel('Enlace de la carpeta pública').fill('https://drive.google.com/drive/folders/folder_123456');
  await dialog.getByRole('button',{name:'Leer carpeta y revisar'}).click();
  await dialog.locator('.drive-import-list li').last().waitFor();
  assert.equal(await dialog.locator('.drive-import-list li').count(),4);
  if(process.env.DRIVE_IMPORT_SCREENSHOT)await page.screenshot({path:process.env.DRIVE_IMPORT_SCREENSHOT});
  assert.equal(await dialog.getByLabel('Título del episodio 1',{exact:true}).inputValue(),'E01');
  await dialog.getByLabel('Título del episodio 2',{exact:true}).fill('Segundo episodio');
  await dialog.getByLabel('Incluir E10.mp4',{exact:true}).uncheck();
  assert(await dialog.getByLabel('Incluir Piloto.mp4',{exact:true}).isDisabled());
  await dialog.getByRole('button',{name:'Añadir 2 episodios a temporada 1',exact:true}).click();
  await dialog.waitFor({state:'detached'});
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('boxplay_admin_series'))[0]);
  let saved=await read();assert.equal(saved.codigo,'1234');assert.deepEqual(saved.temporadas[0].episodios.map(x=>x.tituloEpisodio),['Piloto','E01','Segundo episodio']);
  await open.click();dialog=page.getByRole('dialog',{name:'Importar episodios de Google Drive'});
  await dialog.getByLabel('Enlace de la carpeta pública').fill('https://drive.google.com/drive/folders/folder_123456');
  await dialog.getByRole('button',{name:'Leer carpeta y revisar'}).click();
  await dialog.getByRole('button',{name:'Añadir 1 episodio a temporada 1',exact:true}).waitFor();
  await dialog.getByLabel('Temporada',{exact:true}).fill('2');
  assert(await dialog.getByRole('button',{name:'Añadir 1 episodio a temporada 2',exact:true}).count());
  await dialog.getByRole('button',{name:'Añadir 1 episodio a temporada 2',exact:true}).click();
  saved=await read();assert.equal(saved.temporadas.length,2);assert.equal(saved.temporadas[1].episodios[0].tituloEpisodio,'E10');
  // Failure on the second page must leave the series unchanged.
  const before=JSON.stringify(saved);fail=true;await open.click();dialog=page.getByRole('dialog',{name:'Importar episodios de Google Drive'});
  await dialog.getByLabel('Enlace de la carpeta pública').fill('https://drive.google.com/drive/folders/folder_123456');
  await dialog.getByRole('button',{name:'Leer carpeta y revisar'}).click();await dialog.getByRole('alert').waitFor();
  assert.equal(await dialog.locator('.drive-import-list li').count(),0);
  await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(JSON.stringify(await read()),before);
  await page.setViewportSize({width:390,height:844});await open.click();
  dialog=page.getByRole('dialog',{name:'Importar episodios de Google Drive'});assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth),'Mobile dialog has no horizontal overflow');
  await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();assert.deepEqual(errors,[]);
  console.log('Passed: folder preview, natural order, rename, exclusion, duplicate prevention, append, new season, pagination failure, cancel and mobile layout.');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
