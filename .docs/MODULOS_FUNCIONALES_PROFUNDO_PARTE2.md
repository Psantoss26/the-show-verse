# 🎬 The Show Verse - Documentación Profunda de Módulos Funcionales (Parte 2)

> Continuación de MODULOS_FUNCIONALES_PROFUNDO.md  
> Módulos 7-15 + Sistemas Transversales

---

## 7. En Progreso

### 📍 Ubicación

```
src/app/in-progress/page.jsx
src/components/InProgressClient.jsx  (~50 KB)
```

### 🎯 Propósito

Mostrar las series que el usuario ha empezado a ver pero NO ha completado. Responde a la pregunta: "¿Qué serie estaba viendo?"

### 🏗️ Arquitectura

#### **Lógica de cálculo**

```javascript
// Challenge: ¿Cómo saber qué series están "en progreso"?

// Solución: Análisis del historial de Trakt

const calculateInProgressSeries = (watchedShows) => {
  // watchedShows = { show_id: { seasons: { season: [episode_numbers] } } }
  
  const inProgress = []
  
  for (const [showId, watchData] of Object.entries(watchedShows)) {
    const show = getShowDetails(showId)
    const { seasons, total_seasons } = show
    
    // Contar episodios totales y vistos
    let totalEpisodes = 0
    let watchedEpisodes = 0
    
    seasons.forEach(season => {
      totalEpisodes += season.episode_count
      
      // Contar episodios vistos en esta temporada
      const seasonWatched = watchData.seasons?.[season.season_number] || []
      watchedEpisodes += seasonWatched.length
    })
    
    // Si: 0 < vistos < total → EN PROGRESO
    if (watchedEpisodes > 0 && watchedEpisodes < totalEpisodes) {
      inProgress.push({
        show,
        progress: (watchedEpisodes / totalEpisodes) * 100,
        watchedCount: watchedEpisodes,
        totalCount: totalEpisodes,
        nextEpisode: calculateNextEpisode(watchData, show),
      })
    }
  }
  
  return inProgress
}

// Ejemplo:
// Breaking Bad: 62 episodios totales
// Usuario vio: 30 episodios
// Estado: EN PROGRESO (48.4%) → próximo: S03E05
```

#### **Cálculo del siguiente episodio**

```javascript
const calculateNextEpisode = (watchData, show) => {
  // Buscar primers episodio NO visto en orden cronológico
  
  for (let s = 1; s <= show.number_of_seasons; s++) {
    const season = show.seasons.find(s => s.season_number === s)
    
    for (let e = 1; e <= season.episode_count; e++) {
      const isWatched = watchData.seasons?.[s]?.includes(e) ?? false
      
      if (!isWatched) {
        // Encontrado: retornar primmer no visto
        return {
          season: s,
          episode: e,
          name: `S${String(s).padStart(2, '0')}E${String(e).padStart(2, '0')}`
        }
      }
    }
  }
  
  return null  // Todas vistas (pero debería estar en favoritos, no en progreso)
}
```

#### **Interfaz de usuario**

```jsx
// En Progreso: mostrar progreso + botón "Continuar viendo"

<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
  {inProgressSeries.map(series => (
    <div className="relative cursor-pointer group">
      {/* Poster con overlay */}
      <img src={series.poster} className="w-full h-80 object-cover rounded" />
      
      {/* Overlay en hover */}
      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition duration-300 flex flex-col justify-end p-3 rounded">
        {/* Barra de progreso */}
        <div className="bg-gray-800 rounded-full h-2 mb-2">
          <div 
            className="bg-yellow-500 h-full rounded-full transition"
            style={{ width: `${series.progress}%` }}
          />
        </div>
        
        {/* Información */}
        <div className="text-xs text-gray-300 mb-2">
          {series.watchedCount} / {series.totalCount} episodios
        </div>
        
        {/* Botón "Continuar viendo" */}
        <Link 
          href={`/details/${series.nextEpisode.link}`}
          className="bg-purple-600 hover:bg-purple-700 px-3 py-2 rounded text-sm font-bold"
        >
          Continuar en {series.nextEpisode.name}
        </Link>
      </div>
    </div>
  ))}
</div>
```

#### **Ordenación**

Por defecto: por fecha de último episodio visto (más reciente primero)

