const test=require('node:test');
const assert=require('node:assert/strict');
const tools=require('../src/catalog-tools.js');

test('Navidad está desmarcada por defecto y solo acepta selección manual',()=>{
 assert.equal(tools.isChristmas({titulo:'Una película',navidad:true}),true);
 assert.equal(tools.isChristmas({titulo:'El Grinch',navidad:false}),false);
 assert.equal(tools.isChristmas({descripcion:'Una aventura navideña'}),false);
 assert.equal(tools.isChristmas({titulo:'El Grinch',keywords:'christmas, santa claus'}),false);
 assert.equal(tools.isChristmas({navidad:'true'}),false);
 assert.equal(tools.isChristmas({}),false);
 assert.equal(tools.isChristmas({titulo:'Drama',similares:[{titulo:'Navidad'}],reparto:[{nombre:'Noel'}]}),false);
 for(const navidad of [true,false]) {
  const restored=JSON.parse(JSON.stringify(tools.christmasMetadata({navidad})));
  assert.equal(restored.navidad,navidad);
  assert.equal(tools.draft({titulo:'Ficha TMDB renovada'}, {navidad}, 'movies').navidad,navidad);
 }
 assert.deepEqual(tools.christmasMetadata({titulo:'El Grinch'}),{});
});

test('Busca sin tildes y filtra géneros/años sin cambiar el catálogo',()=>{
 const items=[{titulo:'Érase una vez',year:'2020',genres:[{name:'Animación'}]},{titulo:'Titanic',year:'1997',generosTexto:'Drama, Romance'},{titulo:'Dune',year:'2021',rating:8}];
 assert.equal(tools.filter(items,{search:'erase'})[0],items[0]);
 assert.equal(tools.filter(items,{genre:'animacion',year:'2020'})[0],items[0]);
 assert.deepEqual(tools.filter(items,{sort:'title'}).map(tools.title),['Dune','Érase una vez','Titanic']);
 assert.deepEqual(items.map(tools.title),['Érase una vez','Titanic','Dune']);
 assert.equal(tools.filter(items,{year:'2000'}).length,0);
});

test('Identifica duplicados por TMDB y distingue remakes y películas de series',()=>{
 const old={id:'classic',titulo:'Dune',year:'1984',tmdbId:841,tmdbType:'movie'};
 const modern={titulo:'Dune',year:'2021',tmdbId:438631,tmdbType:'movie'};
 assert.equal(tools.findMatch([old],modern),undefined);
 assert.equal(tools.findMatch([old],{titulo:'DUNE',year:'1984'}),old);
 assert.equal(tools.findMatch([old],{titulo:'Otro título traducido',tmdbId:'841',tmdbType:'movie'}),old);
 assert.equal(tools.findMatch([old],{titulo:'Dune',year:'1984',tmdbType:'tv'}),undefined);
});

test('Actualizar la ficha conserva PIN, enlaces y temporadas',()=>{
 const existing={id:'series-1',tituloSerie:'La serie',codigo:'1234',urlDrive:'https://drive.google.com/example',urlOkRu:'https://ok.ru/video/123',temporadas:[{numeroTemporada:1,episodios:[{tituloEpisodio:'Uno',urlDrive:'video'}]}]};
 const next=tools.draft({titulo:'La serie',imagen:'poster',tmdbId:123,tmdbType:'tv',sinopsis:'Nueva sinopsis'},existing,'series');
 assert.equal(next.id,existing.id);assert.equal(next.codigo,'1234');assert.equal(next.urlOkRu,existing.urlOkRu);assert.equal(next.urlDrive,existing.urlDrive);assert.equal(next.temporadas,existing.temporadas);assert.equal(next.isNew,false);
 const movie=tools.draft({titulo:'Nueva película',tmdbType:'movie'},null,'movies');
 assert.equal(movie.isNew,true);assert.equal(movie.urlDrive,'');
});

test('Usa los endpoints y filtros de año correctos para películas y series',()=>{
 const movie=new URL(tools.searchURL({key:'test',query:'Titanic',year:'1997'}));
 assert.equal(movie.pathname,'/3/search/movie');assert.equal(movie.searchParams.get('primary_release_year'),'1997');
 const tv=new URL(tools.searchURL({key:'test',mediaType:'tv',query:'Dark',year:'2017'}));
 assert.equal(tv.pathname,'/3/search/tv');assert.equal(tv.searchParams.get('first_air_date_year'),'2017');
 const popular=new URL(tools.searchURL({key:'test',category:'popular',year:'2026'}));
 assert.equal(popular.pathname,'/3/movie/popular');assert.equal(popular.searchParams.has('primary_release_year'),false);
 assert.throws(()=>tools.searchURL({key:'test',mediaType:'tv',category:'upcoming'}));
});

test('La revisión detecta Google Drive aunque exista otra reproducción y no modifica las fichas',()=>{
 const item=Object.freeze({titulo:'Prueba',urlDrive:'   ',urlOkRu:'https://ok.ru/video/123'});
 const missing=tools.missingInfo(item);
 assert(missing.some(field=>field.id==='drive'));
 assert(missing.some(field=>field.id==='director'));
 assert.equal(item.urlDrive,'   ');
 assert(!tools.missingInfo({...item,urlDrive:' https://drive.google.com/file/d/test/view '}).some(field=>field.id==='drive'));
});

test('La revisión respeta los alias de ficha y rechaza datos vacíos',()=>{
 const complete={title:'Completa',sinopsis:'Sinopsis',image:'poster',releaseDate:'2026-10-01',genres:[{name:'Drama'}],director:'Directora',runtimeMin:90,urlDrive:'https://drive.google.com/test'};
 assert.deepEqual(tools.missingInfo(complete),[]);
 assert.deepEqual(tools.missingInfo({...complete,title:'  ',director:' ',genres:[],runtimeMin:0,runtime:'0 min'}).map(field=>field.id),['title','genre','director','duration']);
 assert.equal(tools.missingInfo({}).length,8);
 assert(!tools.missingInfo({...complete,runtimeMin:0,runtime:'1h 30min'}).some(field=>field.id==='duration'));
});

