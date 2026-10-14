// Lectura de la exportación de datos del usuario. Todo sale de la BBDD propia:
// los títulos guardados con cada fila y el año / id de IMDb de la caché de
// TMDb. No se pide nada a TMDb, para que exportar miles de títulos no dependa
// de su límite de peticiones.

import { asc, desc, eq } from 'drizzle-orm';
import { favorites, userRatings, watchlist } from '../db/schema.js';
import { getMediaMetadataMap } from '../utils/mediaMetadata.js';
import { exportTitleType, shapeUserExport } from './userExportCore.js';

// Cada título consulta tres claves de caché: tandas pequeñas para no rozar el
// límite de parámetros de Postgres con bibliotecas grandes.
const METADATA_BATCH = 1000;

async function exportMetadata(rows) {
  const unique = new Map();
  for (const row of rows) {
    const type = exportTitleType(row.mediaType);
    const key = `${type}:${row.tmdbId}`;
    if (!unique.has(key)) unique.set(key, { mediaType: type, tmdbId: row.tmdbId });
  }

  const titles = [...unique.values()];
  const merged = new Map();
  for (let index = 0; index < titles.length; index += METADATA_BATCH) {
    const batch = await getMediaMetadataMap(titles.slice(index, index + METADATA_BATCH), {
      fetchMissing: false,
    });
    for (const [key, value] of batch) merged.set(key, value);
  }
  return merged;
}

export async function loadUserExport(db, user, sections) {
  const want = new Set(sections);
  const [favoriteRows, watchlistRows, ratingRows] = await Promise.all([
    want.has('favorites')
      ? db
          .select()
          .from(favorites)
          .where(eq(favorites.userId, user.id))
          .orderBy(desc(favorites.addedAt))
      : null,
    want.has('watchlist')
      ? db
          .select()
          .from(watchlist)
          .where(eq(watchlist.userId, user.id))
          .orderBy(desc(watchlist.addedAt))
      : null,
    want.has('ratings')
      ? db
          .select()
          .from(userRatings)
          .where(eq(userRatings.userId, user.id))
          .orderBy(desc(userRatings.ratedAt), asc(userRatings.season), asc(userRatings.episode))
      : null,
  ]);

  const metadataByKey = await exportMetadata([
    ...(favoriteRows || []),
    ...(watchlistRows || []),
    ...(ratingRows || []),
  ]);

  return shapeUserExport({
    user,
    favorites: favoriteRows,
    watchlist: watchlistRows,
    ratings: ratingRows,
    metadataByKey,
  });
}
