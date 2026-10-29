const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),Babel=require('@babel/standalone');
const storage={getItem:()=>null,setItem:()=>{}};
const sandbox={React,ReactDOM:{createRoot:()=>({render:()=>{}})},BoxCatalog:require('../src/catalog-tools.js'),BoxNotices:require('../notices.js'),BoxHomeCovers:require('../home-covers.js'),localStorage:storage,window:{location:{hash:'',pathname:'/',search:''}},document:{getElementById:()=>({}),documentElement:{dataset:{adminTheme:'dark'}}},URL,URLSearchParams,setTimeout,clearTimeout,console};
const source=['src/catalog-ui.jsx','src/home-covers.jsx','src/app.jsx'].map(p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8')).join('\n');
const compiled=Babel.transform(source,{presets:['react']}).code+';globalThis.editors={App,MoviesEditor,Estrenos2026Editor,SeriesEditor,AnimadosEditor,TudumEditor,TmdbExplorer,ThemeToggle,TvEditor,RadiosEditor,VideotecaEditor};';
vm.runInNewContext(compiled,sandbox);
const item={id:'sample',titulo:'Película de prueba',tituloSerie:'Serie de prueba',image:'https://example.com/poster.jpg',imagen:'https://example.com/poster.jpg',year:'2020',temporadas:[]};
const no=()=>{};
test('Películas y Estrenos ofrecen una casilla Navidad que respeta las decisiones guardadas',()=>{
 for(const [name,list,set] of [['MoviesEditor','movies','setMovies'],['Estrenos2026Editor','estrenos','setEstrenos']]) {
  for(const navidad of [undefined,true,false]) {
   const draft={...item,titulo:'El Grinch',navidad};
   const html=renderToStaticMarkup(React.createElement(sandbox.editors[name],{[list]:[draft],[set]:no,initialEdit:draft,showToast:no,requestConfirm:no,onTestPlayer:no}));
   assert(html.includes('🎄 Incluir en Navidad'));
   const checkbox=html.match(/<input[^>]*name="navidad"[^>]*>/)[0];
   assert.equal(checkbox.includes('checked=""'),navidad===true);
  }
 }
});

test('Exportar y GitHub Sync conservan Navidad y los enlaces en ambos catálogos',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../src/app.jsx'),'utf8');
 const sample=[{...item,navidad:true,urlDrive:'https://drive.google.com/file/d/prueba/view'}, {...item,id:'two',titulo:'El Grinch',navidad:false}, {...item,id:'three',titulo:'Automático'}];
 const metadata=item=>Object.fromEntries(['tmdbId','tmdbType'].filter(k=>item[k]!==undefined).map(k=>[k,item[k]]));
 const context={BoxCatalog:sandbox.BoxCatalog,movies:sample,estrenos:sample,tudumList:[],series:[],animados:[],radios:[],videoteca:[],channels:[],generateM3U:()=>'',tmdbMetadata:metadata};
 const start=app.indexOf('const datasets = ')+17;
 const end=app.indexOf(';\n\n                try {',start);
 const datasets=vm.runInNewContext('('+app.slice(start,end)+')',context);
 const outputs=[datasets['peliculas.json'],datasets['peliculas2.json']];
 for(const variable of ['exportMovies','exportEstrenos']) {
  const begin=app.indexOf('const '+variable+' = ')+('const '+variable+' = ').length;
  const finish=app.indexOf(';\n                downloadFile',begin);
  outputs.push(vm.runInNewContext(app.slice(begin,finish),context));
 }
 for(const output of outputs) {
  const restored=JSON.parse(JSON.stringify(output));
  assert.equal(restored[0].navidad,true);
  assert.equal(restored[1].navidad,false);
  assert.equal(Object.hasOwn(restored[2],'navidad'),false);
  assert.equal(restored[0].urlDrive,sample[0].urlDrive);
 }
});
test('Todos los catálogos de cine y series muestran portadas en cuadrícula',()=>{
 const cases=[['MoviesEditor',{movies:[item],setMovies:no}],['Estrenos2026Editor',{estrenos:[item],setEstrenos:no}],['SeriesEditor',{series:[item],setSeries:no}],['AnimadosEditor',{animados:[item],setAnimados:no}],['TudumEditor',{tudumList:[item],setTudumList:no}]];
 for(const [name,props] of cases){const result=renderToStaticMarkup(React.createElement(sandbox.editors[name],{...props,showToast:no,requestConfirm:no,onTestPlayer:no}));assert(result.includes('class="catalog-grid"'),name);assert(result.includes('data-poster-card='),name);assert(result.includes('Ordenar títulos'),name);}
});
test('El buscador distingue series y el destino contextual',()=>{
 const catalogs={movies:[[],no],estrenos:[[],no],series:[[],no],animados:[[],no],tudum:[[],no]};
 const result=renderToStaticMarkup(React.createElement(sandbox.editors.TmdbExplorer,{catalogs,showToast:no,onOpenEditor:no,initialDestination:'series',initialType:'tv'}));
 assert(result.includes('aria-label="Buscar series en TMDB"'));
 assert(result.includes('<option value="series" selected="">Series</option>'));
 assert(result.includes('Año de estreno en TMDB'));
});
test('El control de tema arranca en modo oscuro',()=>{
 const result=renderToStaticMarkup(React.createElement(sandbox.editors.ThemeToggle));
 assert(result.includes('Activar modo claro'));assert(result.includes('aria-pressed="true"'));
});

test('La navegación completa incluye Resumen y todas las secciones',()=>{
 let calls=0;
 const wrapped={...React,useState:initial=>React.useState(++calls===4?false:initial)};
 const context={...sandbox,React:wrapped};
 vm.runInNewContext(compiled,context);
 const result=renderToStaticMarkup(React.createElement(context.editors.App));
 assert(result.includes('admin-overview'));assert(result.includes('Elegir sección'));assert(result.includes('aria-current="page"'));assert(result.includes('Añadir desde TMDB'));
});


test('TV, radios y música muestran colecciones de tarjetas compactas',()=>{
 const cases=[['TvEditor',{channels:[{id:'tv',title:'Canal',url:'https://example.com/live.m3u8'}],setChannels:no}],['RadiosEditor',{radios:[{id:'radio',title:'Radio'}],setRadios:no}],['VideotecaEditor',{videoteca:[{id:'album',album:'Disco',tracks:[]}],setVideoteca:no}]];
 for(const [name,props] of cases){const html=renderToStaticMarkup(React.createElement(sandbox.editors[name],{...props,showToast:no,requestConfirm:no,onTestPlayer:no}));assert(html.includes('media-grid'),name);assert(html.includes('data-media-card='),name);assert(!html.includes('max-h-[60vh]'),name);}
});