```javascript
const sortByLastWatched = (items, direction = 'desc') => {
  return items.sort((a, b) => {
    const dateA = new Date(a.lastWatchedDate)
    const dateB = new Date(b.lastWatchedDate)
    return direction === 'desc' ? dateB - dateA : dateA - dateB
  })
}

// Ventaja: el usuario ve primero la serie que estaba viendo ayer
```

---

## 8. Estadísticas del Usuario

### 📍 Ubicación

```
src/app/stats/page.jsx
src/components/stats/StatsClient.jsx  (~100 KB)
```

### 🎯 Propósito

Mostrar analytics personalizadas: cuánto ha visto, géneros favoritos, distribución de ratings, actividad por fecha, etc.

### 🏗️ Arquitectura

#### **Fuentes de datos**

```javascript
// Trat devuelve:
// GET /users/me/stats

const statsData = {
  stats: {
    plays: 1234,              // Número de veces iniciada reproducción
    last_watched_at: '...',   // Último visionado
    last_updated_at: '...',   // Última actualización de datos
    movies: { plays: 800, last_watched_at: '...' },
    shows: { plays: 434, episodes: 1200, last_watched_at: '...' }
  }
}

// Para análisis más profundos:
// 1. Regenerar historial local (parse /sync/history)
// 2. Agrupar por fecha, género, año, etc
```

#### **Visualizaciones**

**1. Resumen global (CSS Grid)**
```jsx
<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
  <StatCard 
    label="Películas vistas"
    value={stats.movies.plays}
    icon={FilmIcon}
  />
  <StatCard 
    label="Series seguidas"
    value={stats.shows.follow}
    icon={TvIcon}
  />
  <StatCard 
    label="Episodios vistos"
    value={stats.shows.episodes}
    icon={PlayCircle}
  />
  <StatCard 
    label="Tiempo total"
    value={formatHours(stats.movies.plays * 120 + stats.shows.episodes * 45)}
    icon={ClockIcon}
  />
</div>
```

**2. Gráfico de géneros (Recharts BarChart)**
```jsx
<BarChart data={genreDistribution} width={600} height={400}>
  <CartesianGrid stroke="#fff/10" />
  <XAxis dataKey="name" />
  <YAxis />
  <Tooltip />
  <Bar dataKey="count" fill="#f59e0b" />
</BarChart>

// Datos:
const genreDistribution = [
  { name: 'Drama', count: 45 },
  { name: 'Acción', count: 35 },
  { name: 'Comedia', count: 28 },
  { name: 'Thriller', count: 18 },
  ...
]
```

**3. Heatmap de actividad (Tipo GitHub)**
```jsx
// Mostrar actividad por día en forma de grid

const ActivityHeatmap = ({ historyByDate }) => {
  // historyByDate = { '2025-01-01': 3, '2025-01-02': 1, ... }
  
  const weeks = generateWeeks(52)  // Últimas 52 semanas
  
  return (
    <svg width="900" height="120">
      {weeks.map((week, weekIdx) => (
        week.map((date, dayIdx) => {
          const count = historyByDate[dateToString(date)] || 0
          const intensity = Math.min(count / 5, 1)  // Normalizar 0-1
          
          return (
            <rect
              key={`${weekIdx}-${dayIdx}`}
              x={weekIdx * 15}
              y={dayIdx * 15}
              width="12"
              height="12"
              fill={getHeatmapColor(intensity)}  // Blanco → verde
              rx="2"
            />
          )
        })
      ))}
    </svg>
  )
}
```

**4. Distribución de ratings (Histogram)**
```jsx
// 1-10 stars: cuántos títulos rating en cada nivel

const ratingDistribution = [
  { rating: 1, count: 0 },
  { rating: 2, count: 0 },
  { rating: 3, count: 1 },
  { rating: 4, count: 2 },
  { rating: 5, count: 5 },
  { rating: 6, count: 12 },
  { rating: 7, count: 28 },
  { rating: 8, count: 35 },
  { rating: 9, count: 18 },
  { rating: 10, count: 2 },
]

<BarChart data={ratingDistribution}>
  <Bar 
    dataKey="count" 
    fill="#8b5cf6"
    radius={[4, 4, 0, 0]}
  />
</BarChart>
```

#### **Caché y actualización**

