const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const React = require('react'), Renderer = require('react-test-renderer'), Babel = require('@babel/standalone');
const Drive = require('../src/drive-import.js');
const { act } = Renderer;
const source = fs.readFileSync(path.join(__dirname, '../src/app.jsx'), 'utf8');
const editor = source.slice(source.indexOf('const AnimadosEditor ='), source.indexOf('const RadiosEditor ='));
const dialog = fs.readFileSync(path.join(__dirname, '../src/drive-import-ui.jsx'), 'utf8');
const compiled = Babel.transform(dialog + '\n' + editor + '\nglobalThis.Editor = AnimadosEditor;', { presets: ['react'] }).code;
function mount(record, collection = 'doramas') {
    let requests = 0, renderer, saved = [record];
    const sandbox = { React, ...React, AbortController, localStorage: { getItem: () => 'test-key' },
        BoxDriveImport: { ...Drive, listFolder: async () => { requests++; return { name: 'Temporada', ignored: 0, files: [
            { fileId: 'existing', title: 'Piloto', filename: 'Piloto.mp4', url: 'https://drive.google.com/file/d/existing/view' },
            { fileId: 'new', title: 'Episodio 2', filename: 'E02.mp4', url: 'https://drive.google.com/file/d/new/view' }
        ] }; } },
        useCatalogView: items => ({ items, props: {} }), CatalogToolbar: () => null,
        CatalogPoster: () => null, MediaProfile: () => null, Icon: () => null,
        EpisodeReorderRow: ({ children }) => React.createElement('div', null, children)
    };
    vm.runInNewContext(compiled, sandbox);
    sandbox.CatalogPoster = ({ onSelect }) => React.createElement('button', { id: 'select-record', onClick: onSelect });
    sandbox.requestAnimationFrame = () => {};
    function SelectedHost() {
        const [items, setItems] = React.useState([record]); saved = items;
        return React.createElement(sandbox.Editor, { animados: items, setAnimados: setItems, collection,
            showToast() {}, requestConfirm() {}, onTestPlayer() {} });
    }
    act(() => { renderer = Renderer.create(React.createElement(SelectedHost), { createNodeMock: () => ({ showModal() {}, close() {} }) }); });
    act(() => renderer.root.findByProps({ id: 'select-record' }).props.onClick());
    const button = text => renderer.root.findAllByType('button').find(node => node.children.filter(child => ['string', 'number'].includes(typeof child)).join('').includes(text));
    return { renderer, button, saved: () => saved[0], requests: () => requests };
}
const fixture = { id: 'dorama', tituloSerie: 'Dorama prueba', titulo: 'Dorama prueba', tmdbType: 'tv', codigo: '1234', imagen: 'poster', temporadas: [{ numeroTemporada: 1, episodios: [{ id: 'original', tituloEpisodio: 'Piloto', urlDrive: 'https://drive.google.com/file/d/existing/view' }] }] };
test('Doramas abre Drive, importa una temporada nueva y conserva episodios, metadatos y duplicados', async () => {
    const h = mount(fixture);
    act(() => h.button('Importar episodios de Google Drive').props.onClick());
    assert.equal(h.renderer.root.findAllByType('dialog').length, 1);
    act(() => h.renderer.root.findAllByType('input').find(n => n.props.type === 'url').props.onChange({ target: { value: 'https://drive.google.com/drive/folders/test_folder_123' } }));
    await act(async () => h.button('Leer carpeta y revisar').props.onClick());
    act(() => h.renderer.root.findAllByType('input').find(n => n.props.type === 'number').props.onChange({ target: { value: '2' } }));
    act(() => h.button('Añadir 1 episodio').props.onClick());
    assert.equal(h.requests(), 1); assert.equal(h.saved().codigo, '1234'); assert.equal(h.saved().imagen, 'poster');
    assert.equal(h.saved().temporadas.length, 2); assert.deepEqual(h.saved().temporadas[0], fixture.temporadas[0]);
    assert.equal(h.saved().temporadas[1].episodios.length, 1); assert.equal(h.saved().temporadas[1].episodios[0].tituloEpisodio, 'Episodio 2');
    assert.equal(h.renderer.root.findAllByType('dialog').length, 0);
    act(() => h.renderer.unmount());
});
test('Cancelar la importación no modifica el dorama', () => {
    const h = mount(fixture); act(() => h.button('Importar episodios de Google Drive').props.onClick());
    act(() => h.button('Cancelar').props.onClick()); assert.equal(h.saved(), fixture); assert.equal(h.requests(), 0);
    act(() => h.renderer.unmount());
});
test('Animados conserva su interfaz y no muestra la nueva acción de Doramas', () => {
    const h = mount(fixture, 'animados'); assert.equal(h.button('Importar episodios de Google Drive'), undefined);
    act(() => h.renderer.unmount());
});
