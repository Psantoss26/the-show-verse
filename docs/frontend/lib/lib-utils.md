---
tags: [area/frontend, type/referencia, capa/lib]
---
# lib/utils (+ ficheros sueltos de `src/lib`)

> Utilidades generales de bajo tamaño que no encajan en ningún otro módulo: traducción de tipo de media, overrides de carátulas, i18n de la UI y título de página.

## Responsabilidad

Incluye la carpeta `src/lib/utils/` (un único fichero) y los tres ficheros sueltos en la raíz de `src/lib`: `artworkApi.js`, `i18n.js` y `pageTitle.js`. Son utilidades pequeñas, independientes entre sí, agrupadas aquí por no justificar cada una su propio módulo/nota.

## Ficheros principales

| Fichero | Qué hace |
|---|---|
| `utils/translate.js` | `translateMediaType(type)`: `'movie'`→`'Película'`, `'tv'`→`'Serie'`, resto→`'Otro'`. **Sin importadores** en el código actual (código muerto). |
| `artworkApi.js` | `saveArtworkOverride({type, id, kind, filePath})`: `POST /api/artwork` para guardar una selección manual de carátula (poster/backdrop/background) elegida por el usuario. `fetchArtworkOverrides({type, kind, ids})`: `GET /api/artwork` para leer los overrides de varios ids de un tipo/kind a la vez. Usado por `MainDashboardClient.jsx` y `DetailsClient.jsx`. |
| `i18n.js` | `useTranslation()`: hook que devuelve `{t, lang}`, con `lang` fijado a `"es-ES"` (no hay selector de idioma activo pese a existir también un diccionario `"en-US"` completo). `t(key, defaultText)` busca la clave en el diccionario y cae al texto por defecto (o a la propia clave) si no la encuentra. Diccionarios cubren navegación, buscador, páginas de detalle, biblioteca/listas y ajustes. Usado por `Navbar.jsx`, `HistoryClient.jsx`, `WatchlistClient.jsx`, `FavoritesClient.jsx`, `BibliotecaClient.jsx`, `ProfileSettingsClient.jsx`. |
| `pageTitle.js` | `SITE_TITLE_SHORT = "TSV"`, `TITLE_SEPARATOR = "•"`, `formatPageTitle(title)` → `"{title} • TSV"` (o solo `"TSV"` si no hay título). Usado por la plantilla de `metadata.title` de `layout.jsx` y por `usePageTitle` (`lib/hooks/usePageTitle.js`). |

## Cómo se usa

Cada fichero se importa de forma puntual donde hace falta esa utilidad concreta: `artworkApi.js` en los dos sitios donde el usuario puede fijar una carátula manualmente; `i18n.js` en componentes que renderizan texto de UI traducible; `pageTitle.js` en `layout.jsx` y en `usePageTitle`.

**Título de la pestaña desde el cliente:** nunca `document.title = …` (reescribe el `<title>` de Next y, al cambiar a una página cuyo título de Next es el mismo, React no lo toca y se queda el anterior). Las vistas cliente usan `usePageTitle("Listas")` (o `<PageTitle title=… />` desde un componente de servidor). El registro (`lib/navigation/documentTitle.js`, con tests) pinta el título de la pantalla visible más reciente en un `<title data-sv-page-title>` propio, el primero del `<head>`, y lo quita cuando nadie lo pide; las pantallas ocultas en `<Activity>` limpian sus efectos y sacan su título solas. `utils/translate.js` no tiene consumidores activos.

## Dependencias

- `artworkApi.js` → ruta interna `/api/artwork`.
- `i18n.js`/`pageTitle.js`/`utils/translate.js` → ninguna (funciones puras / sin red).

## Relacionado
- [[Frontend-Lib]]
- [[Frontend]]
- [[Home]]
- [[components]]