```javascript
// Stats es relativamento costoso de generar (requiere parsear 1000+ items)
// Solución: caché con revalidación

// En Server Component:
export const revalidate = 3600  // 1 hora

// En Client Component:
const [statsCache, setStatsCache] = useState(null)
const [cacheTimestamp, setCacheTimestamp] = useState(null)

useEffect(() => {
  // Verificar si caché aún válido (< 1 hora)
  const now = Date.now()
  const isStale = cacheTimestamp && now - cacheTimestamp > 3600000
  
  if (isStale || !statsCache) {
    fetchStats().then(data => {
      setStatsCache(data)
      setCacheTimestamp(now)
    })
  }
}, [])
```

---

## 9. Calendario de Estrenos

### 📍 Ubicación

```
src/app/calendar/page.jsx  (~700 líneas, componente muy completo)
```

### 🎯 Propósito

Mostrar próximos estrenos de películas y episodios de series, permitiendo explorar qué está por llegar.

### 🏗️ Arquitectura

#### **Fuentes de datos**

```javascript
// Combinación de TMDb (general) + Trakt (personal)

const calendarData = {
  // TMDb: próximos estrenos generales
  upcomingMovies: await getUpcomingMovies(),      // GET /movie/upcoming
  upcomingShows: await getOnTheAirTV(),           // GET /tv/on_the_air
  
  // Trakt: próximos episodios de series seguidas (si autenticado)
  personalCalendar: await traktGetCalendar(),     // GET /calendars/my/shows
}
```

#### **Vistas del calendario**

**1. Vista día (día actual)**
```jsx
// Mostrar qué estrena HOY

<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {todayItems.map(item => (
    <CalendarItem item={item} />
  ))}
</div>
```

**2. Vista semana**
```jsx
// Mostrar próximos 7 días en filas

<div className="space-y-2">
  {['Mon', 'Tue', 'Wed', ...].map(day => (
    <div className="border-l-4 border-yellow-500 pl-4">
      <h3 className="font-bold">{day}</h3>
      {itemsByDay[day].map(item => (
        <item-preview />
      ))}
    </div>
  ))}
</div>
```

**3. Vista mes (tradicional)**
```jsx
// Calendario clásico tipo Google Calendar

<ReactCalendar
  value={selectedMonth}
  onChange={setSelectedMonth}
  tileContent={({ date }) => {
    const items = itemsByDate[dateToString(date)] || []
    return (
      <div className="text-xs">
        {items.slice(0, 2).map(item => (
          <div className="text-[9px] truncate">{item.title}</div>
        ))}
        {items.length > 2 && <div>+{items.length - 2}</div>}
      </div>
    )
  }}
/>
```

#### **Filtrado y ordenación**

```javascript
// Controles:
// - Tipo: películas, series, ambas
// - Período: hoy, semana, mes, próximos 30 días
// - Ordenación: por fecha, por popularidad

const applyFilters = (items, filters) => {
  return items
    .filter(item => {
      // Filtro tipo
      if (filters.type === 'movie' && item.media_type === 'tv') return false
      if (filters.type === 'tv' && item.media_type === 'movie') return false
      
      // Filtro período
      const itemDate = new Date(item.release_date)
      const daysFromNow = getDaysDifference(new Date(), itemDate)
      
      switch (filters.period) {
        case 'today':
          return daysFromNow === 0
        case 'week':
          return daysFromNow >= 0 && daysFromNow < 7
        case 'month':
          return daysFromNow >= 0 && daysFromNow < 30
        default:
          return true
      }
    })
    .sort((a, b) => {
      switch (filters.sortBy) {
        case 'date':
          return new Date(a.release_date) - new Date(b.release_date)
        case 'popularity':
          return b.popularity - a.popularity
        default:
          return 0
      }
    })
}
```

---

## 10. Biblioteca Personal

### 📍 Ubicación

```
src/app/biblioteca/BibliotecaClient.jsx  (~70 KB)
```

### 🎯 Propósito

Vista unificada y personal del contenido del usuario: combina historial + series en progreso + favoritos.

### 🏗️ Arquitectura

**Es esencialmente una combinación de 3 módulos:**
1. Historial (reciente)
2. En progreso (series activas)
3. Favoritos (contenido destacado)

```jsx
BibliotecaClient
├── Resumen ejecutivo
│   ├─ Última visualización
│   ├─ Series activas
│   └─ Favoritos recientes
│
├── Sección "Continuar viendo"
│   ├─ Series en progreso con barra de progreso
│   ├─ Botón "Siguiente episodio"
│   └─ Actualización en tiempo real
│
├── Sección "Historial"
│   ├─ Últimas 20 películas/episodios visto
│   ├─ Ordenado por fecha (más reciente primero)
│   └─ Link a detalle
│
└── Sección "Favoritos"
    ├─ Últimas 12 películas/series favoritas
    ├─ Grid de posters
    └── Acceso rápido sin navegación
```

