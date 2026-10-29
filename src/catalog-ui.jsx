// Reveal inline forms after React commits, including repeated selections of the same card.
const useInlineEditor = (item, setItem) => {
    const ref = React.useRef(null);
    const frame = React.useRef(null);
    const reveal = React.useCallback(() => {
        cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() => {
            const editor = ref.current;
            if (!editor) return;
            const header = document.querySelector('.admin-header');
            const top = (header?.getBoundingClientRect().bottom || 0) + 16;
            window.scrollTo({ top: Math.max(0, window.scrollY + editor.getBoundingClientRect().top - top), behavior: 'instant' });
            editor.focus({ preventScroll: true });
        });
    }, []);
    React.useEffect(() => {
        if (item) reveal();
        return () => cancelAnimationFrame(frame.current);
    }, [!!item, item?.id, reveal]);
    return [ref, next => { setItem(next); reveal(); }];
};

const ChristmasField = ({ item, onChange }) => <label className="md:col-span-2 flex items-center gap-3 rounded-xl border border-slate-300 bg-slate-50 p-3 cursor-pointer">
    <input type="checkbox" name="navidad" checked={BoxCatalog.isChristmas(item)} onChange={event => { const checked = event.target.checked; onChange(current => ({ ...current, navidad: checked })); }} className="h-5 w-5 accent-emerald-600 shrink-0" />
    <span><strong className="block text-sm text-slate-800">🎄 Incluir en Navidad</strong><span className="block text-xs text-slate-500 mt-1">Marca o desmarca esta opción y guarda la ficha. Después publica con GitHub Sync.</span></span>
</label>;

const MediaTile = ({ item, kind, onOpen }) => {
    const title = item.title || item.titulo || item.album || 'Sin título';
    return <button type="button" className={'media-tile media-tile-' + kind} onClick={onOpen} aria-label={(kind === 'music' ? 'Abrir ' : 'Editar ') + title}>
        <div className="media-tile-art"><MediaImage src={item.logo || item.cover || item.imagen || item.image} alt={title} className="media-tile-image" /></div>
        <div className="catalog-poster-copy"><h3>{title}</h3><p>{kind === 'music' ? (item.artist || item.artista || 'Artista sin indicar') : (item.group || item.categoria || 'Sin grupo')}</p>{kind === 'music' && <p>{item.year || item.año || 'Sin año'} · {(item.tracks || item.pistas || []).length} pistas</p>}</div>
    </button>;
};

const useChannelChecks = () => {
    const [results, setResults] = React.useState({});
    const [progress, setProgress] = React.useState({ running: false, done: 0, total: 0 });
    const runRef = React.useRef({ id: 0, controllers: [] });
    React.useEffect(() => () => { runRef.current.id++; runRef.current.controllers.forEach(c => c.abort()); }, []);
    const cancel = () => {
        runRef.current.id++;
        runRef.current.controllers.forEach(c => c.abort());
        runRef.current.controllers = [];
        setResults(current => Object.fromEntries(Object.entries(current).map(([id, result]) => [id, result.status === 'checking' ? { ...result, status: 'unknown', detail: 'Revisión cancelada.' } : result])));
        setProgress(current => ({ ...current, running: false, cancelled: true }));
    };
    const run = async channels => {
        if (progress.running || !channels.length) return;
        const job = { id: runRef.current.id + 1, controllers: [] };
        runRef.current = job;
        const id = job.id;
        setProgress({ running: true, done: 0, total: channels.length });
        let cursor = 0;
        const worker = async () => {
            while (cursor < channels.length && runRef.current.id === id) {
                const channel = channels[cursor++];
                const controller = new AbortController();
                job.controllers.push(controller);
                setResults(current => ({ ...current, [channel.id]: { url: channel.url, status: 'checking', detail: 'Comprobando señal…' } }));
                const result = await BoxStreamHealth.check(channel.url, { signal: controller.signal });
                job.controllers = job.controllers.filter(c => c !== controller);
                if (runRef.current.id !== id) return;
                setResults(current => ({ ...current, [channel.id]: { ...result, url: channel.url } }));
                setProgress(current => ({ ...current, done: current.done + 1 }));
            }
        };
        await Promise.all(Array.from({ length: Math.min(3, channels.length) }, worker));
        if (runRef.current.id === id) setProgress(current => ({ ...current, running: false }));
    };
    const resultFor = channel => results[channel.id]?.url === channel.url ? results[channel.id] : null;
    return { run, cancel, progress, resultFor };
};

