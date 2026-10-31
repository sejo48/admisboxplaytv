const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/app.jsx'),'utf8');
const loop=source.slice(source.indexOf('                    for (const [filename, content] of Object.entries(datasets))'),source.indexOf("                    showToast('¡Los 8 archivos"));
const run=new (Object.getPrototypeOf(async()=>{}).constructor)('datasets','fetch','utf8ToBase64',`const repo='owner/repo',branch='feature/catalog',token='test';let count=0;const total=Object.keys(datasets).length,setStep=null;${loop}`);
const encode=text=>Buffer.from(text).toString('base64');

test('Sincroniza JSON de más de 1 MB conservando Unicode, SHA y rama',async()=>{
 const data={titulo:'Película 🦖',descripcion:'á'.repeat(600000)};
 const calls=[];
 await run({'peliculas2.json':data},async(url,options)=>{
  calls.push({url,options});
  if(!options.method){assert.equal(options.headers.Accept,'application/vnd.github.object+json');return {ok:true,json:async()=>({sha:'existing-sha',encoding:'none',content:''})};}
  const body=JSON.parse(options.body);
  assert.equal(body.sha,'existing-sha');assert.equal(body.branch,'feature/catalog');
  assert.deepEqual(JSON.parse(Buffer.from(body.content,'base64').toString('utf8')),data);
  return {ok:true};
 },encode);
 assert.equal(calls.length,2);
 assert.match(calls[0].url,/ref=feature%2Fcatalog/);
});

test('Crea archivos inexistentes sin SHA',async()=>{
 await run({'new.json':[]},async(url,options)=>{
  if(!options.method)return {ok:false,status:404};
  assert.equal('sha' in JSON.parse(options.body),false);return {ok:true};
 },encode);
});

test('Detiene la sincronización si falla la consulta del SHA',async()=>{
 let calls=0;
 await assert.rejects(run({'peliculas2.json':[]},async()=>{
  calls++;return {ok:false,status:403,json:async()=>({message:'Forbidden'})};
 },encode),/Error consultando peliculas2.json: Forbidden/);
 assert.equal(calls,1);
});
