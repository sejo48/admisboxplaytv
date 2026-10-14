# Administrador Box Play TV

Panel principal: https://sejo48.github.io/admisboxplaytv/

## Avisos

Enlace directo: https://sejo48.github.io/admisboxplaytv/#avisos

El botón **Enviar avisos** está en la barra superior, antes de Deshacer / GitHub Sync. La pestaña **Avisos** está al principio de las secciones, antes de Explorar TMDB. Escribe el título y mensaje, elige sección/duración, revisa la vista previa y pulsa Publicar aviso.

Los avisos se guardan en `avisos.json` de **sejo48/StreamTube-V20**, rama **main**, donde la aplicación principal los consulta. Este repositorio contiene el administrador, por lo que no debe tener una segunda lista de avisos independiente.

Se reutiliza la credencial del GitHub Sync existente si el usuario ya la guardó. La sección Avisos no persiste nuevas credenciales. Si falta acceso, introduce una credencial con permiso Contents: escritura en StreamTube-V20 directamente en el campo protegido del panel. La lista se puede consultar sin credencial desde la fuente pública; publicar/retirar requiere autorización de GitHub.

Explorar TMDB, edición de títulos, GitHub Sync, importación y respaldos conservan sus funciones actuales. El enlace #avisos abre directamente la sección nueva. La aplicación principal muestra una campana; el indicador del icono instalado depende del soporte del teléfono y se actualiza al abrir la app.

## Comprobaciones

`tests/notices-browser.cjs` comprueba enlace directo, botón visible, reutilización de la conexión existente, navegación a Explorar TMDB, publicación hacia la principal, lectura, contador, reintentos sin duplicados y retiro. Todas las escrituras y datos de avisos de prueba se simulan; no se enviaron mensajes a clientes.

En el entorno preparado:

```sh
NODE_PATH=/workspace/streamtube-tools/node_modules BOXPLAY_TEST_CSS=/workspace/streamtube-tools/browser-test.css node tests/notices-browser.cjs
```

## Conexión de GitHub y error 401

Un 401 significa que GitHub rechazó el token enviado. El administrador descarga la lista pública al abrir Avisos, sin probar automáticamente un token guardado. Antes de publicar hay que pulsar **Comprobar conexión**. Un token inválido no borra el título ni el mensaje del borrador.

Para sustituir un token rechazado:

1. Entra a https://github.com/settings/personal-access-tokens/new con la cuenta que administra el repositorio.
2. Selecciona el propietario correcto y acceso al repositorio **StreamTube-V20**.
3. En permisos del repositorio, habilita **Contents: Read and write**.
4. Genera el token y cópialo directamente en el campo protegido **Token personal de GitHub (PAT)** del panel. No lo incluyas en mensajes ni archivos del proyecto.
5. Pulsa **Comprobar conexión**. La comprobación verifica lectura; la publicación además requiere el permiso de escritura.

Avisos usa el token introducido en memoria. Si también necesitas reemplazar la credencial que la función antigua GitHub Sync había guardado, actualízala desde esa función. La sección Avisos no cambia ni elimina esa configuración guardada.

## Compilación para producción

Los archivos editables están en `src/app.jsx` y `src/index.template.html`. `index.html` y `assets/` son salidas generadas y se publican como archivos estáticos en GitHub Pages. No se usan el CDN de Tailwind ni la transformación Babel dentro del navegador. React, ReactDOM y HLS se sirven localmente con versiones fijadas. Los nombres de CSS/JS incluyen una huella de contenido para evitar versiones antiguas en la caché.

```sh
npm ci --ignore-scripts
npm run build
```

Después de editar el código fuente, incluye las salidas generadas en el mismo commit. `node_modules/` se ignora. Las bibliotecas se descargan por npm con su comprobación de integridad; los archivos de fuentes e iconos web siguen usando sus proveedores originales.
