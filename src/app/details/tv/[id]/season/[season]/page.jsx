import SeasonDetailsClient from "@/components/SeasonDetailsClient";
import { getShareData, shareMetadata } from "@/lib/share/shareMeta";
import { pickByLanguageLadder } from "@/lib/tmdb/imageLanguageLadder";
import { getStreamingProviders } from "@/lib/api/justwatch";
import { playableRankedVideos } from "@/lib/details/videos";
import { headers } from "next/headers";
import { clientIpFromHeaders } from "@/lib/backend/server";

// Las peticiones a TMDb se guardan 1 h; la página en sí es dinámica por el
// póster más votado (fetchCommunitySeasonPoster, sin caché).
export const revalidate = 3600; // 1h

const BACKEND_BASE =
  process.env.BACKEND_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;
const COMMUNITY_SERVER_TIMEOUT_MS = 1200;

// Póster MÁS VOTADO de la temporada (cada «Editar portada» es un voto; ver
// backend/src/lib/artworkVotes.js): ruta, `null` sin votos o `undefined` si
// no se supo a tiempo (lo pregunta el cliente). Sin caché aquí, como las
// imágenes votadas de la ficha (lib/community/server.js): guardado en la
// página, al recargar salía la ganadora anterior y el cliente la cambiaba
// delante del usuario. Esto hace la página dinámica (TMDb sigue en caché).
async function fetchCommunitySeasonPoster(seasonId) {
  if (!BACKEND_BASE || !seasonId) return undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), COMMUNITY_SERVER_TIMEOUT_MS);
  try {
    const ip = clientIpFromHeaders(await headers().catch(() => null));
    const res = await fetch(
      `${BACKEND_BASE}/v1/community/seasons/artwork?ids=${Number(seasonId)}`,
      {
        cache: "no-store",
        signal: controller.signal,
        headers: ip ? { "X-Forwarded-For": ip } : {},
      },
    );
    if (!res.ok) return undefined;
    const json = await res.json();
    return json?.posters?.[seasonId] || null;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

// Tope para resolver las plataformas en el servidor: si JustWatch tarda más,
// la página sale sin ellas y las pide el cliente, como antes.
const PROVIDERS_SERVER_TIMEOUT_MS = 1500;

const TMDB_API_KEY =
  process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;

async function tmdbFetch(path) {
  const url = `https://api.themoviedb.org/3${path}${path.includes("?") ? "&" : "?"}api_key=${TMDB_API_KEY}&language=es-ES`;
  const res = await fetch(url, { next: { revalidate } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(json?.status_message || `TMDb error ${res.status}`);
  return json;
}

export async function generateMetadata({ params }) {
  const p = await params;
  const showId = Number(p?.id);
  const seasonNumber = Number(p?.season);

  if (!Number.isFinite(showId) || !Number.isFinite(seasonNumber)) {
    return { title: "Temporada" };
  }

  // Título + vista previa al compartir (Open Graph). Ver lib/share/shareMeta.js.
  const share = await getShareData({ kind: "season", id: showId, season: seasonNumber }).catch(() => null);
  return shareMetadata(share, `Temporada ${seasonNumber}`);
}

export default async function SeasonPage({ params }) {
  if (!TMDB_API_KEY)
    throw new Error("Missing TMDB_API_KEY or NEXT_PUBLIC_TMDB_API_KEY");

  const p = await params;
  const showId = Number(p?.id);
  const seasonNumber = Number(p?.season);

  if (!Number.isFinite(showId) || !Number.isFinite(seasonNumber)) {
    return (
      <div className="min-h-screen bg-[#101010] text-white flex items-center justify-center">
        <div className="text-zinc-400">Ruta inválida (id/season).</div>
      </div>
    );
  }

  const showPromise = tmdbFetch(`/tv/${showId}?append_to_response=external_ids`);
  // Los VÍDEOS de la temporada van en la misma petición: «Ver tráiler» nace
  // en su estado final (encendido o apagado) en vez de salir activo con un
  // spinner y apagarse al ver que no hay vídeos. Mismos idiomas que pide el
  // cliente (loadSeasonVideos).
  const seasonPromise = tmdbFetch(
    `/tv/${showId}/season/${seasonNumber}?append_to_response=videos&include_video_language=es,en,null`,
  );
  // PÓSTER con la escalera de idioma de toda la app (inglés → español →
  // idioma original de la serie → sin idioma): el PRIMERO de los que devuelve
  // TMDb en ese idioma, en su orden. Sin ninguno, se queda el `poster_path`
  // de TMDb. Se piden las imágenes de TODOS los idiomas (sin `language` ni
  // `include_image_language`) en paralelo con la serie, que aporta su idioma
  // original. Se resuelve en el servidor para que la portada no cambie al
  // cargar.
  const seasonImagesPromise = fetch(
    `https://api.themoviedb.org/3/tv/${showId}/season/${seasonNumber}/images?api_key=${TMDB_API_KEY}`,
    { next: { revalidate } },
  )
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null);
  const ladderPosterPromise = Promise.all([
    showPromise.catch(() => null),
    seasonImagesPromise,
  ]).then(
    ([showJson, images]) =>
      pickByLanguageLadder(images?.posters, (tier) => tier[0], {
        originalLanguage: showJson?.original_language,
      })?.file_path || null,
  );

  // PLATAFORMAS DE LA SERIE en el HTML: la fila de iconos va bajo el póster y,
  // si llegaba después de pintar (desde el cliente), la columna crecía 72px y
  // la sección «Episodios» saltaba hacia abajo. Con ellas ya en el HTML la
  // página nace con su altura final. `null` = no se resolvieron a tiempo.
  const providersPromise = showPromise
    .then((showJson) => {
      const title = showJson?.name || showJson?.original_name;
      if (!title) return null;
      const year = Number(String(showJson?.first_air_date || "").slice(0, 4));
      return Promise.race([
        getStreamingProviders(title, "tv", year > 0 ? year : null).then(
          // `degraded` (JustWatch no respondió) = sin resolver: el cliente
          // las vuelve a pedir en vez de dar por hecho que no hay.
          (result) =>
            !result?.degraded && Array.isArray(result?.providers)
              ? result.providers
              : null,
        ),
        new Promise((resolve) =>
          setTimeout(() => resolve(null), PROVIDERS_SERVER_TIMEOUT_MS),
        ),
      ]);
    })
    .catch(() => null);

  // En cuanto se sabe el id de la temporada, en paralelo con lo demás.
  const communityPosterPromise = seasonPromise
    .then((seasonJson) => fetchCommunitySeasonPoster(seasonJson?.id))
    .catch(() => undefined);

  const [show, seasonData, ladderPosterPath, initialShowProviders, initialCommunityPoster] =
    await Promise.all([
      showPromise,
      seasonPromise,
      ladderPosterPromise,
      providersPromise,
      communityPosterPromise,
    ]);
  const { videos: seasonVideosData, ...seasonWithoutVideos } = seasonData || {};
  const initialSeasonVideos = seasonVideosData
    ? playableRankedVideos(seasonVideosData.results)
    : null;
  const season = ladderPosterPath
    ? { ...seasonWithoutVideos, poster_path: ladderPosterPath }
    : seasonWithoutVideos;

  const showImdbId = show?.external_ids?.imdb_id || null;

  const imdbUrl = showImdbId
    ? `https://www.imdb.com/title/${showImdbId}/episodes?season=${seasonNumber}`
    : null;

  return (
    <SeasonDetailsClient
      showId={showId}
      seasonNumber={seasonNumber}
      show={show}
      season={season}
      showImdbId={showImdbId}
      initialScoreboard={null}
      initialShowWatched={null}
      imdb={null}
      imdbUrl={imdbUrl}
      initialShowProviders={initialShowProviders}
      initialSeasonVideos={initialSeasonVideos}
      initialCommunityPoster={initialCommunityPoster}
    />
  );
}
