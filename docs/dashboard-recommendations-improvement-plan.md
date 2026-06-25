# Plan para mejorar dashboards y recomendaciones

## Summary

Reestructurar el motor de dashboards en tres frentes: carga e interacción inmediata, recomendaciones más representativas usando mejor las valoraciones del usuario, y mayor variedad entre Inicio, Películas y Series. El foco principal debe estar en el backend del motor documentado en `docs/dashboards-implementation.md`, manteniendo TMDB + biblioteca propia como fuente del sistema.

## Key Changes

- Optimizar carga e interacción de carruseles:
  - Eliminar cualquier bloqueo inicial que impida deslizar al entrar en Inicio, Películas o Series.
  - Evitar remounts innecesarios de Swiper por cambios de `hydrated`.
  - Mantener skeletons o contenido cacheado sin desactivar `pointer-events`/`touch`.
  - Revisar `MainDashboardClient`, `MoviesPageClient`, `SeriesPageClient` y `useEngineRows` para que las secciones sean interactivas en cuanto se pintan.

- Mejorar señales de recomendación del usuario:
  - Dar más peso a `user_ratings` que a historial y watchlist.
  - Usar como semillas fuertes solo títulos con valoración alta:
    - `rating >= 9`: señal principal.
    - `rating = 8`: señal positiva.
    - `rating = 7`: señal secundaria.
  - Mantener favoritos como señal fuerte, pero por debajo de valoraciones muy altas.
  - Historial sin buena valoración no debe dominar "Para ti" ni "Porque viste...".

- Reducir restricción de contenido ya visto:
  - En filas genéricas permitir títulos ya vistos: tendencias, populares, mejor valoradas, Top 10, géneros, décadas, estrenos, joyas ocultas.
  - En filas personalizadas aplicar restricción más selectiva:
    - "Para ti": puede incluir algunos vistos si tienen alta afinidad o alta valoración previa, pero no debe estar dominada por vistos.
    - "Porque viste...": permitir vistos solo como excepción de baja proporción.
  - Mover la lógica de exclusión desde "siempre excluir biblioteca" hacia una política configurable por tipo de fila.

- Mejorar "Para ti":
  - Recalibrar scoring para que represente gustos reales: ratings altos, favoritos, visionados repetidos o recientes.
  - Añadir variedad entre los tres dashboards:
    - Inicio debe mezclar películas y series.
    - Películas debe priorizar recomendaciones `movie`.
    - Series debe priorizar recomendaciones `tv`.
  - Evitar repetir exactamente los mismos títulos de "Para ti" entre Inicio, Películas y Series usando una deduplicación por superficie o una rotación con semillas distintas.
  - Mantener una cantidad mínima de elementos por fila, rellenando con afinidad de géneros solo cuando falten candidatos fuertes.

- Mejorar "Porque viste...":
  - Generar estas filas solo desde títulos que realmente gustaron:
    - `rating >= 8`, o favorito, o visionado con señal fuerte adicional.
  - No usar títulos vistos de forma casual o pendientes como base principal.
  - El título del seed debe reflejar una razón creíble: "Porque viste X" solo si X fue una señal positiva clara.
  - Ordenar seeds por valoración primero, luego favoritos, luego intensidad/recencia de visionado.

## API / Interfaces

- Mantener la respuesta actual de `GET /v1/dashboard/:surface` siempre que sea posible.
- Añadir internamente una política por fila/superficie para:
  - `allowSeen`: si permite vistos.
  - `seenRatioLimit`: proporción máxima de vistos en filas personalizadas.
  - `surfaceDedupeScope`: dedupe entre Inicio/Películas/Series para "Para ti".
  - `seedEligibility`: criterios para usar títulos en "Porque viste...".
- No cambiar el contrato frontend salvo que se quiera exponer razones más claras; si se expone, añadir metadata opcional en filas personalizadas sin romper consumidores actuales.

## Test Plan

- Backend:
  - Tests de `buildSeeds`: ratings altos pesan más que historial/watchlist.
  - Tests de `excludeSeen` o política equivalente: genéricas permiten vistos; personalizadas limitan vistos.
  - Tests de "Para ti": no repite el mismo set en las tres superficies.
  - Tests de "Porque viste...": solo genera filas desde seeds con rating alto/favorito/señal positiva.
  - Tests de ensamblaje: mantiene mínimos de fila y dedupe cruzado sin vaciar secciones.

- Frontend:
  - Verificar que los carruseles se pueden deslizar inmediatamente al entrar en Inicio, Películas y Series.
  - Confirmar que no hay remount visual o retardo por `hydrated`.
  - Probar escritorio y móvil para Swiper en filas genéricas y personalizadas.

## Assumptions

- El motor principal de dashboards debe seguir usando TMDB + biblioteca propia, no Trakt, tal como indica la documentación.
- "Ya visto" se permitirá sobre todo en secciones genéricas; en recomendaciones personalizadas se permite solo con control de proporción.
- "Porque viste..." debe interpretarse como "porque te gustó X", no solo porque aparece en historial.
- La prioridad de implementación recomendada es: primero interacción/carga, luego scoring de recomendaciones, después variedad/dedupe entre dashboards.
