---
tags: [area/frontend, type/referencia, capa/lib]
---
# lib/hooks

> Hooks de React de dominio (auth, listas TMDb/Trakt, animaciones de scroll de los dashboards), separados de los hooks genéricos de UI en `src/hooks`.

## Responsabilidad

`src/lib/hooks` reúne hooks ligados a lógica de negocio concreta: sesión de usuario, listas de TMDb/Trakt y las animaciones de revelado-al-hacer-scroll de las filas de los dashboards. Se distingue de `src/hooks` (a nivel de `src`), que solo contiene un hook de UI genérico sin lógica de dominio.

## Ficheros principales

| Fichero | Qué hace |
|---|---|
| `useAuth.js` | Hook por defecto que envuelve `useAuth` de `AuthContext` y reexpone una forma reducida: `account`, `sessionId`, `checking`, `authenticated`, `user`, `login/register/logout`, `refreshMe`. |
| `useHasScrolled.js` | `useHasScrolled(threshold, {resetAtTop, enabled})`: `true` en cuanto el usuario hace scroll vertical (o si la página ya viene desplazada al montar). `useScrollRevealProps(margin)`: props listas para pasar a un `motion.div` (Framer Motion) de una fila de dashboard, para que permanezca oculta hasta el primer scroll y luego se revele con `whileInView`. `useTopResetRevealProps(targetRef, margin, enabled)`: variante para la primera sección de cada dashboard, que rearma su estado oculto al volver arriba pero sin desmontarse. Respeta `prefers-reduced-motion` vía `useReducedMotion`. |
| `useTmdbLists.js` | Hook por defecto: gestiona las listas de usuario de TMDb (`fetchUserLists`/`createUserList`/`deleteUserList` de [[lib-api]]) con paginación (`loadMore`), estado de carga/error y helpers `create`/`del`. Requiere sesión TMDb activa (`useAuth` de `AuthContext`). |
| `useTraktLists.js` | Hook por defecto: `useTraktLists({mode})` hace fetch a `/api/trakt/lists?mode=...` y expone `lists`, `loading`, `connected`, `requiresAuth`, `user`, `refresh`. Usado en vistas de listas de Trakt (trending/populares o listas del propio usuario). |

## Cómo se usa

- `useAuth` (este módulo) es la puerta de entrada más común a la sesión en componentes que no necesitan todo el contexto.
- `useTmdbLists`/`useTraktLists` alimentan las páginas/componentes de listas (`src/app/lists/**`, `src/components/lists/**`).
- `useHasScrolled`/`useScrollRevealProps`/`useTopResetRevealProps` se usan en las secciones de `MainDashboardClient.jsx`, `SeriesPageClient.jsx`, `MoviesPageClient.jsx` y componentes de fila del dashboard para la animación de entrada.

### `src/hooks` (fuera de `lib`, mención)

`src/hooks/useBodyScrollLock.js` vive a nivel de `src` (no de `lib`) porque es un hook de UI genérico sin lógica de dominio: bloquea el scroll de `<body>` mientras hay un modal abierto, con un contador global (el scroll solo se restaura cuando se cierran *todos* los modales anidados) y compensación del ancho de la scrollbar vía `padding-right`. Se usa en modales de toda la app (vídeo, artwork, listas, etc.).

## Dependencias

- `useAuth` → `@/context/AuthContext`.
- `useTmdbLists` → [[lib-api]] (`tmdbLists.js`), `@/context/AuthContext`.
- `useTraktLists` → ruta interna `/api/trakt/lists`.
- `useHasScrolled`/`useScrollRevealProps` → `framer-motion` (`useReducedMotion`).

## Relacionado
- [[Frontend-Lib]]
- [[Frontend]]
- [[Home]]
- [[lib-api]]
- [[components]]
