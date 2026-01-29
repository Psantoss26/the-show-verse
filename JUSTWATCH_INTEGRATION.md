# Integración de JustWatch para Plataformas de Streaming

## Resumen

Se ha implementado una integración completa con JustWatch (API no oficial) para obtener las plataformas de streaming disponibles y sus enlaces directos, reemplazando el sistema anterior basado en TMDB.

## Archivos Creados/Modificados

### 1. **src/lib/api/justwatch.js** (NUEVO)

Cliente de API para JustWatch que proporciona:

- `getStreamingProviders()`: Obtiene las plataformas disponibles con enlaces directos
- `searchTitle()`: Busca un título en JustWatch
- `getTitleDetails()`: Obtiene detalles completos incluyendo ofertas de streaming

**Características:**

- Búsqueda por título, tipo (movie/tv) y año
- Filtrado por tipo de monetización (FLATRATE = suscripción)
- Generación de URLs de búsqueda para plataformas que no proporcionan enlaces directos
- Manejo de errores robusto

### 2. **src/app/api/streaming/route.js** (NUEVO)

Endpoint API de Next.js que:

- Acepta parámetros: `title`, `type`, `year`, `imdbId`, `tmdbId`
- Retorna: `{ providers: [...], justwatchUrl: string }`
- Cache de 24 horas (s-maxage=86400)
- Validación de parámetros

### 3. **src/components/DetailsClient.jsx** (MODIFICADO)

Cambios realizados:

- Añadido estado `streamingProviders` para providers de JustWatch
- Añadido estado `justwatchUrl` para el enlace de JustWatch
- useEffect que carga providers automáticamente al montar el componente
- Actualizado renderizado de iconos para usar `p.url` (enlace directo de la plataforma)
- Actualizado jwHref para usar `justwatchUrl`
- Manejo de errores de carga de imágenes con fallback

## Flujo de Datos

```
1. DetailsClient.jsx (useEffect)
   ↓
2. GET /api/streaming?title=...&type=...&year=...
   ↓
3. justwatch.js → searchTitle()
   ↓
4. justwatch.js → getTitleDetails()
   ↓
5. Retorna: { providers: [...], justwatchUrl: "..." }
   ↓
6. DetailsClient.jsx actualiza estado
   ↓
7. Renderiza iconos con enlaces directos
```

## Estructura de Datos

### Provider Object

```javascript
{
  provider_id: number,      // ID del proveedor en JustWatch
  provider_name: string,    // Nombre legible (ej: "Netflix")
  logo_path: string,        // Path al logo
  display_priority: number, // Prioridad de visualización
  monetization_type: string,// 'FLATRATE', 'RENT', 'BUY', 'FREE', 'ADS'
  url: string              // ⭐ Enlace directo a la plataforma
}
```

### API Response

```javascript
{
  providers: Provider[],    // Array de proveedores (max 10)
  justwatchUrl: string     // URL de JustWatch para este título
}
```

## Plataformas Soportadas

El sistema genera URLs de búsqueda para las siguientes plataformas:

- **nfx** → Netflix
- **prime** → Amazon Prime Video
- **disney** → Disney+
- **hbo** → HBO Max
- **apple** → Apple TV+
- **movistar** → Movistar Plus+
- **skyshowtime** → SkyShowtime
- **filmin** → Filmin
- **paramount** → Paramount+
- **crunchyroll** → Crunchyroll
- **atresplayer** → Atresplayer
- **rakuten** → Rakuten TV

## Limitaciones

### JustWatch API (No Oficial)

- **No es una API pública oficial**: Los endpoints pueden cambiar sin previo aviso
- **Rate limiting**: No hay límites documentados pero se recomienda cachear agresivamente
- **Disponibilidad**: Puede estar sujeta a cambios o restricciones
- **Enlaces directos**: JustWatch proporciona `standardWebURL` pero no siempre apunta directamente al contenido, a veces son URLs de búsqueda

### Alternativas Consideradas

1. **TMDB**: Proporciona provider_ids pero no enlaces directos
2. **Trakt**: No proporciona información de plataformas de streaming
3. **JustWatch Oficial**: No existe API pública
4. **Web Scraping**: Violación de términos de servicio

## Mejoras Futuras

1. **Cache Local**: Implementar cache en localStorage/IndexedDB para reducir llamadas
2. **Logos de Plataformas**: Descargar y servir logos localmente
3. **Deep Linking**: Mejorar enlaces directos usando IDs específicos cuando estén disponibles
4. **Fallback a TMDB**: Si JustWatch falla, volver a TMDB
5. **Monitoreo**: Detectar si JustWatch API cambia y alertar
6. **País/Región**: Permitir seleccionar región (actualmente fijo en ES - España)

## Uso

El componente DetailsClient carga automáticamente las plataformas al montarse:

```jsx
// Automático
<DetailsClient
  type="movie"
  id={123}
  data={movieData}
  // ... otros props
/>
```

Los providers se muestran automáticamente en la sección de póster con enlaces directos.

## Testing

Para probar la integración:

1. Navegar a cualquier detalle de película/serie
2. Observar los iconos de plataformas debajo del póster
3. Clic en un icono debe abrir la plataforma correspondiente
4. Verificar en Network que se llama a `/api/streaming`
5. Inspeccionar la respuesta para ver providers y justwatchUrl

## Mantenimiento

- **Revisar logs** de errores en `/api/streaming`
- **Actualizar mapeo** de plataformas en `PLATFORM_URLS` según sea necesario
- **Monitorear cambios** en JustWatch GraphQL schema
- **Actualizar** cuando cambien las URLs de las plataformas

---

**Fecha de Implementación**: Enero 2026  
**Desarrollador**: GitHub Copilot  
**Estado**: ✅ Producción
