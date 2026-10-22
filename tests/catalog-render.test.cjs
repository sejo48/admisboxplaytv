const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),Babel=require('@babel/standalone');
const storage={getItem:()=>null,setItem:()=>{}};
const sandbox={React,ReactDOM:{createRoot:()=>({render:()=>{}})},BoxCatalog:require('../src/catalog-tools.js'),BoxNotices:require('../notices.js'),BoxHomeCovers:require('../home-covers.js'),localStorage:storage,window:{location:{hash:'',pathname:'/',search:''}},document:{getElementById:()=>({}),documentElement:{dataset:{adminTheme:'dark'}}},URL,URLSearchParams,setTimeout,clearTimeout,console};
const source=['src/catalog-ui.jsx','src/home-covers.jsx','src/app.jsx'].map(p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8')).join('\n');
const compiled=Babel.transform(source,{presets:['react']}).code+';globalThis.editors={App,MoviesEditor,Estrenos2026Editor,SeriesEditor,AnimadosEditor,TudumEditor,TmdbExplorer,ThemeToggle};';
vm.runInNewContext(compiled,sandbox);
const item={id:'sample',titulo:'Película de prueba',tituloSerie:'Serie de prueba',image:'https://example.com/poster.jpg',imagen:'https://example.com/poster.jpg',year:'2020',temporadas:[]};
const no=()=>{};
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