#### **Arquitectura de datos**

```javascript
const BibliotecaData = {
  lastWatched: {
    date: '2025-01-15 20:30',
    item: { title: 'Breaking Bad S05E14', ... }
  },
  
  inProgressSeries: [
    {
      series: {...},
      progress: 48.4,
      nextEpisode: { season: 3, episode: 5 },
      watchedCount: 30,
      totalCount: 62
    },
    ...
  ],
  
  recentHistory: [
    { watched_at: '2025-01-15', ... },
    { watched_at: '2025-01-14', ... },
    ...
  ],
  
  recentFavorites: [
    { id: 1, title: 'Breaking Bad', ... },
    ...
  ]
}
```

---

## 11. Descubrir Contenido

### 📍 Ubicación

```
src/app/discover/page.jsx
src/components/DiscoverClient.jsx  (~48 KB)
```

### 🎯 Propósito

Motor de búsqueda y filtrado avanzado. Permite al usuario explorar contenido con criterios personalizados.

### 🏗️ Arquitectura

#### **Búsqueda**

```javascript
// Búsqueda por texto + filtros

const searchWithFilters = async (options) => {
  const {
    query,
    type,        // 'movie' | 'tv' | 'person'
    genres,      // [28, 35, 18]
    yearFrom,    // 2010
    yearTo,      // 2025
    ratingFrom,  // 7.0
    ratingTo,    // 10.0
    sortBy,      // 'popularity' | 'rating' | 'release_date'
    page,
    signal       // AbortSignal
  } = options
  
  // TMDb /search/multi = búsqueda por texto
  // O TMDb /discover/movie = búsqueda por filtros
  
  if (query) {
    // Búsqueda de texto
    const resp = await tmdbFetch('/search/multi', {
      query,
      page,
    }, signal)
    return resp.results.filter(r => isValidMediaType(r))
  } else {
    // Búsqueda por filtros (discover)
    const resp = await tmdbFetch('/discover/movie', {
      with_genres: genres.join(','),
      'release_date.gte': `${yearFrom}-01-01`,
      'release_date.lte': `${yearTo}-12-31`,
      'vote_average.gte': ratingFrom,
      'vote_average.lte': ratingTo,
      sort_by: sortBy === 'rating' ? 'vote_average.desc' : 'popularity.desc',
      page,
    }, signal)
    return resp.results
  }
}
```

#### **Debounce en búsqueda**

```javascript
// Problema: cada keystroke = 1 petición a TMDb

const useDiscoverSearch = (query, filters) => {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  
  const abortRef = useRef(null)
  
  // Debounce: esperar 400ms sin cambios antes de buscar
  useEffect(() => {
    const handler = setTimeout(async () => {
      abortRef.current?.abort()
      const newAbort = new AbortController()
      abortRef.current = newAbort
      
      setLoading(true)
      try {
        const data = await searchWithFilters({
          ...filters,
          query,
          signal: newAbort.signal
        })
        setResults(data)
      } catch (err) {
        if (err?.name !== 'AbortError') console.error(err)
      } finally {
        setLoading(false)
      }
    }, 400)
    
    return () => clearTimeout(handler)
  }, [query, filters])
  
  return { results, loading }
}
```

#### **Interfaz de filtros**

```jsx
<div className="space-y-4">
  {/* Búsqueda de texto */}
  <input
    type="text"
    placeholder="Buscar película, serie, actor..."
    value={query}
    onChange={(e) => setQuery(e.target.value)}
    className="w-full px-4 py-2 rounded-lg bg-gray-800 text-white"
  />
  
  {/* Género */}
  <MultiSelect
    label="Géneros"
    options={genreOptions}
    selected={selectedGenres}
    onChange={setSelectedGenres}
  />
  
  {/* Rango de años */}
  <RangeSlider
    label="Año"
    min={1950}
    max={2025}
    value={[yearFrom, yearTo]}
    onChange={([f, t]) => { setYearFrom(f); setYearTo(t) }}
  />
  
  {/* Calificación mínima */}
  <RangeSlider
    label="Rating TMDb mínimo"
    min={1}
    max={10}
    step={0.5}
    value={ratingFrom}
    onChange={setRatingFrom}
  />
  
  {/* Ordenación */}
  <Select
    label="Ordenar por"
    options={['Popularidad', 'Rating', 'Fecha lanzamiento']}
    value={sortBy}
    onChange={setSortBy}
  />
</div>
```

