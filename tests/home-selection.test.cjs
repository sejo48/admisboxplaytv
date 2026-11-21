const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const React=require('react'),Renderer=require('react-test-renderer'),Babel=require('@babel/standalone'),C=require('../home-covers.js');
const compiled=Babel.transform(fs.readFileSync(path.join(__dirname,'../src/home-covers.jsx'),'utf8')+'\nglobalThis.Editor=HomeCoversEditor;', {presets:['react']}).code;
const catalog=Array.from({length:6},(_,i)=>({tmdbId:i+100,titulo:'Película '+i,imagen:'https://images.test/poster-'+i,backdrop:'https://images.test/wide-'+i}));
const clone=value=>JSON.parse(JSON.stringify(value));
async function mount(){
 let config={schemaVersion:1,source:C.SOURCE,mode:'manual',items:catalog.slice(0,5).map(movie=>({movieKey:C.key(movie),title:C.title(movie),backdrop:C.image(movie)}))},sha='initial',writes=0,loseResponse=false;
 const storage=new Map([['boxplay_github_pat','fixture-token']]);
 const fetcher=async(url,options)=>{
  assert(url.includes('/contents/portadas-inicio.json'));
  if(!options.method)return {ok:true,json:async()=>({sha,encoding:'base64',content:C.encode(config)})};
  assert.equal(options.method,'PUT');const body=JSON.parse(options.body);assert.equal(body.sha,sha);
  config=C.validate(C.decode(body.content));sha='revision-'+(++writes);
  if(loseResponse){loseResponse=false;throw Error('Response lost');}
  return {ok:true,json:async()=>({commit:{sha},content:{sha}})};
 };
 const api={...C,read:async()=>clone(config),catalog:async()=>clone(catalog),probe:async url=>url.includes('portrait')?{width:900,height:1350}:{width:1920,height:1080},repository:token=>C.repository(token,fetcher),publish:args=>C.publish(args,fetcher)};
 const sandbox={React,BoxHomeCovers:api,localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)}};
 vm.runInNewContext(compiled,sandbox);let renderer;
 await Renderer.act(async()=>{renderer=Renderer.create(React.createElement(sandbox.Editor,{showToast(){},requestConfirm:(message,action)=>action()}));});
 const button=text=>renderer.root.findAllByType('button').find(node=>node.children.filter(child=>typeof child==='string').join('')===text);
 return {renderer,button,config:()=>config,writes:()=>writes,storage,
  choose:async i=>Renderer.act(async()=>renderer.root.findByProps({'aria-label':'Elegir '+catalog[i].titulo}).props.onClick()),
  changeImage:async image=>Renderer.act(async()=>renderer.root.findAllByType('input').find(node=>node.props.type==='url').props.onChange({target:{value:image}})),
  connect:async()=>Renderer.act(async()=>button('Comprobar conexión').props.onClick()),
  publish:async()=>Renderer.act(async()=>button('Publicar película de inicio').props.onClick()),
  loseResponse:()=>{loseResponse=true;},
  changeRemote:()=>{config={...config,updatedAt:'2030-01-01T00:00:00Z'};sha='other-session';}};
}
test('legacy selection opens as one movie; choosing another replaces it and persists one draft',async()=>{
 const h=await mount();
 assert.equal(h.renderer.root.findAll(node=>node.props['data-cover-slot']).length,1);
 assert.equal(h.renderer.root.findAllByType('h3')[0].children[0],catalog[0].titulo);
 await h.choose(4);await h.choose(2);
 assert.equal(h.renderer.root.findAllByType('h3')[0].children[0],catalog[2].titulo);
 const draft=JSON.parse(h.storage.get('boxplay_admin_home_feature_draft_v2'));
 assert.equal(draft.items.length,1);assert.equal(draft.items[0].movieKey,C.key(catalog[2]));
 assert.equal(h.config().items.length,5);assert.equal(h.writes(),0);
 await h.connect();await h.changeImage('https://images.test/portrait');
 assert.equal(h.button('Publicar película de inicio').props.disabled,true);
 await h.changeImage('https://images.test/custom-wide');await h.publish();
 assert.equal(h.writes(),1);assert.equal(h.config().schemaVersion,2);assert.equal(h.config().items.length,1);
 assert.equal(h.config().items[0].movieKey,C.key(catalog[2]));assert.equal(h.config().items[0].backdrop,'https://images.test/custom-wide');
 Renderer.act(()=>h.renderer.unmount());
});
test('a stale single-movie draft cannot overwrite another published choice',async()=>{
 const h=await mount();await h.choose(2);await h.connect();h.changeRemote();await h.publish();
 assert.equal(h.writes(),0);assert.match(h.renderer.root.findByProps({role:'alert'}).children.join(''),/selección publicada cambió/);
 assert.equal(JSON.parse(h.storage.get('boxplay_admin_home_feature_draft_v2')).items[0].movieKey,C.key(catalog[2]));
 Renderer.act(()=>h.renderer.unmount());
});
test('a lost publication response retries by confirming the same saved movie without a second write',async()=>{
 const h=await mount();await h.choose(1);await h.connect();h.loseResponse();await h.publish();
 assert.equal(h.writes(),1);assert.match(h.renderer.root.findByProps({role:'alert'}).children.join(''),/No se confirmó/);
 await h.publish();assert.equal(h.writes(),1);assert.equal(h.button('Publicar película de inicio').props.disabled,true);
 Renderer.act(()=>h.renderer.unmount());
});
