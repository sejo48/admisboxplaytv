/* Offline fixtures exercise real HLS decoding, status classification, cancellation,
   editor navigation, ordering and responsive grids. No catalog is published. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),fixtures=path.join(root,'work/tv-fixtures');
fs.mkdirSync(fixtures,{recursive:true});
execFileSync('ffmpeg',['-y','-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=blue:s=160x90:r=15','-t','4','-c:v','libx264','-threads','1','-preset','ultrafast','-pix_fmt','yuv420p','-g','15','-an','-f','hls','-hls_time','1','-hls_list_size','0','-hls_segment_filename',path.join(fixtures,'segment%d.ts'),path.join(fixtures,'live.m3u8')]);
execFileSync('ffmpeg',['-y','-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=blue:s=160x90:r=15','-t','2','-c:v','libx264','-threads','1','-preset','ultrafast','-pix_fmt','yuv420p','-movflags','+faststart','-an',path.join(fixtures,'live.mp4')]);
let streamRequests=0;
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
 if(name.includes('..')){res.writeHead(404);return res.end();}
 if(name.startsWith('checks/')) {
  streamRequests++;
  const file=name.slice(7);
  if(file==='missing.m3u8'){res.writeHead(404);return res.end();}
  if(file==='denied.m3u8'){res.writeHead(403);return res.end();}
  if(file==='slow.m3u8'){const timer=setTimeout(()=>res.end(''),20000);req.on('close',()=>clearTimeout(timer));return;}
  if(file==='broken.m3u8'){res.setHeader('Content-Type','application/vnd.apple.mpegurl');return res.end('#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\nabsent.ts\n#EXT-X-ENDLIST\n');}
  try{res.setHeader('Content-Type',file.endsWith('.m3u8')?'application/vnd.apple.mpegurl':file.endsWith('.ts')?'video/mp2t':'video/mp4');return res.end(fs.readFileSync(path.join(fixtures,file)));}catch{res.writeHead(404);return res.end();}
 }
 try{res.setHeader('Content-Type',name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'application/javascript');res.end(fs.readFileSync(path.join(root,name)));}catch{res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try {
  const page=await browser.newPage({viewport:{width:1920,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',route=>route.abort());
  await page.addInitScript(({origin})=>{
   if(localStorage.getItem('grid-fixtures-ready'))return;
   localStorage.setItem('grid-fixtures-ready','1');
   const channels=[['online','live.m3u8'],['missing','missing.m3u8'],['denied','denied.m3u8'],['broken','broken.m3u8'],['slow','slow.m3u8'],['dash','live.mpd'],['native','live.mp4']].map(([id,url])=>({id,title:'Canal '+id,group:'Pruebas',url:origin+'/checks/'+url}));
   const items=Array.from({length:8},(_,i)=>({id:'item-'+i,title:'Elemento '+i,album:'Álbum '+i,artist:'Artista',group:'Pruebas',url:origin+'/checks/live.m3u8'}));
   for(const name of ['movies','estrenos','tudum','series','animados','tv','radios','videoteca'])localStorage.setItem('boxplay_admin_'+name,JSON.stringify(name==='tv'?channels:['radios','videoteca'].includes(name)?items:[]));
  },{origin});
  await page.goto(origin+'/#tv');
  await page.locator('[data-media-card="online"]').waitFor();
  assert.equal(streamRequests,0,'No signal checks before a user action');
  await page.screenshot({path:path.join(root,'work/tv-grid.png'),fullPage:false});
  for(const width of [1920,1366,390]) {
   await page.setViewportSize({width,height:1000});
   for(const section of ['tv','radios','videoteca']) {
    await page.goto(origin+'/#'+section);
    const cards=page.locator('[data-media-card]');await cards.nth(1).waitFor();
    const [a,b]=await Promise.all([cards.nth(0).boundingBox(),cards.nth(1).boundingBox()]);
    assert(Math.abs(a.y-b.y)<2&&b.x>a.x,section+' has multiple columns at '+width);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),section+' has no overflow');
    assert.equal(await cards.locator('.media-profile').count(),0,'No profile banners inside cards');
   }
  }
  await page.setViewportSize({width:1366,height:1000});
  await page.goto(origin+'/#tv');
  for(const [id,status] of [['online','online'],['missing','offline'],['denied','unknown'],['broken','offline'],['dash','unknown'],['native','online']]) {
   const card=page.locator('[data-media-card="'+id+'"]');
   await card.getByRole('button',{name:'Revisar señal de Canal '+id,exact:true}).click();
   try { await card.locator('.channel-status-'+status).waitFor({timeout:17000}); } catch(error) { console.error(id, await card.locator('.channel-status').innerText()); throw error; }
  }
  const probe=await page.evaluate(async origin=>({
   cors:await BoxStreamHealth.check(origin.replace('127.0.0.1','localhost')+'/checks/live.m3u8',{timeoutMs:2000}),
   timeout:await BoxStreamHealth.check(origin+'/checks/slow.m3u8',{timeoutMs:200}),
   invalid:await BoxStreamHealth.check('')
  }),origin);
  assert.equal(probe.cors.status,'unknown');assert.equal(probe.timeout.status,'unknown');assert.equal(probe.invalid.status,'offline');
  const slow=page.locator('[data-media-card="slow"]');
  await slow.getByRole('button',{name:'Revisar señal de Canal slow',exact:true}).click();
  await slow.locator('.channel-status-checking').waitFor();
  await page.getByRole('button',{name:'Cancelar revisión',exact:true}).click();
  await slow.locator('.channel-status-unknown').waitFor();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.channel-status-checking').count(),0,'Cancellation clears pending checks');
  // Leaving a running check must abort without stale updates.
  await slow.getByRole('button',{name:'Revisar señal de Canal slow',exact:true}).click();
  await page.getByRole('button',{name:/Radios HD/}).click();
  await page.getByRole('button',{name:/TV en Vivo/}).click();
  await page.locator('[data-media-card="online"]').waitFor();
  assert.equal(await page.locator('.channel-status-checking').count(),0);
  // Full batch is bounded to three simultaneous probes and finishes with a count.
  await page.evaluate(()=>{window.maxChecking=0;window.checkObserver=new MutationObserver(()=>{window.maxChecking=Math.max(window.maxChecking,document.querySelectorAll('.channel-status-checking').length);});window.checkObserver.observe(document.body,{childList:true,subtree:true,attributes:true});});
  await page.getByRole('button',{name:'Revisar canales visibles (7)',exact:true}).click();
  await page.getByText(/Revisión finalizada: 7 de 7/).waitFor({timeout:25000});
  assert((await page.evaluate(()=>{window.checkObserver.disconnect();return window.maxChecking;}))<=3,'Batch limits simultaneous checks');
  // Batch honors the current search and completes all matching channels.
  await page.getByPlaceholder('Buscar canal por nombre o categoría...').fill('online');
  await page.getByRole('button',{name:'Revisar canales visibles (1)',exact:true}).click();
  await page.locator('[data-media-card="online"] .channel-status-online').waitFor({timeout:17000});
  await page.getByPlaceholder('Buscar canal por nombre o categoría...').fill('');
  // Changing a URL invalidates the old status, and the inline editor is revealed.
  await page.getByRole('button',{name:'Editar Canal online',exact:true}).click();
  const editor=page.getByRole('region',{name:'Editor de canal',exact:true});
  await editor.locator('input[name="url"]').fill(origin+'/checks/missing.m3u8');
  await editor.getByRole('button',{name:'Guardar Canal',exact:true}).click();
  assert.equal(await page.locator('[data-media-card="online"] .channel-status-unchecked').count(),1);
  assert.deepEqual(errors,[]);
  console.log('Passed: responsive TV/radio/music grids, real HLS + native video, missing streams and segments, access/CORS/timeout, cancellation, batch search, edit invalidation.');
 } finally {await browser.close();server.closeAllConnections();server.close();}
})().catch(error=>{console.error(error);server.closeAllConnections();server.close();process.exitCode=1;});