#### **Paginación infinita**

```javascript
// Cargar más resultados al llegar al final

const DiscoverClient = () => {
  const [page, setPage] = useState(1)
  const [allResults, setAllResults] = useState([])
  const observerTarget = useRef(null)
  
  // Intersection Observer para detectar fin de página
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !loading) {
          setPage(prev => prev + 1)  // Cargar próxima página
        }
      },
      { threshold: 0.5 }
    )
    
    if (observerTarget.current) {
      observer.observe(observerTarget.current)
    }
    
    return () => observer.disconnect()
  }, [loading])
  
  // Fetch cuando cambia página
  useEffect(() => {
    fetchSearchResults(page).then(newResults => {
      setAllResults(prev => [...prev, ...newResults])
    })
  }, [page])
  
  return (
    <div>
      {/* Grid de resultados */}
      <div className="grid grid-cols-6 gap-4">
        {allResults.map(item => (
          <SearchResultCard item={item} />
        ))}
      </div>
      
      {/* Target para intersection observer */}
      <div ref={observerTarget} className="py-8">
        {loading && <LoadingSpinner />}
      </div>
    </div>
  )
}
```

---

## 12. Gestión de Listas

### 📍 Ubicación

```
src/app/lists/page.jsx  (~1700 líneas, componente complejo)
src/components/lists/CollectionDetailsClient.jsx
src/components/lists/TraktListDetailsClient.jsx
src/components/lists/UnifiedListDetailsLayout.jsx
```

### 🎯 Propósito

Hub central para acceder a listas: listas del usuario, listas curadas, colecciones de saga, listas públicas de Trakt.

### 🏗️ Arquitectura

#### **Tipos de listas**

```javascript
const listTypes = {
  // 1. Listas propias del usuario en TMDb
  userLists: {
    endpoint: '/list/{id}',
    features: ['editable', 'shareable', 'private/public'],
    api: 'TMDb'
  },
  
  // 2. Listas curadas públicas de TMDb
  curatedLists: {
    endpoint: '/list/{id}' (pre-made by TMDb)
    features: ['read-only', 'shareable'],
    examples: ['250 películas clásicas', 'Top terror 2024']
  },
  
  // 3. Colecciones de saga (MCU, Star Wars, etc)
  collections: {
    endpoint: '/collection/{id}',
    features: ['chronological order', 'release order'],
    examples: ['Marvel Cinematic Universe', 'Matrix saga']
  },
  
  // 4. Listas públicas de Trakt
  traktLists: {
    endpoint: '/users/{user}/lists/{list_id}',
    features: ['trending', 'community scoring'],
    examples: ['Best movies 2024 (Trakt)', 'Must watch series']
  }
}
```

#### **Página principal de listas**

```jsx
// ListsPage: hub con diferentes secciones

<div className="space-y-12">
  {/* 1. Listas del usuario */}
  <section>
    <h2>Mis Listas</h2>
    {userLists.map(list => (
      <ListCard list={list} onEdit={handleEdit} onDelete={handleDelete} />
    ))}
    <button onClick={() => createNewList()}>+ Nueva lista</button>
  </section>
  
  {/* 2. Listas curadas */}
  <section>
    <h2>Listas Destacadas</h2>
    <div className="grid grid-cols-4 gap-4">
      {curatedLists.map(list => (
        <ListCard list={list} readonly />
      ))}
    </div>
  </section>
  
  {/* 3. Colecciones de saga */}
  <section>
    <h2>Sagas y Franquicias</h2>
    <div className="grid grid-cols-3 gap-4">
      {collections.map(col => (
        <CollectionCard collection={col} />
      ))}
    </div>
  </section>
  
  {/* 4. Listas públicas Trakt */}
  <section>
    <h2>Trending en Trakt</h2>
    {traktLists.map(list => (
      <TraktListCard list={list} />
    ))}
  </section>
</div>
```

#### **Detalles de una lista**

