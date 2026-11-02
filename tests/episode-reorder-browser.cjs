/* Native mouse dragging with isolated storage; exports never write to GitHub. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'..');
const principal=process.env.BOXPLAY_MAIN_ROOT || path.resolve(root,'../StreamTube-V20');
let published=[];
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const main=pathname.startsWith('/main/');const file=pathname.slice(main?6:1)||'index.html';
 if(file.includes('..')){res.writeHead(404);return res.end();}
 try{let body=main&&file==='doramas.json'?JSON.stringify(published):fs.readFileSync(path.join(main?principal:root,file));if(main&&file.endsWith('.html'))body=body.toString().replace(/<script type="module">[\s\S]*?<\/script>/g,'');res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'application/javascript');res.end(body);}catch{res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',async route=>{
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
 await page.addInitScript(()=>{
  if(sessionStorage.seeded)return;sessionStorage.seeded='yes';
  for(const key of ['movies','estrenos','tudum','series','tv','animados','doramas','radios','videoteca'])localStorage.setItem('boxplay_admin_'+key,'[]');
  for(const key of ['series','animados','doramas'])localStorage.setItem('boxplay_admin_'+key,JSON.stringify([{id:'show-'+key,titulo:'Prueba '+key,tituloSerie:'Prueba '+key,tmdbType:'tv',temporadas:[{numeroTemporada:1,episodios:[1,2,3].map(n=>({id:'ep-'+n,tituloEpisodio:'Episodio '+n,urlDrive:'https://example.test/'+n}))},{numeroTemporada:2,episodios:[{id:'other',tituloEpisodio:'Otra temporada',urlDrive:'https://example.test/other'}]}]}]));
 });
 try{
  for(const section of ['series','animados','doramas']){
   await page.goto('http://127.0.0.1:'+server.address().port+'/#'+section);await page.getByRole('button',{name:'Abrir Prueba '+section,exact:true}).click();
   const rows=page.locator('[data-episode-row]');await rows.first().waitFor();await page.waitForTimeout(700);
   await page.getByRole('button',{name:'Mover Episodio 1',exact:true}).dragTo(rows.nth(2));
   await page.waitForFunction(key=>JSON.parse(localStorage.getItem('boxplay_admin_'+key))[0].temporadas[0].episodios[2].id==='ep-1',section);
   assert.deepEqual(await rows.evaluateAll(list=>list.slice(0,3).map(row=>row.querySelector('p').textContent)),['1.Episodio 2','2.Episodio 3','3.Episodio 1']);
   // A drop into a different season must be ignored.
   await page.getByRole('button',{name:'Mover Episodio 1',exact:true}).dragTo(rows.nth(3));
   const state=await page.evaluate(key=>JSON.parse(localStorage.getItem('boxplay_admin_'+key))[0],section);assert.equal(state.temporadas[1].episodios.length,1);assert.equal(state.temporadas[0].episodios.length,3);
   await page.reload();await page.getByRole('button',{name:'Abrir Prueba '+section,exact:true}).click();
   assert.equal(await page.getByRole('button',{name:'Mover Episodio 2',exact:true}).count(),1);
   const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar',exact:true}).click();const download=await downloadPromise;const data=JSON.parse(fs.readFileSync(await download.path(),'utf8'));if(section==='doramas')published=data;
   assert.equal(data[0].temporadas[0].episodeOrder,'manual');assert.deepEqual(data[0].temporadas[0].episodios.map(e=>e.tituloEpisodio),['Episodio 2','Episodio 3','Episodio 1']);assert.equal(data[0].temporadas[0].episodios[2].urlDrive,'https://example.test/1');
  }
  await page.goto('http://127.0.0.1:'+server.address().port+'/main/');
  await page.getByRole('button',{name:'Comenzar Experiencia'}).waitFor();await page.waitForTimeout(2300);
  const start=page.getByRole('button',{name:'Comenzar Experiencia'});if(await start.isVisible())await start.click();
  await page.getByRole('button',{name:'Doramas',exact:true}).first().click();await page.getByRole('heading',{name:'Prueba doramas',exact:true}).click();
  await page.getByText('Episodio 2',{exact:true}).waitFor();
  assert.deepEqual(await page.locator('span').filter({hasText:/^Episodio [123]$/}).allTextContents(),['Episodio 2','Episodio 3','Episodio 1']);
  assert.deepEqual(errors,[]);console.log('Passed: native mouse reorder in Series, Animados and Doramas; season isolation, persistence, export order and unchanged playback links.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
