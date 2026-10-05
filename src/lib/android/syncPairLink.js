// Enlaces para vincular The Show Verse Sync desde el navegador o la PWA.
//
// El esquema `theshowverse://pair` lo declaran DOS apps: The Show Verse Sync y
// la app completa. Con las dos instaladas, Android preguntaría cuál abrir, y la
// completa se aparta cuando Sync está instalada (la sincronización es de Sync).
// Por eso el enlace que se abre solo es un `intent:` de Chrome con el paquete de
// Sync: va directo a ella. El de copiar sigue siendo el esquema propio, que
// funciona en cualquier navegador y con versiones antiguas de la app.

export const SYNC_APP_PACKAGE = "com.theshowverse.sync";

export function buildSyncPairLinks(token, origin) {
  const query = `token=${encodeURIComponent(token)}&origin=${encodeURIComponent(origin)}`;
  return {
    open: `intent://pair?${query}#Intent;scheme=theshowverse;package=${SYNC_APP_PACKAGE};end`,
    copy: `theshowverse://pair?${query}`,
  };
}
