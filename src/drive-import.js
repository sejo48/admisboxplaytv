(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BoxDriveImport=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const video=/\.(mp4|mkv|avi|webm|mov|m4v|mpg|mpeg|ts|m2ts|wmv)$/i;
 function folder(value){
  const raw=String(value||'').trim();if(/^[\w-]{10,}$/.test(raw))return {id:raw,resourceKey:''};
  let url;try{url=new URL(raw);}catch(_){throw Error('Pega un enlace válido de una carpeta de Google Drive.');}
  if(url.hostname!=='drive.google.com'||url.protocol!=='https:')throw Error('Usa el enlace de la carpeta en drive.google.com.');
  const id=(url.pathname.match(/\/folders\/([\w-]+)/)||[])[1]||url.searchParams.get('id');
  if(!id||!/^[\w-]{10,}$/.test(id))throw Error('No se encontró el identificador de la carpeta.');
  return {id,resourceKey:url.searchParams.get('resourcekey')||''};
 }
 function fileId(url){try{const u=new URL(url);if(u.hostname!=='drive.google.com')return '';return (u.pathname.match(/\/d\/([\w-]+)/)||[])[1]||u.searchParams.get('id')||'';}catch(_){return '';}}
 function normalize(file){
  const shortcut=file.mimeType==='application/vnd.google-apps.shortcut'?file.shortcutDetails:null;
  const mime=shortcut?.targetMimeType||file.mimeType||'',id=shortcut?.targetId||file.id,key=shortcut?.targetResourceKey||file.resourceKey||'';
  if(!id||/^application\/vnd\.google-apps\./.test(mime)||!/^video\//.test(mime)&&!video.test(file.name||''))return null;
  return {fileId:id,title:String(file.name||'Episodio').replace(video,'').replace(/_/g,' ').trim(),filename:file.name||'Episodio',url:'https://drive.google.com/file/d/'+encodeURIComponent(id)+'/view'+(key?'?resourcekey='+encodeURIComponent(key):'')};
 }
 function apiError(data,status,key,phase){
  const error=data?.error||{},details=Array.isArray(error.details)?error.details:[],legacy=Array.isArray(error.errors)?error.errors:[];
  const reason=details.find(item=>item.reason)?.reason||legacy[0]?.reason||error.status||'UNKNOWN';
  const redact=value=>String(value||'').split(String(key||'').trim()||'__no_key__').join('[clave oculta]').replace(/AIza[\w-]{20,}/g,'[clave oculta]').slice(0,500);
  const help={
   API_KEY_HTTP_REFERRER_BLOCKED:'Google bloqueó el sitio del administrador. Comprueba que la clave permita https://sejo48.github.io/* y guarda los cambios.',
   API_KEY_SERVICE_BLOCKED:'La clave no permite Google Drive API. Selecciona Google Drive API en sus restricciones y guarda.',
   SERVICE_DISABLED:'Google Drive API no está activada en el proyecto de esta clave. Actívala en ese mismo proyecto.',
   accessNotConfigured:'Google Drive API no está activada en el proyecto de esta clave.',
   API_KEY_INVALID:'La clave guardada no es válida. Vuelve a copiarla desde Google Cloud y guárdala en el administrador.',
   rateLimitExceeded:'Se alcanzó el límite temporal de consultas. Espera y vuelve a intentar.',
   dailyLimitExceeded:'Se alcanzó la cuota diaria de Google Drive API.',
   PERMISSION_DENIED:'Comprueba el acceso general de esta carpeta: debe indicar Cualquier persona con el enlace.',
   forbidden:'Comprueba el acceso general de esta carpeta: debe indicar Cualquier persona con el enlace.'
  };
  return 'Google no permitió '+phase+' (HTTP '+status+' · '+redact(reason)+'). '+(help[reason]||(status===404?'No se encontró la carpeta o no es pública.':'Google rechazó la solicitud.'))+(error.message?' Detalle de Google: '+redact(error.message):'');
 }
 async function listFolder(value,key,{fetch:request=globalThis.fetch,signal}={}){
  const ref=folder(value);if(!String(key||'').trim())throw Error('Configura primero la clave de Google Drive API.');
  async function get(path,params){
   const url=new URL('https://www.googleapis.com/drive/v3/'+path);url.search=new URLSearchParams({...params,key:key.trim()});
   let response;
   try{response=await request(url.href,{signal,headers:ref.resourceKey?{'X-Goog-Drive-Resource-Keys':ref.id+'/'+ref.resourceKey}:{}});}
   catch(error){if(signal?.aborted||error.name==='AbortError')throw error;throw Error('No se pudo conectar a Google Drive. Intenta de nuevo y comprueba que el navegador no esté bloqueando la conexión.');}
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(apiError(data,response.status,key,path==='files'?'listar los episodios':'consultar la carpeta'));
   return data;
  }
  const info=await get('files/'+encodeURIComponent(ref.id),{fields:'id,name,mimeType',supportsAllDrives:'true'});
  if(info.mimeType!=='application/vnd.google-apps.folder')throw Error('El enlace debe corresponder a una carpeta, no a un archivo.');
  let token='',ignored=0;const files=[],seen=new Set();
  do{
   const data=await get('files',{q:"'"+ref.id+"' in parents and trashed = false",pageSize:'1000',fields:'nextPageToken,files(id,name,mimeType,resourceKey,shortcutDetails(targetId,targetMimeType,targetResourceKey))',includeItemsFromAllDrives:'true',supportsAllDrives:'true',...(token?{pageToken:token}:{})});
   if(!Array.isArray(data.files))throw Error('Google devolvió una lista de archivos no válida. No se importó ningún episodio.');
   for(const file of data.files){const item=normalize(file);if(item)files.push(item);else ignored++;}
   token=data.nextPageToken||'';if(token&&seen.has(token))throw Error('No se pudo terminar la lectura de la carpeta. Intenta de nuevo.');seen.add(token);
  }while(token);
  files.sort((a,b)=>a.filename.localeCompare(b.filename,'es',{numeric:true,sensitivity:'base'}));
  return {name:info.name||'Carpeta de Drive',files,ignored};
 }
 const fold=value=>String(value||'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 function plan(files,serie,seasonNumber){
  const ids=new Set((serie.temporadas||[]).flatMap(s=>(s.episodios||[]).map(e=>fileId(e.urlDrive))));
  const season=(serie.temporadas||[]).find(s=>Number(s.numeroTemporada)===Number(seasonNumber));
  const titles=new Set((season?.episodios||[]).map(e=>fold(e.tituloEpisodio)));
  return files.map(file=>{const duplicate=ids.has(file.fileId)||titles.has(fold(file.title));ids.add(file.fileId);titles.add(fold(file.title));return {...file,duplicate};});
 }
 function append(serie,seasonNumber,files){
  const number=Number(seasonNumber);if(!Number.isInteger(number)||number<1)throw Error('Elige un número de temporada válido.');
  const rows=plan(files,serie,number).filter(f=>!f.duplicate);if(rows.some(f=>!f.title.trim()))throw Error('Todos los episodios deben tener título.');
  const episodes=rows.map(f=>({id:'drive-'+f.fileId,tituloEpisodio:f.title.trim(),urlDrive:f.url}));
  const seasons=serie.temporadas||[],found=seasons.some(s=>Number(s.numeroTemporada)===number);
  return {serie:{...serie,temporadas:found?seasons.map(s=>Number(s.numeroTemporada)===number?{...s,episodios:[...(s.episodios||[]),...episodes]}:s):[...seasons,{numeroTemporada:number,episodios:episodes}]},added:episodes.length,skipped:files.length-episodes.length};
 }
 return {folder,fileId,normalize,listFolder,plan,append,apiError};
});
