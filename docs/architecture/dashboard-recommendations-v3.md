# Criterios de recomendación de los dashboards (v3)

Inicio, Películas y Series combinan candidatos de TMDb con la biblioteca propia
 del usuario. Es un recomendador por contenido y señales explícitas; no utiliza
 datos privados ni los modelos propietarios de Netflix o Prime Video.

## Selección y personalización

- Valoraciones ≥9 aportan 10 puntos; ≥8, 7; ≥7, 4. Un favorito aporta 6,
  un pendiente 3 y un visionado 1. Las señales se combinan una vez por título.
- Las valoraciones de 1 a 5 excluyen el título de todas las filas y de las semillas,
  incluso si seguía guardado como favorito o pendiente.
- Se conservan hasta 25 semillas por tipo y se consultan las 20 de mayor peso
  por tipo. Una biblioteca dominada por películas no elimina las semillas de series.
- Recommendations y similar de TMDb aportan afinidad, con menor peso para similar
  y posiciones posteriores. Un candidato aporta una sola vez por semilla, aunque
  aparezca en ambas fuentes. Se ponderan también calidad y volumen de votos.
- «Porque te gustó» exige favorito o nota ≥8. Agrupa todas las razones válidas
  por tipo e ID, hasta tres grupos de al menos 12 candidatos.
- La calidad pública aproxima la media a 6,5 cuando hay pocos votos (prior de
  500 votos para películas y 150 para series), además de los filtros existentes.
- Las filas rotativas combinan relevancia, calidad, popularidad y una pequeña
  exploración determinista diaria por usuario. «Para ti» favorece distintos grupos
  de candidatos cercanos en cada dashboard, sin desplazar afinidades fuertes.
- Tendencias, popularidad y rankings editoriales conservan el orden de su fuente.
  Inicio intercala películas y series; los géneros usan IDs propios de cada tipo.

## Volumen y diversidad

El objetivo es **32 tarjetas por fila**, con mínimo **12**. Primero se reserva
el mínimo de cada sección; después se amplían por turnos. Las filas nunca se
rellenan con títulos ajenos a su temática. Las fuentes amplias consultan entre
6 y 10 páginas; las recomendaciones conservan hasta 240 candidatos directos y
80 por afinidad de género.

No se repite un título dentro de una fila. Entre filas se priorizan candidatos
únicos; solo para completar filas se permite una segunda aparición, separada
por al menos tres posiciones y con un máximo del 12,5 % de repetidos en la fila
posterior. Los vistos se limitan al 20 % en recomendaciones y afinidad de género,
y al 10 % en «Porque te gustó», calculado sobre la longitud real.

Los encabezados describen los datos disponibles: «Populares en streaming en
España» indica disponibilidad regional y popularidad TMDb, no audiencia medida
 en España; «Películas con grandes valoraciones» no presupone premios; nostalgia
explicita 1995–2012 y estrenos incluye próximos lanzamientos. Inicio utiliza la
misma fila del motor en su bloque de mejor valoradas para respetar la deduplicación.

## Caché y fallos

- El hash incluye la versión v3 y la nota exacta, por lo que un cambio de valoración
  invalida recomendaciones. Caché de pools con sufijo interno `:v2` y cliente v5.
- Construcciones concurrentes del mismo pool o recomendaciones se comparten.
  TMDb admite hasta 8 peticiones simultáneas por proceso, con timeout de 8 segundos
  por intento y los reintentos existentes.
- Los pools conservan su resultado anterior si una reconstrucción queda vacía.
  Si todas las fuentes de recomendaciones fallan, se conserva el resultado anterior,
  filtrando las nuevas valoraciones negativas. No se persiste ese fallo como vacío.
- El cliente conserva su última selección si la API falla o devuelve catálogo vacío.
- No hay migración de esquema. Los pools se reconstruyen al usarlos o mediante el
  precalentamiento existente; la primera carga en frío puede tardar más.

## Verificación

Pruebas puras de semillas, ranking y ensamblaje; integración Fastify de los tres
endpoints con perfiles nuevos, anónimos y personalizados, solapamientos y fuentes
fallidas. Una auditoría adicional contra los pools locales comprueba volumen,
tipos, distancias y porcentajes de repetición con datos de catálogo.
