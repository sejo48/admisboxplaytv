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

const ThemeToggle = () => {
    const [theme,setTheme]=React.useState(()=>document.documentElement.dataset.adminTheme || 'dark');
    const toggle=()=>{const next=theme==='dark'?'light':'dark';document.documentElement.dataset.adminTheme=next;try{localStorage.setItem('boxplay_admin_theme',next);}catch(_){}setTheme(next);};
    return <button type="button" className="admin-theme-toggle" onClick={toggle} aria-label={theme==='dark'?'Activar modo claro':'Activar modo oscuro'} aria-pressed={theme==='dark'}><span aria-hidden="true">{theme==='dark'?'◐':'☼'}</span> {theme==='dark'?'Modo oscuro':'Modo claro'}</button>;
};

const ADMIN_GROUPS = [
    {label:'Catálogo',ids:['overview','movies','estrenos2026','series','animados','tudum']},
    {label:'Descubrir',ids:['tmdb','trending']},
    {label:'Publicar',ids:['homecovers','notices']},
    {label:'En vivo y música',ids:['tv','radios','videoteca']}
];
const adminSectionFromHash = () => {
    const hash=window.location.hash.slice(1);
    const section=hash==='portadas'?'homecovers':hash==='avisos'?'notices':hash;
    return ADMIN_GROUPS.some(group=>group.ids.includes(section))?section:'overview';
};