```javascript
// /lists/[listId]: mostrar todos los ítems de una lista

const ListDetailsPage = async ({ params: { listId } }) => {
  // 1. Fetch metadatos de la lista
  const listMeta = await getListMetadata(listId)
  
  // 2. Fetch ítems (con paginación)
  const items = await getListItems(listId, {
    page: 1,
    sortBy: 'custom'  // orden definido por creador
  })
  
  // 3. Para cada ítem: enriquecer con IMDb, Trakt scores
  const enrichedItems = await Promise.all(
    items.map(item => enrichItemScores(item))
  )
  
  return <UnifiedListDetailsLayout 
    list={listMeta}
    items={enrichedItems}
  />
}
```

#### **3 vistas para ítems de lista**

**1. Grid**
```jsx
<div className="grid grid-cols-6 gap-4">
  {items.map(item => (
    <ListItemCard item={item} />
  ))}
</div>
```

**2. Rows (similar a favoritos)**
```jsx
<div className="space-y-2">
  {items.map(item => (
    <ListItemRow item={item} />
  ))}
</div>
```

**3. List (máxima densidad)**
```jsx
<table className="w-full">
  <thead>
    <tr>
      <th>Posición</th>
      <th>Título</th>
      <th>Año</th>
      <th>TMDb Rating</th>
      <th>Acciones</th>
    </tr>
  </thead>
  <tbody>
    {items.map((item, idx) => (
      <tr>
        <td>{idx + 1}</td>
        <td>{item.title}</td>
        <td>{item.year}</td>
        <td className="text-yellow-400">{item.vote_average}</td>
        <td>{/* Botones */}</td>
      </tr>
    ))}
  </tbody>
</table>
```

---

## 13. Secciones Películas y Series

### 📍 Ubicación

```
src/app/movies/page.jsx
src/app/series/page.jsx
src/components/MoviesPageClient.jsx
src/components/SeriesPageClient.jsx
```

### 🎯 Propósito

Vistas temáticas de películas y series. Similar al dashboard pero dedicado a un tipo único de contenido.

### 🏗️ Arquitectura

```javascript
// Estructura muy similar al dashboard, pero filtrada

const MoviesPage = async () => {
  const movieSections = await Promise.all([
    fetchTopRatedMovies(),
    fetchTrendingMovies(),
    fetchActionMovies(),
    fetchDramaMovies(),
    fetchComedyMovies(),
    fetchHorrorMovies(),
    fetchSciFiMovies(),
    // ... más géneros
  ])
  
  return <MoviesPageClient sections={movieSections} />
}
```

**Diferencias vs Dashboard:**
- ❌ Sin secciones personalizadas (favoritos, en progreso)
- ✅ Más géneros cubiertos (12+ vs 3 en dashboard)
- ✅ Mejor para usuarios que buscan específicamente películas o series

---

## 14. Búsqueda de Personas

### 📍 Ubicación

```
src/app/details/person/[id]/page.jsx
src/components/ActorDetails.jsx  (~44 KB)
```

### 🎯 Propósito

Ficha detallada de actor/actriz: biografía, filmografía completa, créditos como director/guionista, etc.

### 🏗️ Arquitectura

#### **Datos de persona**

```javascript
const getPersonDetails = async (personId) => {
  const [details, movieCredits, tvCredits] = await Promise.all([
    // GET /person/{id}
    fetch(`/person/${personId}`),
    
    // GET /person/{id}/movie_credits
    fetch(`/person/${personId}/movie_credits`),
    
    // GET /person/{id}/tv_credits
    fetch(`/person/${personId}/tv_credits`)
  ])
  
  // details:
  {
    name: 'Bryan Cranston',
    biography: '...',
    birthday: '1956-03-07',
    place_of_birth: 'Los Angeles, USA',
    profile_path: '/...',
    known_for_department: 'Acting'  // o 'Directing'
  }
  
  // movieCredits:
  {
    cast: [
      {
        id: 278,
        title: 'Shawshank Redemption',
        character: 'Andy Dufresne',
        release_date: '1994-10-14',
        vote_average: 9.3
      },
      ...
    ],
    crew: [
      // Director, writer, etc
    ]
  }
}
```

#### **Interfaz**