const ChannelStatus = ({ result }) => {
    const status = result?.status || 'unchecked';
    const labels = { unchecked: 'Sin revisar', checking: 'Revisando…', online: 'En línea', offline: 'No disponible', unknown: 'No verificable' };
    return <div className={'channel-status channel-status-' + status} role="status"><strong>{labels[status]}</strong>{result?.detail && <p>{result.detail}</p>}{result?.checkedAt && <small>Revisado: {new Date(result.checkedAt).toLocaleTimeString()}</small>}</div>;
};

const useCatalogView = (items, search = '') => {
    const [filters,setFilters] = React.useState({ sort: 'manual',genre: '',year: '' });
    const genres = [...new Set(items.flatMap(BoxCatalog.genres))].sort((a,b) => a.localeCompare(b,'es'));
    const years = [...new Set(items.map(BoxCatalog.year).filter(Boolean))].sort().reverse();
    const visible = BoxCatalog.filter(items,{ ...filters,search });
    return { items: visible, props: { filters,setFilters,genres,years,total: items.length,count: visible.length } };
};

const CatalogToolbar = ({ filters,setFilters,genres,years,total,count }) => <div className="catalog-toolbar">
    <p className="catalog-count"><strong>{count}</strong> de {total} títulos · Cuadrícula</p>
    <label>Ordenar<select aria-label="Ordenar títulos" value={filters.sort} onChange={e=>setFilters({...filters,sort:e.target.value})}><option value="manual">Orden del catálogo</option><option value="title">Título A–Z</option><option value="title-desc">Título Z–A</option><option value="year">Año más reciente</option><option value="rating">Mejor puntuación</option></select></label>
    <label>Género<select aria-label="Filtrar por género" value={filters.genre} onChange={e=>setFilters({...filters,genre:e.target.value})}><option value="">Todos los géneros</option>{genres.map(g=><option key={g}>{g}</option>)}</select></label>
    <label>Año<select aria-label="Filtrar por año" value={filters.year} onChange={e=>setFilters({...filters,year:e.target.value})}><option value="">Todos los años</option>{years.map(y=><option key={y}>{y}</option>)}</select></label>
    {(filters.genre || filters.year || filters.sort !== 'manual') && <button type="button" onClick={()=>setFilters({sort:'manual',genre:'',year:''})}>Limpiar filtros</button>}
</div>;

const CatalogPoster = ({ item,selected=false,onSelect,onEdit,onDelete,caption }) => {
    const title=BoxCatalog.title(item),year=BoxCatalog.year(item);
    return <article className={`catalog-poster ${selected?'is-selected':''}`} data-poster-card={item.id || title}>
        <button type="button" className="catalog-cover" aria-label={`Abrir ${title}`} aria-pressed={selected} onClick={onSelect}><MediaImage src={item.imagen || item.image} alt={`Portada de ${title}`} className="w-full aspect-[2/3] object-cover"/>{year&&<span className="catalog-year">{year}</span>}</button>
        <div className="catalog-poster-copy"><h3>{title}</h3><p>{caption || BoxCatalog.genres(item).slice(0,2).join(' · ') || 'Ficha del catálogo'}</p></div>
        <div className="catalog-card-actions"><button type="button" onClick={onEdit} aria-label={`Editar ${title}`}>Editar</button>{onDelete&&<button type="button" className="catalog-delete" onClick={onDelete} aria-label={`Eliminar ${title}`}>Eliminar</button>}</div>
    </article>;
};

