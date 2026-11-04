const DriveImportDialog = ({serie,onClose,onImport}) => {
 const [url,setUrl]=React.useState(''),[key,setKey]=React.useState(()=>{try{return localStorage.getItem('boxplay_drive_api_key')||'';}catch(_){return '';}});
 const [settingsOpen,setSettingsOpen]=React.useState(!key),[notice,setNotice]=React.useState('');
 const [season,setSeason]=React.useState(String(serie.temporadas?.[0]?.numeroTemporada||1));
 const [busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[result,setResult]=React.useState(null),[rows,setRows]=React.useState([]),[excluded,setExcluded]=React.useState(new Set());
 const controller=React.useRef(null),dialog=React.useRef(null);
 React.useEffect(()=>{const el=dialog.current;el.showModal();return ()=>{controller.current?.abort();el.close();};},[]);
 const cancel=()=>{controller.current?.abort();onClose();};
 const read=async()=>{
  controller.current?.abort();const request=new AbortController();controller.current=request;setBusy(true);setError('');setResult(null);setRows([]);setExcluded(new Set());
  try{const data=await BoxDriveImport.listFolder(url,key,{signal:request.signal});if(!request.signal.aborted){setResult(data);setRows(data.files);}}
  catch(e){if(!request.signal.aborted)setError(e.message);}
  finally{if(!request.signal.aborted)setBusy(false);}
 };
 const preview=BoxDriveImport.plan(rows,serie,season),selected=preview.filter(row=>!row.duplicate&&!excluded.has(row.fileId));
 const importAll=()=>{try{const data=BoxDriveImport.append(serie,season,selected);if(!data.added){setError('No hay episodios nuevos seleccionados.');return;}onImport(Number(season),selected);onClose();}catch(e){setError(e.message);}};
 const move=(index,delta)=>setRows(current=>{const copy=[...current],next=index+delta;if(next<0||next>=copy.length)return current;[copy[index],copy[next]]=[copy[next],copy[index]];return copy;});
 return <dialog ref={dialog} className="drive-import-dialog" aria-labelledby="drive-import-title" onCancel={event=>{event.preventDefault();cancel();}}>
  <header><div><h2 id="drive-import-title">Importar episodios de Google Drive</h2><p>{serie.tituloSerie} · Selecciona una carpeta por temporada.</p></div><button type="button" onClick={cancel} aria-label="Cerrar importación">✕</button></header>
  <div className="drive-import-body">
   <p>Se añadirán los títulos y enlaces de los videos de la carpeta. Los archivos permanecen en Google Drive.</p>
   <details open={settingsOpen} onToggle={e=>setSettingsOpen(e.currentTarget.open)}><summary>Configuración de Google Drive (una sola vez)</summary><p>Activa Google Drive API en tu proyecto de Google Cloud y crea una clave de API para este administrador. Restringe la clave a Google Drive API y al sitio https://sejo48.github.io/*.</p><a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noopener noreferrer">Abrir configuración de Google Cloud ↗</a><label>Clave de Google Drive API<input type="password" disabled={busy} value={key} onChange={e=>{setKey(e.target.value);setResult(null);setRows([]);}} autoComplete="off" /></label><button type="button" disabled={busy} onClick={()=>{try{localStorage.setItem('boxplay_drive_api_key',key.trim());setError('');setNotice('Configuración guardada en este navegador.');setSettingsOpen(false);}catch(_){setError('No se pudo guardar la clave en este navegador. Puedes usarla sin guardarla.');}}}>Guardar configuración en este navegador</button></details>
   {notice&&<p role="status">{notice}</p>}
   <div className="drive-import-fields"><label>Enlace de la carpeta pública<input type="url" value={url} disabled={busy} onChange={e=>{setUrl(e.target.value);setResult(null);setRows([]);}} placeholder="https://drive.google.com/drive/folders/…" /></label><label>Temporada<input type="number" min="1" step="1" value={season} disabled={busy} onChange={e=>setSeason(e.target.value)} /></label><button type="button" disabled={busy||!key.trim()||!url.trim()} onClick={read}>{busy?'Leyendo carpeta…':'Leer carpeta y revisar'}</button></div>
   {busy&&<p role="status">Buscando todos los videos de la carpeta. Puedes cancelar sin modificar la serie.</p>}
   {error&&<p role="alert" className="drive-import-error">{error}</p>}
   {result&&<section aria-label="Vista previa de episodios"><h3>{result.name}</h3><p role="status">{rows.length} videos · {selected.length} por añadir · {preview.filter(row=>row.duplicate).length} duplicados omitidos{result.ignored>0?' · '+result.ignored+' archivos o subcarpetas omitidos':''}.</p><p>Se ordenan por nombre (1, 2, 10). Puedes corregir títulos, excluir videos y cambiar el orden. Los episodios existentes se conservarán.</p>
    {!rows.length&&<p>No se encontraron videos directamente en esta carpeta. Si están dentro de una subcarpeta, pega el enlace de esa subcarpeta.</p>}
    <ol className="drive-import-list">{preview.map((row,index)=><li key={row.fileId+'-'+index}><input aria-label={'Incluir '+row.filename} type="checkbox" disabled={row.duplicate} checked={!row.duplicate&&!excluded.has(row.fileId)} onChange={e=>{const checked=e.target.checked;setExcluded(current=>{const next=new Set(current);checked?next.delete(row.fileId):next.add(row.fileId);return next;});}} /><div><label>Título del episodio {index+1}<input value={row.title} onChange={e=>{const title=e.target.value;setRows(current=>current.map((item,i)=>i===index?{...item,title}:item));}} /></label><small>{row.filename}{row.duplicate?' · Ya existe en la serie o temporada':''}</small></div><button type="button" aria-label={'Subir episodio '+(index+1)} disabled={index===0} onClick={()=>move(index,-1)}>↑</button><button type="button" aria-label={'Bajar episodio '+(index+1)} disabled={index===preview.length-1} onClick={()=>move(index,1)}>↓</button></li>)}</ol>
   </section>}
  </div>
  <footer><p>Se guardará en el administrador. Publica después con GitHub Sync para verlo en BOXPLAYTV.</p><button type="button" onClick={cancel}>{busy?'Cancelar lectura':'Cancelar'}</button><button type="button" disabled={busy||!selected.length||!Number.isInteger(Number(season))||Number(season)<1} onClick={importAll}>Añadir {selected.length} {selected.length===1?'episodio':'episodios'} a temporada {season||'—'}</button></footer>
 </dialog>;
};