```jsx
<div className="space-y-8">
  {/* Header con foto y datos básicos */}
  <div className="flex gap-8">
    <img 
      src={profile_path} 
      className="w-64 h-auto rounded-lg shadow-xl"
    />
    <div className="flex-1">
      <h1 className="text-5xl font-black">{name}</h1>
      <p className="mt-2 text-gray-400">{biography}</p>
      <div className="mt-4 space-y-2 text-sm">
        <div><strong>Nacido:</strong> {birthday} en {place_of_birth}</div>
        <div><strong>Conocido por:</strong> {known_for_department}</div>
        <div><strong>Filmografía:</strong> {movieCredits.cast.length} películas</div>
      </div>
    </div>
  </div>
  
  {/* Pestañas: Filmografía como actor, director, etc */}
  <Tabs>
    <Tab label="Actor">
      {/* Grid de películas/series donde fue actor */}
    </Tab>
    <Tab label="Director">
      {/* Grid de películas/series que dirigió */}
    </Tab>
    <Tab label="Guionista">
      {/* Grid de películas/series que escribió */}
    </Tab>
  </Tabs>
</div>
```

#### **Filmografía interactiva**

```javascript
// Filtrar filmografía por rol

const filmographyByDepartment = () => {
  const departments = {}
  
  // Procesar cast
  movieCredits.cast.forEach(credit => {
    if (!departments['Acting']) departments['Acting'] = []
    departments['Acting'].push({
      type: 'movie',
      title: credit.title,
      character: credit.character,
      ...
    })
  })
  
  // Procesar crew
  movieCredits.crew.forEach(credit => {
    const dept = credit.department  // 'Directing', 'Writing', etc
    if (!departments[dept]) departments[dept] = []
    departments[dept].push({
      type: 'movie',
      title: credit.title,
      job: credit.job,  // Director, Writer, Producer, etc
      ...
    })
  })
  
  return departments
}
```

---

## 15. Barra de Navegación

### 📍 Ubicación

```
src/components/Navbar.jsx  (~30 KB)
```

### 🎯 Propósito

Navegación principal + autenticación + búsqueda rápida. Presente en todas las páginas.

### 🏗️ Arquitectura

#### **Componentes**

```jsx
<Navbar>
  ├─ Logo (link a /)
  ├─ Links de navegación
  │  ├─ Movies
  │  ├─ Series
  │  ├─ Discover
  │  ├─ Lists
  │  ├─ Calendar
  │  ├─ Stats
  │  └─ Biblioteca
  │
  ├─ Búsqueda rápida (input)
  │
  ├─ Indicadores de estado
  │  ├─ ❤️ Favoritos (contador)
  │  ├─ 📝 Watchlist (contador)
  │  └─ 🔥 Trending badge
  │
  ├─ Botones de autenticación
  │  ├─ Login TMDb (si no autenticado)
  │  ├─ Connect Trakt (si TMDb ok)
  │  ├─ Connect Plex (opcional)
  │  └─ User Avatar (si autenticado)
  │
  └─ Menú mobile (hamburger)
```

#### **Efecto stick en scroll**

```javascript
// Cambia de transparente a glassmorphism al hacer scroll

const useNavbarSticky = () => {
  const [isScrolled, setIsScrolled] = useState(false)
  
  useEffect(() => {
    let ticking = false
    
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          setIsScrolled(window.scrollY > 100)
          ticking = false
        })
        ticking = true
      }
    }
    
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])
  
  return isScrolled
}

// Uso:
const isScrolled = useNavbarSticky()

<nav className={`fixed top-0 w-full z-50 transition-all ${
  isScrolled 
    ? 'bg-black/70 backdrop-blur-md border-b border-white/5' 
    : 'bg-transparent'
}`}>
```

#### **Búsqueda rápida**

```javascript
// Input que redirige a /discover

const handleSearch = (e) => {
  e.preventDefault()
  const term = searchInput.trim()
  if (term) {
    router.push(`/discover?q=${encodeURIComponent(term)}`)
  }
}

// Con autocomplete (opcional):
// - Mostrar top 5 resultados al escribir
// - Clic directo a detalle
```

#### **Menú mobile (hamburger)**

```jsx
const [menuOpen, setMenuOpen] = useState(false)

<button onClick={() => setMenuOpen(!menuOpen)}>
  <MenuIcon />
</button>

{menuOpen && (
  <MobileMenu>
    {navItems.map(item => (
      <Link href={item.href}>{item.label}</Link>
    ))}
  </MobileMenu>
)}
```

---

## 🏛️ Arquitectura de Datos Transversal

### Patrones comunes

#### **1. Actualización optimista**

Concepto usado en casi TODOS los módulos:

```javascript
// User hace clic → UI se actualiza INSTANTÁNEAMENTE
// En background: enviar request al servidor
// Si éxito: mantenemos estado (ya correcto)
// Si fallo: revertir estado
```

