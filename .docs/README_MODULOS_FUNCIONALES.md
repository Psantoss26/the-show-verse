# 📚 The Show Verse - Índice Maestro de Documentación

> Documentación profunda y exhaustiva de todos los módulos funcionales del proyecto  
> **Estado:** Completo | **Última actualización:** Marzo 2026 | **Versión:** 1.0

---

## 📖 Documentos Principales

### 📄 [MODULOS_FUNCIONALES_PROFUNDO.md](./MODULOS_FUNCIONALES_PROFUNDO.md)
**Parte 1: Módulos 1-6 + Introducción**

Cubre los módulos base y más complejos de la aplicación:

1. **[Dashboard Principal (`/`)](./MODULOS_FUNCIONALES_PROFUNDO.md#1-dashboard-principal)**
   - 📍 Puerta de entrada de la aplicación
   - 🏗️ Arquitectura Server Component + Client Component
   - 📊 12 secciones de contenido (TMDb)
   - 🎨 Animaciones especiales + sticky navbar
   - ✨ Lazy loading inteligente

2. **[Página de Detalle (`/details/[type]/[id]`)](./MODULOS_FUNCIONALES_PROFUNDO.md#2-página-de-detalle)**
   - 🎬 El componente más grande del proyecto (~331 KB)
   - 📋 Sistema de pestañas (Info/Episodios/Multimedia/Reviews)
   - ⭐ Puntuaciones de 4 fuentes (TMDb, IMDb, Trakt, RT/MC)
   - 🔄 Integración Trakt completa (watchlist episódica)
   - 🎯 Actualizaciones optimistas
   - 📱 Responsive design avanzado

3. **[Seguimiento por Episodio (Series)](./MODULOS_FUNCIONALES_PROFUNDO.md#3-seguimiento-por-episodio)**
   - 📺 Control episódico granular
   - 🗂️ Estructura watchedBySeason indexada
   - ✓ Toggle individual de episodio
   - 📁 Marcar temporada completa
   - 📊 Grid visual de ratings (heatmap)
   - ⚡ Carga paralela de datos

4. **[Módulo de Favoritos (`/favorites`)](./MODULOS_FUNCIONALES_PROFUNDO.md#4-módulo-de-favoritos)**
   - ❤️ Galería personal curada
   - 📖 3 vistas alternativas (Grid/List/Compact)
   - 💾 Caché multinivel de puntuaciones
   - 🔄 Paginación paralela (máx 5 concurrent)
   - 🎯 Lazy loading al hovear
   - 🔤 Ordenación por fecha/título/año/rating

5. **[Módulo de Watchlist (`/watchlist`)](./MODULOS_FUNCIONALES_PROFUNDO.md#5-módulo-de-pendientesuwatchlist)**
   - 📝 Lista de deseos del usuario
   - 🔄 Identical architecture to Favoritos
   - 📅 Ordenación personal customizable
   - 💾 Shared cache con Favoritos

6. **[Historial de Visionado (`/history`)](./MODULOS_FUNCIONALES_PROFUNDO.md#6-historial-de-visionado)**
   - 📜 Todos los contenidos vistos (Trakt)
   - 📅 Timestamps exactos
   - 🔄 Enriquecimiento TMDb en paralelo
   - 🎯 100% basado en Trakt data

---

### 📄 [MODULOS_FUNCIONALES_PROFUNDO_PARTE2.md](./MODULOS_FUNCIONALES_PROFUNDO_PARTE2.md)
**Parte 2: Módulos 7-15 + Arquitectura Transversal**

Módulos complementarios y sistemas de arquitectura:

7. **[En Progreso (`/in-progress`)](./MODULOS_FUNCIONALES_PROFUNDO_PARTE2.md#7-en-progreso)**
   - 🎬 Series que estás viendo actualmente
   - 📊 Cálculo de progreso
   - ⏭️ Botón "Continuar viendo"
   - 🔄 Ordenación por último visionado

8. **[Estadísticas del Usuario (`/stats`)](./MODULOS_FUNCIONALES_PROFUNDO_PARTE2.md#8-estadísticas-del-usuario)**
   - 📊 Analytics personalizadas (Trakt)
   - 📈 Gráficos: géneros, ratings, actividad
   - 🔥 Heatmap de actividad (tipo GitHub)
   - ⏱️ Tiempo total invertido
   - 💾 Caché de 1 hora

9. **[Calendario de Estrenos (`/calendar`)](./MODULOS_FUNCIONALES_PROFUNDO_PARTE2.md#9-calendario-de-estrenos)**
   - 📅 Próximos estrenos (TMDb + Trakt)
   - 🗓️ 3 vistas: día/semana/mes
   - 🔍 Filtros por tipo y período
   - 🎯 Ordenación por fecha/popularidad

10. **[Biblioteca Personal (`/biblioteca`)](./MODULOS_FUNCIONALES_PROFUNDO_PARTE2.md#10-biblioteca-personal)**
    - 📚 Vista unificada personal
    - 🎬 Combina: Historial + En Progreso + Favoritos
    - 📍 Resumen ejecutivo
    - ⚡ Acceso rápido a series activas

11. **[Descubrir Contenido (`/discover`)](./MODULOS_FUNCIONALES_PROFUNDO_PARTE2.md#11-descubrir-contenido)**
    - 🔍 Motor de búsqueda advanced
    - 🎯 Filtros: género, año, rating, tipo
    - 🔄 Debounce 400ms
    - ∞ Paginación infinita
    - 🎬 3 vistas para resultados
    - ⚡ AbortController para cancelación

12. **[Gestión de Listas (`/lists`)](./MODULOS_FUNCIONALES_PROFUNDO_PARTE2.md#12-gestión-de-listas)**
    - 📋 4 tipos: Usuario TMDb, Curadas TMDb, Colecciones, Trakt
    - 🏠 Hub central de listas
    - 📖 Detalles con paginación
    - 🎯 3 vistas alternativas
    - 🔀 Ordenación y filtrado

13. **[Secciones Películas/Series (`/movies`, `/series`)](./MODULOS_FUNCIONALES_PROFUNDO_PARTE2.md#13-secciones-películas-y-series)**
    - 🎬 Vistas temáticas por tipo
    - 🏗️ Similar a Dashboard pero filtrado
    - ✅ Más géneros cubiertos (12+)

14. **[Búsqueda de Personas (`/details/person/[id]`)](./MODULOS_FUNCIONALES_PROFUNDO_PARTE2.md#14-búsqueda-de-personas)**
    - 👤 Fichas de actores
    - 📽️ Filmografía completa
    - 🎬 Filtrable por rol (Actor/Director/Guionista)
    - 📚 Historial de trabajos

15. **[Navbar (`Navbar.jsx`)](./MODULOS_FUNCIONALES_PROFUNDO_PARTE2.md#15-barra-de-navegación)**
    - 🧭 Navegación principal
    - 🔍 Búsqueda rápida
    - 👤 Autenticación multi-oauth
    - 📊 Indicadores de estado (contadores)
    - 🎯 Efecto sticky glassmorphism
    - 📱 Responsive (hamburger mobile)

---

## 🎯 Mapa Visual de Módulos

```
┌─────────────────────────────────────────────────────────────┐
│                    DASHBOARD PRINCIPAL                       │
│  (Hub central: 12 secciones, entrada a la aplicación)       │
└──────────────┬──────────────────────────────────────────────┘
               │
      ┌────────┴────────┬──────────────────┬─────────────────┐
      ▼                 ▼                  ▼                 ▼
  DETALLE      FAVORITOS/          DESCUBRIR        CALENDARIO
  (335KB)      WATCHLIST           (Búsqueda)       (Estrenos)
    │          (Listas)                │                │
    │          Historial               │                │
    │          En Progreso             │                │
    │          Biblioteca              │                │
    │                                  │                │
    ├─ Episodios (Series)              │                │
    ├─ Personas                        └────┬───────────┘
    ├─ Recomendaciones                      │
    ├─ Comentarios                   ESTADÍSTICAS
    └─ Integraciones:                (Analytics)
       • Trakt (watchlist)
       • OMDb (IMDb rating)
       • Plex (local library)

                    ┌──────────────────┐
                    │  NAVBAR          │
                    │  (Presente en    │
                    │   todas)         │
                    └──────────────────┘

                    ┌──────────────────┐
                    │  LISTAS (`/lists`)
                    │  (Hub de listas) │
                    └──────────────────┘
```

---

## 📊 Tabla Comparativa de Módulos

| Módulo | Complejidad | LOCs | APIs | Caché | Vistas | Interactividad |
|--------|------------|------|------|-------|--------|----------------|
| Dashboard | Media | ~300 | 12 TMDb | ISR 30m | Carrousel | Media |
| Detalle | **Muy Alta** | 6000+ | 5+ (Multi) | sessionStorage | Tabs | **Muy Alta** |
| Favoritos | Media | ~1500 | TMDb/OMDb | sessionStorage | 3 | Media |
| Watchlist | Media | ~1500 | TMDb/OMDb | sessionStorage | 3 | Media |
| Historial | Media | ~1200 | Trakt→TMDb | sessionStorage | 3 | Media |
| En Progreso | Media-Baja | ~800 | Trakt | sessionStorage | Grid | Baja |
| Estadísticas | Media-Alta | ~2000 | Trakt | ISR 1h | Charts | Baja |
| Calendario | Media-Alta | ~1800 | TMDb/Trakt | ISR 30m | 3 | Media |
| Biblioteca | Media | ~1200 | Multi | sessionStorage | Agregado | Media |
| Descubrir | Media-Alta | ~1200 | TMDb | Debounce | 3 | **Alta** (Search) |
| Listas | **Alta** | ~1700 | Multi | sessionStorage | 3 | Media |
| Movies/Series | Media | ~800 | TMDb | ISR 30m | Carrousel | Baja |
| Personas | Baja-Media | ~900 | TMDb | sessionStorage | Tabs | Baja |
| Navbar | Media | ~1000 | Multi-Auth | sessionStorage | Fixed | Media |

---

## 🔌 Matriz de Integraciones

| API | Dashboard | Detalle | Favoritos | Historial | Descubrir | Otro |
|-----|-----------|---------|-----------|-----------|-----------|------|
| **TMDb** | ✅ Primaria | ✅ Primaria | ✅ | - | ✅ Primaria | ✅ |
| **Trakt** | - | ✅ (Watchlist) | ✅ (Scores) | ✅ Primaria | - | ✅ |
| **OMDb** | - | ✅ (IMDb) | ✅ (IMDb) | - | - | - |
| **Plex** | - | ✅ (Local link) | - | - | - | - |
| **JustWatch** | - | ✅ (Streaming) | - | - | - | - |

---

## 💾 Estrategia Global de Caché

```
┌─────────────────────────────────────────────────────────┐
│                TRES NIVELES DE CACHÉ                    │
├─────────────────────────────────────────────────────────┤
│ Nivel 1: Next.js ISR (Servidor)                         │
│ └─ Datos "estables" (trending, top rated)               │
│ └─ TTL: 30-60 minutos                                   │
│ └─ Reduce peticiones a APIs externas                    │
│                                                          │
│ Nivel 2: sessionStorage (Navegador cliente)             │
│ └─ OMDb cache, Trakt scores, favoritos                  │
│ └─ TTL: 24 horas                                        │
│ └─ Persiste entre navegación página a página            │
│                                                          │
│ Nivel 3: Deduplicación en vuelo (Proceso Node.js)       │
│ └─ globalThis.__omdbInflight, __traktInflight            │
│ └─ Si N usuarios piden mismo dato: 1 fetch compartido   │
│ └─ Todos esperan resultado de 1 petición                │
└─────────────────────────────────────────────────────────┘
```

---

## 🎯 Patrones Arquitectónicos Clave

### 1. **Actualización Optimista**
**Módulos:** Favoritos, Watchlist, Detalle, Episodios, todas las listas  
**Concepto:** UI actualiza INSTANTÁNEAMENTE, request al servidor en background  
**Ventaja:** Latencia percibida = 0ms

### 2. **Lazy Loading + Caché**
**Módulos:** Favoritos, Watchlist, Descubrir  
**Concepto:** No cargar TODO al montar; cargar bajo demanda (hover, click)  
**Ventaja:** Mejor rendimiento inicial + rápido después

### 3. **Paginación Paralela**
**Módulos:** Favoritos, Watchlist, Listas  
**Concepto:** Descargar 5-10 páginas en paralelo, no secuencial  
**Ventaja:** 3-5x más rápido

### 4. **Debounce en Búsqueda**
**Módulos:** Descubrir, Navbar searchbox  
**Concepto:** Esperar 400ms sin cambios antes de fetch  
**Ventaja:** Límita peticiones a TMDb

### 5. **AbortController para cancelación**
**Módulos:** Descubrir (primariamente)  
**Concepto:** Si usuario cambia página, cancelar fetch en vuelo  
**Ventaja:** No procesar datos irrelevantes

### 6. **Pool de concurrencia**
**Módulos:** Score loading, Batch operations  
**Concepto:** Limitar máximo de requests simultáneos (~4-5)  
**Ventaja:** Respeta rate limits de APIs

### 7. **Server Component + Client Component Split**
**Todo el proyecto**  
**Concepto:** Server: datos (RSC), Client: interactividad (React hooks)  
**Ventaja:** Rendimiento + Interactividad

---

## 🚀 Flujo de Usuario Típico

```
1. Usuario llega a habitación
   └─ LOAD: Dashboard (Server Component fetch en paralelo)
   
2. Dashboard muestra con animaciones
   └─ Sticky navbar entra
   └─ Secciones con entrada escalonada
   
3. Usuario hace hover en poster
   └─ LOAD: Scores (OMDb + Trakt) bajo demanda
   └─ Caché: siguiente hover no dispara fetch
   
4. Usuario clica en película
   └─ LOAD: Detalle (Server Component fetch paralelo)
   └─ Mostrar: Info/Episodios/Videos/Reviews tabs
   
5. Usuario en Detalle, expande "Videos"
   └─ LOAD: YouTube embeds si no están cacheados
   
6. Usuario marca como favorito
   └─ UI: ❤️ se rellena INSTANTÁNEAMENTE
   └─ Background: POST a TMDb
   └─ Si falla: revertir
   
7. Usuario va a Favoritos
   └─ LOAD: Cached favoritos (sessionStorage)
   └─ LOAD: Scores bajo demanda en cada hover
   
8. Usuario navega a Discover
   └─ LOAD: Página limpia
   └─ User types "breaking bad"
   └─ Debounce espera 400ms
   └─ LOAD: Resultados búsqueda TMDb
   └─ User ajusta filtros
   └─ Resultados actualizan
```

---

## 📈 Estadísticas del Proyecto

### Tamaño

| Elemento | Cantidad |
|----------|----------|
| Total LOCs | ~40,000+ |
| Componentes React | 30+ |
| Páginas/Rutas | 12+ |
| API Routes | 44+ |
| Archivos lib/ | 20+ |
| Módulos funcionales | 15 |

### Performance

| Métrica | Valor |
|---------|-------|
| Dashboard load | 400-600ms |
| Detalle load | 600-900ms |
| Favoritos initial | 300-400ms |
| Search debounce | 400ms |
| Parallelization factor | 4-12x |

### APIs Integradas

| API | Endpoints | Rate Limit |
|-----|-----------|-----------|
| TMDb | 80+ | 40/10sec |
| Trakt | 50+ | 1000/5min |
| OMDb | 1 | 1000/day |
| Plex | 5 | Unlimited |
| JustWatch | GraphQL | Unlimited |

---

## 🔗 Cómo Usar Esta Documentación

### Para **desarrolladores nuevos:**
1. Leer [Dashboard](#) para entender arquitectura general
2. Leer [DetailsClient](#) para ver un ejemplo de complejidad real
3. Leer [Patrones Arquitectónicos](#) para entender decisiones de diseño

### Para **optimizar rendimiento:**
1. Revisar [Caché Strategy](#) 
2. Revisar [Patrones: Lazy Loading + Parallelización](#)
3. Revisar tabla de APIs usadas por módulo

### Para **añadir nueva funcionalidad:**
1. Identificar módulo más similar
2. Estudiar su arquitectura
3. Aplicar patrones existentes
4. Integrar con caché compartida

### Para **debug:**
1. Identificar módulo afectado
2. Revisar flujo de datos
3. Verificar caché (niveles 1-3)
4. Revisar rate limits API

---

## 🎓 Conceptos Clave Explicados

### **Renderizado Server Component (RSC)**
- Código ejecuta en servidor ANTES de enviar HTML
- Acceso a bases de datos, APIs, archivos del servidor
- HTML pre-renderizado llega al navegador (sin JS)
- Más seguro + más rápido

```javascript
// Servidor:
async function Page() {
  const data = await db.query()     // Acceso a DB
  return <Component data={data} />  // Renderizado HTML
}

// Resultado en navegador: HTML estático + hydrated con JS mínimo
```

### **Client Component**
- Código que ejecuta EN EL NAVEGADOR
- Acceso a React hooks (useState, useEffect, etc)
- Interactividad completa (listeners de mouse, keyboard, etc)

```javascript
'use client'  // Directiva para Next.js

export default function Component() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>{count}</button>
}
```

### **Promise.all (parallelización)**
```javascript
// LENTO (secuencial): ~1000ms + 1000ms + 1000ms = 3000ms
const data1 = await api1()
const data2 = await api2()
const data3 = await api3()

// RÁPIDO (paralelo): max(1000ms, 1000ms, 1000ms) = 1000ms
const [data1, data2, data3] = await Promise.all([
  api1(), api2(), api3()
])
```

### **Actualización Optimista**
```javascript
// ANTES: esperar respuesta del servidor (100-500ms latencia)
await updateServer(newValue)
setState(newValue)

// DESPUÉS: actualizar UI INSTANTÁNEAMENTE
setState(newValue)                   // UI actualizaa AHORA
updateServer(newValue)               // servidor en background
.catch(() => setState(oldValue))     // revertir si falla
```

---

## 📝 Convenciones de Nomenclatura

### Archivos
- `page.jsx` — Ruta Server Component
- `*Client.jsx` — Client Component (incluir `'use client'`)
- `*Details.jsx` — Sub-componentes de detalle
- `*Modal.jsx` — Componentes de modal
- `*.md` — Documentación

### Variables de estado
- `loading` — Booleano de carga
- `error` — String de error o null
- `data` — Datos reales
- `activeX` — Booleano de estado activo
- `selectedItem` — Elemento seleccionado

### Funciones
- `fetch*` — Funciones que hacen peticiones HTTP
- `get*` — Funciones que obtienen datos
- `handle*` — Event handlers
- `format*` — Funciones de formateo

---

## 🔍 Troubleshooting Rápido

| Problema | Posible Causa | Solución |
|----------|---------------|----------|
| Favoritos no actualiza | Cache stale | Limpiar sessionStorage |
| Búsqueda muy lenta | Rate limiting | Aumentar debounce delay |
| Episodios no se marcan | Trakt auth expired | Reconectar Trakt (navbar) |
| Imágenes lentas | Lazy loading | Preload más arriba en viewport |
| Datos inconsistentes | Race condition | Adicionar AbortController |
| OMDb sin datos | API key limit | Esperar 24h reset |

---

**Fin del índice maestro**

Última actualización: Marzo 2026  
Mantenedor: Equipo de desarrollo The Show Verse  
Versión: 1.0 (Completa)