const CatalogReview = ({ movies, estrenos, onOpenEditor }) => {
    const [search, setSearch] = React.useState('');
    const [field, setField] = React.useState('drive');
    const [section, setSection] = React.useState('all');
    const [limit, setLimit] = React.useState(30);
    const rows = React.useMemo(() => [
        ...movies.map((item, index) => ({ item, index, section: 'movies', catalog: 'Películas' })),
        ...estrenos.map((item, index) => ({ item, index, section: 'estrenos2026', catalog: 'Estrenos 2026' }))
    ].map(row => ({ ...row, missing: BoxCatalog.missingInfo(row.item) })), [movies, estrenos]);
    const pending = rows.filter(row => row.missing.length);
    const noDrive = rows.filter(row => row.missing.some(issue => issue.id === 'drive')).length;
    const visible = pending.filter(row => (section === 'all' || row.section === section) &&
        (!field || row.missing.some(issue => issue.id === field)) &&
        BoxCatalog.fold(BoxCatalog.title(row.item)).includes(BoxCatalog.fold(search)));
    const change = setter => event => { setter(event.target.value); setLimit(30); };
    return <section className="catalog-review" aria-label="Revisión de información">
        <div className="admin-workflow">
            <h3>Encuentra las fichas incompletas</h3>
            <p>Revisa Películas y Estrenos 2026. Abre una ficha, completa sus datos y guarda; la revisión se actualiza automáticamente.</p>
            <p>Se comprueba si los campos tienen información. Los enlaces no se abren ni se comprueba su acceso o reproducción.</p>
            <div className="review-summary" aria-live="polite"><span><strong>{rows.length}</strong> películas revisadas</span><span><strong>{noDrive}</strong> sin enlace de Google Drive</span><span><strong>{pending.length}</strong> con datos por completar</span></div>
        </div>
        <div className="review-filters">
            <label>Buscar película<input aria-label="Buscar película para revisar" value={search} onChange={change(setSearch)} placeholder="Título de la película" /></label>
            <label>Catálogo<select aria-label="Catálogo a revisar" value={section} onChange={change(setSection)}><option value="all">Ambos catálogos</option><option value="movies">Películas</option><option value="estrenos2026">Estrenos 2026</option></select></label>
            <label>Información que falta<select aria-label="Información que falta" value={field} onChange={change(setField)}><option value="">Cualquier dato de la ficha</option>{BoxCatalog.reviewFields.map(entry => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
        </div>
        <p className="text-sm" role="status">{visible.length} películas coinciden con esta revisión.</p>
        {!rows.length ? <p className="catalog-empty">Los catálogos están vacíos. Añade o carga películas para revisarlas.</p> : !visible.length ? <p className="catalog-empty">No hay películas con datos faltantes para estos filtros.</p> : <ul className="review-list">{visible.slice(0, limit).map(row => <li key={row.section + ':' + row.index}>
            <div><p className="review-catalog">{row.catalog} · {BoxCatalog.year(row.item) || 'Sin año'}</p><h3>{BoxCatalog.title(row.item)}</h3><p className="review-missing">Falta: {row.missing.map(issue => issue.label).join(' · ')}</p></div>
            <button type="button" className="admin-outline-button" aria-label={'Completar ' + BoxCatalog.title(row.item)} onClick={() => onOpenEditor(row.section, row.item)}>Completar ficha →</button>
        </li>)}</ul>}
        {visible.length > limit && <button type="button" className="admin-outline-button" onClick={() => setLimit(value => value + 30)}>Mostrar más películas ({visible.length - limit} pendientes)</button>}
    </section>;
};

const ThemeToggle = () => {
    const [theme,setTheme]=React.useState(()=>document.documentElement.dataset.adminTheme || 'dark');
    const toggle=()=>{const next=theme==='dark'?'light':'dark';document.documentElement.dataset.adminTheme=next;try{localStorage.setItem('boxplay_admin_theme',next);}catch(_){}setTheme(next);};
    return <button type="button" className="admin-theme-toggle" onClick={toggle} aria-label={theme==='dark'?'Activar modo claro':'Activar modo oscuro'} aria-pressed={theme==='dark'}><span aria-hidden="true">{theme==='dark'?'◐':'☼'}</span> {theme==='dark'?'Modo oscuro':'Modo claro'}</button>;
};

const ADMIN_GROUPS = [
    {label:'Catálogo',ids:['overview','movies','estrenos2026','series','animados','tudum','review']},
    {label:'Descubrir',ids:['tmdb','trending']},
    {label:'Publicar',ids:['homecovers','notices']},
    {label:'En vivo y música',ids:['tv','radios','videoteca']}
];
const adminSectionFromHash = () => {
    const hash=window.location.hash.slice(1);
    const section=hash==='portadas'?'homecovers':hash==='avisos'?'notices':hash;
    return ADMIN_GROUPS.some(group=>group.ids.includes(section))?section:'overview';
};

