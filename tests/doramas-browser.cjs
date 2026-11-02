/* Isolated fixtures: exercises authoring, exports and client navigation without remote writes. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),principal='/workspace/StreamTube-V20';
let published=[];
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const main=pathname.startsWith('/main/');const file=pathname.slice(main?6:1)||'index.html';
 if(file.includes('..')){res.writeHead(404);return res.end();}
 try{
  let body=main&&file==='doramas.json'?JSON.stringify(published):fs.readFileSync(path.join(main?principal:root,file));
  if(file.endsWith('.html'))body=body.toString().replace(/<script type="module">[\s\S]*?<\/script>/g,'');
  res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'application/javascript');res.end(body);
 }catch{res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}}),errors=[];
 await context.route('https://**/*',async route=>{
  const url=route.request().url();let file;
  if(url.includes('unpkg.com/react-dom@'))file='react-dom/umd/react-dom.development.js';
  else if(url.includes('unpkg.com/react@'))file='react/umd/react.development.js';
  else if(url.includes('unpkg.com/@babel/standalone'))file='@babel/standalone/babel.min.js';
  else if(url.includes('cdn.jsdelivr.net/npm/hls.js'))file='hls.js/dist/hls.js';
  if(file)return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(root,'node_modules',file))});
  if(url.includes('cdn.tailwindcss.com'))return route.fulfill({contentType:'application/javascript',body:'window.tailwind={};'});
  if(route.request().resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"/>'});
  return route.abort();
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{if(!sessionStorage.seeded){for(const key of ['movies','estrenos','tudum','series','tv','animados','doramas','radios','videoteca'])localStorage.setItem('boxplay_admin_'+key,'[]');sessionStorage.seeded='yes';}});
 try{
  await page.goto(origin+'/#doramas');await page.getByRole('button',{name:'Nuevo',exact:true}).click();
  await page.getByLabel('Tipo de contenido',{exact:true}).selectOption('movie');
  let form=page.locator('form').filter({has:page.getByRole('button',{name:'Guardar Dorama'})});
  await form.locator('[name=titulo]').fill('Película Seúl');await form.locator('[name=imagen]').fill('https://images.test/movie.jpg');await form.locator('[name=urlDrive]').fill('https://example.test/movie.mp4');await form.locator('[name=codigo]').fill('1234');
  await form.getByRole('button',{name:'Guardar Dorama'}).click();
  await page.getByRole('button',{name:'Nuevo',exact:true}).click();
  assert.equal(await page.getByLabel('Tipo de contenido',{exact:true}).inputValue(),'tv');
  form=page.locator('form').filter({has:page.getByRole('button',{name:'Guardar Dorama'})});
  await form.locator('[name=titulo]').fill('Serie Busán');await form.locator('[name=imagen]').fill('https://images.test/series.jpg');await form.getByRole('button',{name:'Guardar Dorama'}).click();
  await page.getByRole('button',{name:'Añadir Temporada',exact:true}).click();await page.getByRole('button',{name:'+ Añadir Episodio',exact:true}).click();
  form=page.locator('form').filter({has:page.locator('[name=tituloEpisodio]')});await form.locator('[name=tituloEpisodio]').fill('Primer encuentro');await form.locator('[name=urlDrive]').fill('https://example.test/ep1.mp4');await form.getByRole('button',{name:/Guardar/}).click();
  await page.waitForFunction(()=>JSON.parse(localStorage.boxplay_admin_doramas).some(x=>x.temporadas?.[0]?.episodios?.length));
  await page.reload();await page.getByRole('button',{name:'Abrir Serie Busán',exact:true}).click();assert.equal(await page.getByText('Primer encuentro',{exact:true}).count(),1);
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar',exact:true}).click();const download=await downloadPromise;
  assert.equal(download.suggestedFilename(),'doramas.json');published=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
  assert.equal(published.length,2);assert.equal(published.find(x=>x.tmdbType==='movie').codigo,'1234');assert.equal(published.find(x=>x.tmdbType==='tv').temporadas[0].episodios[0].urlDrive,'https://example.test/ep1.mp4');assert(published.every(x=>!x.isNew&&!x.__formRevision));
  await page.getByRole('button',{name:'Buscar ficha en TMDB →',exact:true}).click();assert.equal(await page.getByLabel('Catálogo de destino').inputValue(),'doramas');await page.getByLabel('Tipo de contenido TMDB').selectOption('movie');assert.equal(await page.getByLabel('Catálogo de destino').inputValue(),'doramas');
  await page.setViewportSize({width:390,height:844});await page.getByLabel('Elegir sección').selectOption('doramas');assert.equal(await page.getByRole('button',{name:'Abrir Película Seúl',exact:true}).count(),1);
  // The same exported JSON loads in the public application and TV interface.
  await page.setViewportSize({width:1440,height:1000});await page.goto(origin+'/main/');
  await page.getByRole('button',{name:'Comenzar Experiencia'}).waitFor();await page.waitForTimeout(2300);
  const start=page.getByRole('button',{name:'Comenzar Experiencia'});if(await start.isVisible())await start.click();
  await page.getByRole('button',{name:'Doramas',exact:true}).first().click();await page.getByRole('heading',{name:'Serie Busán',exact:true}).waitFor();await page.getByRole('heading',{name:'Película Seúl',exact:true}).waitFor();
  await page.getByRole('heading',{name:'Serie Busán',exact:true}).click();await page.getByText('Temporada 1',{exact:false}).first().waitFor();await page.getByText('Primer encuentro',{exact:true}).waitFor();
  await page.goto(origin+'/main/smart-tv.html');await page.locator('#doramas').click();await page.getByRole('button',{name:'Serie Busán',exact:true}).click();assert.equal(await page.locator('#series-browser').isVisible(),true);await page.locator('#detail-close').click();await page.getByRole('button',{name:'Película Seúl',exact:true}).click();assert.equal(await page.locator('#series-browser').isVisible(),false);assert.equal(await page.locator('#watch').isVisible(),true);
  assert.deepEqual(errors,[]);console.log('Passed: Doramas authoring, movie/series type, seasons, episodes, reload, JSON export, contextual TMDB, mobile, main application and Smart TV. No remote writes.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
