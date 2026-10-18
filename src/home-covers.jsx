/* Publish five curated covers independently of catalog editing and notices. */
const HomeCoversEditor = ({ requestConfirm, showToast }) => {
    const {useState,useEffect,useRef,useMemo} = React;
    const api = BoxHomeCovers, storageKey = 'boxplay_admin_home_covers_draft';
    const saved = useRef((() => {
        try { const value=JSON.parse(localStorage.getItem(storageKey));return Array.isArray(value?.items)&&value.items.length<=5&&value.items.every(item=>typeof item?.movieKey==='string'&&typeof item.title==='string'&&typeof item.backdrop==='string')?value:null; }
        catch {return null;}
    })());
    const [catalog,setCatalog]=useState([]),[published,setPublished]=useState(null);
    const [draft,setDraft]=useState(saved.current?.items || []),[baseRevision,setBaseRevision]=useState(saved.current?.baseRevision || '');
    const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[checks,setChecks]=useState({});
    const [search,setSearch]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
    const [token,setToken]=useState(()=>localStorage.getItem('boxplay_github_pat') || localStorage.getItem('magis_github_pat') || '');
    const [verifiedToken,setVerifiedToken]=useState('');
    const pendingPublication=useRef(null);
    const connected=!!token.trim()&&verifiedToken===token.trim();
    const movies=useMemo(()=>new Map(catalog.map(movie=>[api.key(movie),movie])),[catalog]);
    const dirty=!!published&&(published.mode!=='manual'?draft.length>0:JSON.stringify(draft)!==JSON.stringify(published.items));
    const valid=draft.length===5&&draft.every(item=>movies.has(item.movieKey)&&api.panoramic(checks[item.backdrop]));
    const load=async restoreDraft=>{
        setLoading(true);setError('');
        try {
            const [config,items]=await Promise.all([api.read(),api.catalog()]);
            setPublished(config);setCatalog(items);
            if(!restoreDraft||!saved.current){setDraft(config.items);setBaseRevision(api.revision(config));pendingPublication.current=null;}
            else {setDraft(saved.current.items);setBaseRevision(saved.current.baseRevision||api.revision(config));}
        }catch(error){setError(error.message);}
        finally{setLoading(false);}
    };
    useEffect(()=>{load(true);},[]);
    useEffect(()=>{
        if(!published||!baseRevision)return;
        try{localStorage.setItem(storageKey,JSON.stringify({items:draft,baseRevision}));}catch{/* Draft remains usable in this tab. */}
    },[draft,baseRevision,published]);
    useEffect(()=>{
        let cancelled=false;
        Promise.all(draft.map(async item=>[item.backdrop,await api.probe(item.backdrop)])).then(values=>{if(!cancelled)setChecks(Object.fromEntries(values));});
        return()=>{cancelled=true;};
    },[draft]);
    const change=items=>{setDraft(items);pendingPublication.current=null;setError('');setMessage('');};
    const choose=movie=>{
        const movieKey=api.key(movie);
        if(draft.some(item=>item.movieKey===movieKey))return change(draft.filter(item=>item.movieKey!==movieKey));
        if(draft.length>=5)return;
        change([...draft,{movieKey,title:api.title(movie),backdrop:api.image(movie)}]);
    };
    const currentMatches=current=>api.revision(current)===baseRevision||pendingPublication.current&&api.revision(current)===api.revision(pendingPublication.current);
    const checkConnection=async()=>{
        setBusy(true);setError('');setMessage('');setVerifiedToken('');
        try{const current=await api.repository(token);if(!currentMatches(current.config))throw new Error('La selección publicada cambió. Usa «Cargar selección publicada» antes de publicar. Tu borrador se conserva.');setVerifiedToken(token.trim());}
        catch(error){setError(error.message);}
        finally{setBusy(false);}
    };
    const complete=config=>{
        setPublished(config);setDraft(config.items);setBaseRevision(api.revision(config));pendingPublication.current=null;
        setMessage('Cinco portadas publicadas. Aparecerán al abrir Inicio cuando termine la actualización del sitio.');
        showToast('Cinco portadas de inicio publicadas');
    };
    const publish=async()=>{
        if(!connected||!valid||busy)return;
        setBusy(true);setError('');setMessage('');
        try{
            const intended=pendingPublication.current||api.make(draft);pendingPublication.current=intended;
            const current=await api.repository(token);
            if(api.revision(current.config)===api.revision(intended)){complete(intended);return;}
            if(!currentMatches(current.config))throw new Error('La selección publicada cambió. Usa «Cargar selección publicada» antes de publicar. Tu borrador se conserva.');
            const liveCatalog=await api.catalog();
            if(api.resolve(intended,liveCatalog).length!==5)throw new Error('Alguna película ya no está en Estrenos. Actualiza Estrenos y reemplázala antes de publicar.');
            const sizes=await Promise.all(intended.items.map(item=>api.probe(item.backdrop)));
            if(!sizes.every(api.panoramic))throw new Error('Reemplaza las imágenes que no cargan o no son panorámicas antes de publicar.');
            await api.publish({token,config:intended,sha:current.sha});complete(intended);
        }catch(error){setError(error.message);if(error.status===401||error.status===403)setVerifiedToken('');}
        finally{setBusy(false);}
    };
    const refreshCatalog=async()=>{setBusy(true);setError('');try{setCatalog(await api.catalog());}catch(error){setError(error.message);}finally{setBusy(false);}};
    const filtered=catalog.filter(movie=>(api.title(movie)+' '+(movie.year||'')+' '+(movie.director||'')).toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')));
    return <section className="space-y-6 bg-white p-4 sm:p-7 rounded-3xl border border-slate-200 shadow-sm" aria-label="Editor de portadas de inicio">
        <div className="flex flex-wrap items-start justify-between gap-4">
            <div><h2 className="text-xl font-extrabold">Portadas de inicio</h2><p className="text-sm text-slate-600 mt-2">Elige cinco películas de Estrenos 2026. Una de ellas aparecerá al abrir Inicio y cambiará en la siguiente apertura.</p></div>
            <span className="px-4 py-2 rounded-xl bg-cyan-50 text-cyan-800 font-bold" role="status" aria-label="Cantidad de portadas seleccionadas">{draft.length} de 5 seleccionadas</span>
        </div>
        <p className="text-sm text-slate-600">{published?.mode==='manual'?'La aplicación utiliza tu selección publicada.':'La aplicación usa los últimos estrenos automáticamente hasta que publiques tus cinco portadas.'} Los cambios de esta pantalla son un borrador hasta pulsar «Publicar cinco portadas».</p>
        {error&&<p role="alert" className="p-3 rounded-xl bg-rose-50 text-rose-700 text-sm break-words">{error}</p>}
        {message&&<p role="status" className="p-3 rounded-xl bg-emerald-50 text-emerald-800 text-sm">{message}</p>}
        {loading?<p role="status">Cargando portadas y Estrenos publicados…</p>:<>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4" aria-label="Cinco portadas elegidas">{Array.from({length:5},(_,index)=>{
                const item=draft[index],status=item?checks[item.backdrop]:null,missing=item&&!movies.has(item.movieKey);
                return <article key={item?.movieKey||index} className="min-w-0 rounded-2xl border border-slate-200 overflow-hidden" data-cover-slot={index+1}>
                    {item?<>
                        <div className="aspect-video bg-slate-950"><img src={item.backdrop||undefined} alt={'Vista previa de '+item.title} className="w-full h-full object-contain"/></div>
                        <div className="p-3 space-y-3"><h3 className="font-bold text-sm break-words">{index+1}. {item.title}</h3>
                        <label className="block text-xs font-bold text-slate-600">Imagen panorámica<input type="url" aria-label={'Imagen panorámica de '+item.title} value={item.backdrop} disabled={busy} onChange={event=>change(draft.map((entry,i)=>i===index?{...entry,backdrop:event.target.value}:entry))} placeholder="https://…" className="mt-1 w-full min-w-0 rounded-lg border border-slate-300 p-2 font-normal text-xs"/></label>
                        <p className={'text-xs '+(missing||status===null||status&&!api.panoramic(status)?'text-rose-700':'text-slate-600')}>{missing?'Ya no está en Estrenos. Reemplaza esta película.':!item.backdrop?'Añade una imagen panorámica.':status===undefined?'Comprobando imagen…':api.panoramic(status)?'Panorámica verificada':status?'La imagen es vertical o cuadrada. Usa una panorámica.':'No se pudo cargar la imagen. Revisa el enlace.'}</p>
                        <button type="button" disabled={busy} onClick={()=>change(draft.filter((_,i)=>i!==index))} aria-label={'Quitar '+item.title} className="text-sm font-bold text-rose-700 min-h-[44px]">Quitar</button></div>
                    </>:<div className="min-h-[180px] flex flex-col items-center justify-center p-4 text-center text-slate-400"><strong>Portada {index+1}</strong><span className="text-sm mt-2">Elige un estreno abajo</span></div>}
                </article>;
            })}</div>
            <div className="flex flex-wrap gap-3 items-center">
                <button type="button" onClick={publish} disabled={busy||!connected||!valid||!dirty} className="px-5 py-3 rounded-xl bg-cyan-700 text-white font-bold text-sm disabled:opacity-50">{busy?'Procesando…':'Publicar cinco portadas'}</button>
                <button type="button" onClick={()=>requestConfirm('Se reemplazará el borrador de portadas por la selección publicada. ¿Continuar?',()=>load(false))} disabled={busy} className="px-4 py-3 border rounded-xl text-sm">Cargar selección publicada</button>
                {!valid&&<p className="text-xs text-slate-500">Necesitas cinco películas distintas con imágenes panorámicas verificadas.</p>}
            </div>
        </>}
        <fieldset className="border border-slate-200 rounded-2xl p-4 space-y-3">
            <legend className="font-bold text-sm px-1">Conexión para publicar</legend>
            <label htmlFor="home-covers-token" className="block text-sm font-bold">Token personal de GitHub (PAT)</label>
            <input id="home-covers-token" type="password" autoComplete="off" value={token} disabled={busy} onChange={event=>{setToken(event.target.value);setVerifiedToken('');setError('');}} className="w-full p-3 rounded-xl border border-slate-300"/>
            <div className="flex flex-wrap items-center gap-3"><button type="button" disabled={busy||loading||!published||!token.trim()} onClick={checkConnection} className="bg-slate-900 text-white rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-50">Comprobar conexión</button><span role="status" className="text-sm text-slate-600">{connected?'Conexión verificada':'Conexión pendiente de comprobar'}</span></div>
            <p className="text-xs text-slate-500">Reutiliza la credencial de GitHub Sync. Necesita permiso Contents: escritura en StreamTube-V20. Esta sección no guarda nuevas credenciales.</p>
        </fieldset>
        {!loading&&<div className="space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-3"><h3 className="font-bold">Elegir desde Estrenos 2026</h3><button type="button" onClick={refreshCatalog} disabled={busy} className="text-sm text-cyan-700 min-h-[44px]">Actualizar Estrenos</button></div>
            <p className="text-xs text-slate-500">Se muestran los estrenos publicados en la aplicación principal. Para incluir uno nuevo, publícalo primero con GitHub Sync y después pulsa «Actualizar Estrenos».</p>
            <label className="block text-sm font-bold">Buscar estreno<input type="search" aria-label="Buscar estreno para portada" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Título, año o director…" className="mt-2 w-full p-3 border border-slate-300 rounded-xl font-normal"/></label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4" aria-label="Estrenos disponibles">{filtered.map(movie=>{
                const movieKey=api.key(movie),selected=draft.some(item=>item.movieKey===movieKey),label=api.title(movie);
                return <article key={movieKey} className={'min-w-0 p-2 border rounded-xl '+(selected?'border-cyan-600 bg-cyan-50':'border-slate-200')}>
                    <img src={movie.imagen||movie.image||undefined} alt="" loading="lazy" className="aspect-[2/3] w-full object-cover rounded-lg bg-slate-100"/>
                    <h4 className="mt-2 text-sm font-bold break-words">{label}</h4><p className="text-xs text-slate-500 mt-1">{movie.year||''}</p>
                    <button type="button" onClick={()=>choose(movie)} disabled={busy||draft.length>=5&&!selected} aria-pressed={selected} aria-label={(selected?'Quitar selección de ':'Elegir ')+label} className="mt-2 min-h-[44px] w-full rounded-lg bg-slate-900 text-white px-2 py-2 text-xs font-bold disabled:opacity-40">{selected?'Seleccionada':'Elegir portada'}</button>
                </article>;
            })}</div>
            {filtered.length===0&&<p className="text-sm text-slate-500">No hay estrenos que coincidan con la búsqueda.</p>}
        </div>}
    </section>;
};
