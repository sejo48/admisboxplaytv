(function (root, factory) {
    const tools = factory();
    if (typeof module === 'object' && module.exports) module.exports = tools;
    else root.BoxCatalog = tools;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
    const title = item => item.tituloSerie || item.titulo || item.title || item.name || 'Sin título';
    const year = item => String(item.year || item.fechaEstreno || item.releaseDate || item.release_date || item.first_air_date || '').match(/\b(?:19|20)\d{2}\b/)?.[0] || '';
    const genres = item => {
        const source = item.generosTexto || item.genre || item.genero || item.genres || '';
        return (Array.isArray(source) ? source.map(x => typeof x === 'string' ? x : x?.name || '') : String(source).split(/[,/|·]/)).map(x => x.trim()).filter(Boolean);
    };
    function filter(items, options = {}) {
        const q = fold(options.search), genre = fold(options.genre);
        const filtered = items.filter(item => (!q || fold([title(item), item.tituloOriginal, item.descripcion, item.sinopsis, item.synopsis, item.director, ...genres(item)].filter(Boolean).join(' ')).includes(q)) && (!genre || genres(item).some(g => fold(g) === genre)) && (!options.year || year(item) === options.year));
        const compareTitle = (a,b) => title(a).localeCompare(title(b), 'es', { sensitivity: 'base', numeric: true });
        if (options.sort === 'title') filtered.sort(compareTitle);
        if (options.sort === 'title-desc') filtered.sort((a,b) => compareTitle(b,a));
        if (options.sort === 'year') filtered.sort((a,b) => Number(year(b)) - Number(year(a)) || compareTitle(a,b));
        if (options.sort === 'rating') filtered.sort((a,b) => (parseFloat(b.rating || b.score) || 0) - (parseFloat(a.rating || a.score) || 0) || compareTitle(a,b));
        return filtered;
    }
    const hasText = value => typeof value === 'string' && value.trim().length > 0;
    const anyText = (...values) => values.some(hasText);
    const reviewFields = [
        { id: 'drive', label: 'Enlace de Google Drive', present: item => hasText(item.urlDrive) },
        { id: 'title', label: 'Título', present: item => anyText(item.titulo, item.title, item.name) },
        { id: 'synopsis', label: 'Sinopsis', present: item => anyText(item.descripcion, item.sinopsis, item.synopsis) },
        { id: 'poster', label: 'Portada', present: item => anyText(item.imagen, item.image) },
        { id: 'year', label: 'Año', present: item => !!year(item) },
        { id: 'genre', label: 'Género', present: item => genres(item).length > 0 },
        { id: 'director', label: 'Director', present: item => hasText(item.director) },
        { id: 'duration', label: 'Duración', present: item => Number(item.runtimeMin) > 0 || (hasText(item.runtime) && /[1-9]/.test(item.runtime)) }
    ];
    const missingInfo = item => reviewFields.filter(field => !field.present(item)).map(({ id, label }) => ({ id, label }));
    function findMatch(items, data, mediaType = data.tmdbType || 'movie') {
        const typed = item => (item.tmdbType || item.mediaType || (item.tituloSerie ? 'tv' : 'movie')) === mediaType;
        if (data.tmdbId) {
            const match = items.find(item => typed(item) && item.tmdbId && String(item.tmdbId) === String(data.tmdbId));
            if (match) return match;
        }
        return items.find(item => typed(item) && !(item.tmdbId && data.tmdbId && String(item.tmdbId) !== String(data.tmdbId)) && (!year(item) || !year(data) || year(item) === year(data)) && [title(item), item.tituloOriginal].filter(Boolean).some(value => [title(data),data.tituloOriginal].filter(Boolean).some(other => fold(value) === fold(other))));
    }
    function draft(data, existing, destination) {
        const result = { ...(existing || { urlDrive: '', qualityTag: '', codigo: null }), ...data, title: data.titulo, image: data.imagen, id: existing?.id, isNew: !existing };
        if (destination === 'series' || destination === 'animados') { result.tituloSerie = data.titulo; result.temporadas = existing?.temporadas || []; }
        if (destination === 'tudum') Object.assign(result,{ synopsis: data.sinopsis, releaseDate: data.fechaEstreno, genre: data.generosTexto, score: data.rating });
        return result;
    }
    function searchURL({ key, mediaType = 'movie', category = 'search', query = '', page = 1, year: selectedYear = '' }) {
        const type = mediaType === 'tv' ? 'tv' : 'movie';
        const allowed = type === 'tv' ? ['popular','top_rated','on_the_air'] : ['popular','top_rated','upcoming'];
        if (!['search','trending',...allowed].includes(category)) throw Error('Categoría TMDB no válida');
        const endpoint = category === 'search' ? `search/${type}` : category === 'trending' ? `trending/${type}/week` : `${type}/${category}`;
        const params = new URLSearchParams({ api_key: key, language: 'es-ES', include_adult: 'false', page: String(page) });
        if (category === 'search') { params.set('query',query.trim()); if (/^\d{4}$/.test(selectedYear)) params.set(type === 'tv' ? 'first_air_date_year' : 'primary_release_year',selectedYear); }
        return `https://api.themoviedb.org/3/${endpoint}?${params}`;
    }
    return { fold, title, year, genres, filter, findMatch, draft, searchURL, reviewFields, missingInfo };
});
