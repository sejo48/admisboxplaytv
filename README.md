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