**Ventaja:** latencia percibida = CERO (no esperar respuesta del servidor)

#### **2. Lazy loading con caché**

```javascript
// No cargar TODO al montar componente
// Cargar bajo demanda (al hover, al click, etc)
// Cache: no hacer 2 veces el fetch
```

**Ventaja:** mejor rendimiento inicial + rápido después

#### **3. Deduplicación en vuelo**

```javascript
// Si 5 usuarios piden mismo dato simultáneamente:
// Hacer 1 fetch compartido (no 5)
// Todos esperan resultado de 1
```

#### **4. Paginación paralela**

```javascript
// Descargar múltiples páginas en paralelo
// Combinar resultados
// MUCHO más rápido que secuencial
```

### Gestión de errores global

```javascript
// src/lib/api/errorHandler.js

export const handleApiError = (error, context) => {
  const isNetwork = error?.name === 'AbortError' || error?.code === 20
  const isTimeout = error?.code === 'ETIMEDOUT'
  const isNotFound = error?.status === 404
  const isRateLimit = error?.status === 429
  
  if (isNetwork || isTimeout) {
    console.warn(`[${context}] Network/timeout error`)
    return null  // Silent fail, UI mostrará skeleton/empty
  }
  
  if (isRateLimit) {
    console.warn(`[${context}] Rate limit hit`)
    return { retry: true, delayMs: 5000 }
  }
  
  if (isNotFound) {
    return null  // Recurso no existe: ok
  }
  
  console.error(`[${context}] Unexpected error:`, error)
  return null
}
```

---

**Fin de documentación completa (Parte 2 de 2)**

---

## 📚 Índice Rápido de Patrones

| Patrón | Módulos | Beneficio |
|--------|---------|-----------|
| Actualización optimista | Favoritos, Watchlist, Detalle, Episodios | UX sin latencia |
| Lazy loading caché | Favoritos, Descubrir, Detalle | Rendimiento inicial |
| Paginación paralela | Favoritos, Watchlist, Historial | 3x más rápido |
| Deduplicación en vuelo | Puntuaciones OMDb, Trakt scores | Reduce API calls |
| Heatmap visual | Stats, Calendario | Análisis rápido |
| 3 vistas alternativas | Favoritos, Watchlist, Listas | Flexibilidad UX |
| Sticky scroll | Navbar, Detalles | UX moderna |
| Debounce búsqueda | Discover, Navbar search | Limita requests |
| Pool de concurrencia | Score loading, Paginación | Rate limit safe |
| ISR caché 10-60 min | Dashboard, Sections | Fresca + rápida |

---

## 🎯 Métricas de Complejidad

| Módulo | LOC | Complejidad | APIs internas usadas |
|--------|-----|-------------|----------------------|
| Dashboard | 300 | Media | TMDb (12 endpoints) |
| DetailsClient | 6000+ | Muy Alta | TMDb, Trakt, OMDb, Plex |
| Favoritos | 1500 | Media | TMDb, OMDb, Trakt |
| Historial | 1200 | Media | Trakt → TMDb join |
| Discover | 1200 | Media-Alta | TMDb, Debounce, Abort |
| Estadísticas | 2000 | Alta | Trakt parsing + charts |
| Calendario | 1800 | Media-Alta | TMDb + Trakt merge |
| Listas | 1700 | Alta | Multiple endpoints |
| Navbar | 1000 | Media | Auth, Navigation |

---

## 🔗 Relaciones entre Módulos

```
Dashboard (Principal)
├─→ Detalle (clic en poster)
├─→ Discover (búsqueda avanzada)
└─→ Favoritos/Watchlist (cta autenticación)

Detalle
├─→ Episodios (series)
├─→ Personas (clic en actor)
╰─→ Recomendaciones (clic en similar)

Favoritos / Watchlist
├─→ Detalle (clic en poster)
└─→ Manage desde Detalle (quitar de lista)

Biblioteca
├─→ Continuar viendo (link a episodio)
└─→ Historial + En Progreso (agregado)

Estadísticas
└─→ Generadas de Historial de Trakt

Calendario
├─→ Detalle (clic en estreno)
└─→ Suscribirse en Trakt
```

Esta arquitectura forma un **grafo conectado** donde cada tabla de contenido es un nodo y las transiciones son aristas. El usuario navega fluidamente entre módulos siguiendo su flujo natural.

---

**Fin de la documentación profunda de módulos funcionales**
