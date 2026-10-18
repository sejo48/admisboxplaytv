/* End-to-end curation across the real admin production build and the principal app.
   All GitHub writes and photos are simulated; no production content is published. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),principal=path.resolve(root,'../StreamTube-V20');
const Covers=require('../home-covers.js');
assert.equal(fs.readFileSync(path.join(principal,'home-covers.js'),'utf8'),fs.readFileSync(path.join(root,'home-covers.js'),'utf8'));
const catalog=Array.from({length:6},(_,i)=>({tmdbId:9000+i,titulo:'Estreno elegido '+i,year:i?'2026':'2024',fechaEstreno:i?'2026-10-0'+i:'2024-01-01',descripcion:'Sinopsis del estreno '+i,backdrop:'https://images.test/panorama-'+i+'.jpg',imagen:'https://images.test/poster-'+i+'.jpg',urlDrive:'https://drive.google.com/file/d/fixture-'+i+'/view'}));
const files=new Map([['peliculas2.json',JSON.stringify(catalog)]]);
let config=Covers.automatic(),sha='version-0',writes=0,apiReads=0,dropResponse=false,failConfig=false;
files.set(Covers.FILE,JSON.stringify(config));
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost'),mount=url.pathname.startsWith('/principal/')?'/principal/':'/admin/';
 const name=url.pathname.slice(mount.length)||'index.html';
 if(req.method!=='GET'||name.includes('..')||(name.includes('/')&&!/^(?:assets|icons)\/[\w.-]+$/.test(name))){res.writeHead(404);return res.end();}
 if(failConfig&&name===Covers.FILE){res.writeHead(503);return res.end();}
 try{
  let body=mount==='/principal/'&&files.has(name)?files.get(name):fs.readFileSync(path.join(mount==='/principal/'?principal:root,name));
  if(name.endsWith('.html'))body=body.toString().replace(/<script type="module">[\s\S]*?<\/script>/g,'<!-- Firebase omitted from offline integration -->');
  res.setHeader('Content-Type',name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':name.endsWith('.m3u')?'text/plain':'application/json');res.end(body);
 }catch{res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const context=await browser.newContext(),errors=[],unexpectedWrites=[];
 const moduleFile=(name,file)=>path.join(path.dirname(require.resolve(name+'/package.json')),file);
 const styles=fs.readFileSync(process.env.BOXPLAY_TEST_CSS,'utf8');
 await context.route('https://**/*',async route=>{
  const req=route.request(),url=req.url();
  if(!['GET','HEAD'].includes(req.method()))unexpectedWrites.push(req.method()+' '+url);
  const modules=[['unpkg.com/react-dom@','react-dom','umd/react-dom.development.js'],['unpkg.com/react@','react','umd/react.development.js'],['unpkg.com/@babel/standalone','@babel/standalone','babel.min.js'],['cdn.jsdelivr.net/npm/hls.js','hls.js','dist/hls.js']];
  for(const [match,name,file] of modules)if(url.includes(match))return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(moduleFile(name,file))});
  if(url.includes('cdn.tailwindcss.com'))return route.fulfill({contentType:'application/javascript',body:`window.tailwind={};const s=document.createElement('style');s.textContent=${JSON.stringify(styles)};document.head.appendChild(s);`});
  if(req.resourceType()==='image'){
   if(url.includes('broken'))return route.fulfill({status:404,body:''});
   const [w,h]=url.includes('portrait')?[900,1350]:[1920,1080];
   return route.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#164e63"/></svg>`});
  }
  return route.abort();
 });
 await context.route('https://raw.githubusercontent.com/sejo48/StreamTube-V20/main/**',async route=>{
  const name=new URL(route.request().url()).pathname.split('/').pop();
  if(failConfig&&name===Covers.FILE)return route.fulfill({status:503,body:''});
  return route.fulfill({contentType:name.endsWith('.m3u')?'text/plain':'application/json',body:files.get(name)||fs.readFileSync(path.join(principal,name)),headers:{'Access-Control-Allow-Origin':'*'}});
 });
 await context.route('https://api.github.com/**',async route=>{
  const req=route.request(),url=new URL(req.url());assert.equal(url.pathname,'/repos/sejo48/StreamTube-V20/contents/'+Covers.FILE);
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, PUT','Access-Control-Allow-Headers':'Authorization, Accept, Content-Type, X-GitHub-Api-Version'}});
  if(req.method()==='GET')apiReads++;
  if(req.headers()['authorization']!=='Bearer example-valid-credential')return route.fulfill({status:401,json:{message:'Bad credentials'},headers:{'Access-Control-Allow-Origin':'*'}});
  if(req.method()==='GET')return route.fulfill({json:{sha,encoding:'base64',content:Covers.encode(config)},headers:{'Access-Control-Allow-Origin':'*'}});
  assert.equal(req.method(),'PUT');const body=req.postDataJSON();assert.equal(body.branch,'main');assert.equal(body.sha,sha);
  config=Covers.validate(Covers.decode(body.content));sha='version-'+(++writes);files.set(Covers.FILE,JSON.stringify(config));
  assert(!JSON.stringify(config).includes('credential'));
  if(dropResponse){dropResponse=false;return route.abort();}
  return route.fulfill({json:{content:{sha},commit:{sha:'commit-'+writes}},headers:{'Access-Control-Allow-Origin':'*'}});
 });
 try{
  const admin=await context.newPage();admin.on('pageerror',error=>errors.push(error.message));
  await admin.addInitScript(()=>localStorage.setItem('boxplay_github_pat','example-expired-credential'));
  await admin.goto(origin+'/admin/#portadas');
  const editor=admin.getByRole('region',{name:'Editor de portadas de inicio'});await editor.getByRole('heading',{name:'Elegir desde Estrenos 2026'}).waitFor();
  assert.equal(apiReads,0);assert.equal(writes,0);
  assert.equal(await editor.locator('[aria-label="Estrenos disponibles"] article').count(),6);
  for(const width of [1280,390]){await admin.setViewportSize({width,height:900});assert(await admin.getByRole('button',{name:'Portadas de inicio',exact:true}).isVisible());assert(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  for(let i=0;i<5;i++)await editor.getByRole('button',{name:'Elegir '+catalog[i].titulo,exact:true}).click();
  await admin.waitForFunction(()=>Array.from(document.querySelectorAll('[data-cover-slot]')).filter(el=>el.textContent.includes('Panorámica verificada')).length===5);
  assert(await editor.getByRole('button',{name:'Elegir '+catalog[5].titulo,exact:true}).isDisabled());
  await editor.getByRole('button',{name:'Quitar '+catalog[4].titulo,exact:true}).click();
  assert(!(await editor.getByRole('button',{name:'Elegir '+catalog[5].titulo,exact:true}).isDisabled()));
  await editor.getByRole('button',{name:'Elegir '+catalog[5].titulo,exact:true}).click();
  const firstImage=editor.getByRole('textbox',{name:'Imagen panorámica de '+catalog[0].titulo,exact:true});
  await firstImage.fill('https://images.test/portrait.jpg');await editor.getByText('La imagen es vertical o cuadrada. Usa una panorámica.',{exact:true}).waitFor();
  await firstImage.fill('https://images.test/broken.jpg');await editor.getByText('No se pudo cargar la imagen. Revisa el enlace.',{exact:true}).waitFor();
  await firstImage.fill('https://images.test/custom-wide.jpg');
  await admin.reload();await editor.getByRole('heading',{name:'Elegir desde Estrenos 2026'}).waitFor();
  assert.equal(await editor.getByRole('textbox',{name:'Imagen panorámica de '+catalog[0].titulo,exact:true}).inputValue(),'https://images.test/custom-wide.jpg');
  assert.equal(await editor.locator('[data-cover-slot] input').count(),5);
  await editor.getByRole('button',{name:'Comprobar conexión',exact:true}).click();
  await editor.getByRole('alert').filter({hasText:'GitHub rechazó el token'}).waitFor();assert.equal(writes,0);
  await editor.getByLabel('Token personal de GitHub (PAT)').fill('example-valid-credential');
  await editor.getByRole('button',{name:'Comprobar conexión',exact:true}).click();await editor.getByRole('status').filter({hasText:'Conexión verificada'}).waitFor();
  await editor.getByRole('button',{name:'Publicar cinco portadas',exact:true}).click();await editor.getByRole('status').filter({hasText:'Cinco portadas publicadas'}).waitFor();
  for(const width of [320,390,1280]){
   await admin.setViewportSize({width,height:900});
   assert(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Selected cover editor must fit at ${width}px`);
   const previews=await editor.locator('[data-cover-slot] img').evaluateAll(images=>images.map(img=>({width:img.clientWidth,height:img.clientHeight,fit:getComputedStyle(img).objectFit})));
   assert.equal(previews.length,5);assert(previews.every(img=>img.width>0&&Math.abs(img.width/img.height-16/9)<.03&&img.fit==='contain'));
  }
  await admin.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await admin.screenshot({path:'/tmp/box-admin-home-covers.png'});
  assert.equal(writes,1);assert.equal(config.mode,'manual');assert.deepEqual(config.items.map(item=>item.movieKey),[0,1,2,3,5].map(i=>Covers.key(catalog[i])));
  assert.equal(await admin.evaluate(()=>localStorage.getItem('boxplay_github_pat')),'example-expired-credential');
  console.log('PASS: visible Portadas entry, five-only selection, portrait/broken-image validation, draft persistence, explicit credential verification and isolated publication');
  const primary=await context.newPage();primary.on('pageerror',error=>errors.push(error.message));
  await primary.addInitScript(()=>Math.random=()=>.99999999);
  await primary.goto(origin+'/principal/');const hero=primary.getByRole('region',{name:'Película recomendada'});await hero.locator('h1').waitFor();
  assert.equal((await hero.locator('h1').textContent()).trim(),catalog[0].titulo);
  assert.equal(await hero.locator('.home-feature-backdrop').getAttribute('src'),'https://images.test/custom-wide.jpg');
  for(let i=0;i<4;i++){
   const previous=(await hero.locator('h1').textContent()).trim();await primary.reload();await hero.locator('h1').waitFor();
   const next=(await hero.locator('h1').textContent()).trim();assert.notEqual(next,previous);assert(config.items.some(item=>item.title===next));
  }
  console.log('PASS: principal honors selected older Estrenos and custom panoramas; every reopening alternates exclusively among the published five');
  await editor.getByRole('textbox',{name:'Imagen panorámica de '+catalog[0].titulo,exact:true}).fill('https://images.test/changed-wide.jpg');
  // Another administrator publishes after this draft was opened.
  config={...config,updatedAt:'2026-10-18T12:34:56.000Z'};sha='other-session';files.set(Covers.FILE,JSON.stringify(config));
  await editor.getByRole('button',{name:'Publicar cinco portadas',exact:true}).click();
  await editor.getByRole('alert').filter({hasText:'La selección publicada cambió'}).waitFor();assert.equal(writes,1);
  assert.equal(await editor.getByRole('textbox',{name:'Imagen panorámica de '+catalog[0].titulo,exact:true}).inputValue(),'https://images.test/changed-wide.jpg');
  await editor.getByRole('button',{name:'Cargar selección publicada',exact:true}).click();await admin.getByRole('button',{name:'Confirmar',exact:true}).click();
  await editor.getByRole('heading',{name:'Elegir desde Estrenos 2026'}).waitFor();
  const updatedInput=editor.getByRole('textbox',{name:'Imagen panorámica de '+catalog[0].titulo,exact:true});
  await updatedInput.fill('https://images.test/retry-wide.jpg');dropResponse=true;
  await editor.getByRole('button',{name:'Publicar cinco portadas',exact:true}).click();
  await editor.getByRole('alert').filter({hasText:'No se confirmó'}).waitFor();assert.equal(writes,2);
  await editor.getByRole('button',{name:'Publicar cinco portadas',exact:true}).click();await editor.getByRole('status').filter({hasText:'Cinco portadas publicadas'}).waitFor();assert.equal(writes,2);
  console.log('PASS: stale drafts cannot overwrite a newer selection; lost-response retry confirms the existing publication without another commit');
  const retained=(await hero.locator('h1').textContent()).trim();failConfig=true;
  await primary.waitForTimeout(1100);await primary.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await primary.getByRole('status').filter({hasText:'Se conservó el catálogo anterior'}).waitFor();assert.equal((await hero.locator('h1').textContent()).trim(),retained);
  assert.deepEqual(errors,[]);assert.deepEqual(unexpectedWrites,[]);
  console.log('PASS: failed configuration refresh retains the previous cover; no JavaScript exceptions or writes outside the simulated configuration endpoint');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
