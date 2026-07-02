// src/lib/api/justwatch.js
/**
 * JustWatch API Client (Unofficial)
 *
 * JustWatch no tiene una API oficial pública, pero podemos usar sus endpoints GraphQL
 * para obtener información de disponibilidad de streaming.
 */

const JUSTWATCH_API_URL = "https://apis.justwatch.com/graphql";
const COUNTRY_CODE = "ES"; // España por defecto

/**
 * Mapeo de package_short_name de JustWatch a URLs de plataforma
 */
const PLATFORM_URLS = {
  nfx: "https://www.netflix.com/search?q=",
  prime: "https://www.primevideo.com/search/ref=atv_nb_sug?phrase=",
  disney: "https://www.disneyplus.com/search?q=",
  hbo: "https://www.max.com/search?q=",
  max: "https://www.max.com/search?q=",
  "hbo-max": "https://www.max.com/search?q=",
  apple: "https://tv.apple.com/search?term=",
  movistar: "https://ver.movistarplus.es/buscar/",
  skyshowtime: "https://www.skyshowtime.com/search?query=",
  filmin: "https://www.filmin.es/buscar/",
  paramount: "https://www.paramountplus.com/es/search/?query=",
  crunchyroll: "https://www.crunchyroll.com/search?q=",
  atresplayer: "https://www.atresplayer.com/buscar/?palabra=",
  rakuten: "https://rakuten.tv/es/search?q=",
};

/**
 * Mapeo de IDs de JustWatch a IDs de TMDB para obtener los logos correctos
 * Los logos de TMDB están en: https://image.tmdb.org/t/p/original/[logo_path]
 */
const JUSTWATCH_TO_TMDB_PROVIDER = {
  // Principales plataformas
  8: { tmdb_id: 8, logo_path: "/t2yyOv40HZeVlLjYsCsPHnWLk4W.jpg" }, // Netflix
  119: { tmdb_id: 119, logo_path: "/pvske1MyAoymrs5bguRfVqYiM9a.jpg" }, // Amazon Prime Video
  337: { tmdb_id: 337, logo_path: "/7rwgEs15tFwyR9NPQ5vpzxTj19Q.jpg" }, // Disney+
  384: { tmdb_id: 384, logo_path: "/Ajqyt5aNxNGjmF9uOfxArGrdf3X.jpg" }, // HBO Max (internacional)
  1899: { tmdb_id: 1899, logo_path: "/jbe4gVSfRlbPTdESXhEKpornsfu.jpg" }, // HBO Max (España)
  350: { tmdb_id: 350, logo_path: "/6uhKBfmtzFqOcLousHwZuzcrScK.jpg" }, // Apple TV+
  2241: { tmdb_id: 2241, logo_path: "/jse4MOi92Jgetym7nbXFZZBI6LK.jpg" }, // Movistar Plus+ (principal)
  149: { tmdb_id: 149, logo_path: "/f6TRLB3H4jDpFEZ0z2KWSSvu1SB.jpg" }, // Movistar Plus+ Ficción Total
  583: { tmdb_id: 583, logo_path: "/2ioan5BX5L9tz4fIGU93blTeFhv.jpg" }, // SkyShowtime
  63: { tmdb_id: 63, logo_path: "/cQQYtdaCg7vDo28JPru4v8Ypi8x.jpg" }, // Filmin
  531: { tmdb_id: 531, logo_path: "/xbhHHa1YgtpwhC8lb1NQ3ACVcLd.jpg" }, // Paramount+
  283: { tmdb_id: 283, logo_path: "/8Gt1iClBlzTeQs8WQm8UrCoIxnQ.jpg" }, // Crunchyroll
  85: { tmdb_id: 85, logo_path: "/aPJcLVqbdwXtkIIF3SxKg8XkZSf.jpg" }, // Atresplayer
  35: { tmdb_id: 35, logo_path: "/5GEbAhFW2S5T8zVc1MNvz00pIzM.jpg" }, // Rakuten TV

  // Plataformas adicionales comunes en España
  167: { tmdb_id: 167, logo_path: "/9TYc5ODeLxwRmxbUrhQSbqc72Nx.jpg" }, // FlixOlé
  3: { tmdb_id: 3, logo_path: "/tbEdP95K91o5eYHN4l3wtnr5HCJ.jpg" }, // Google Play Movies
  2: { tmdb_id: 2, logo_path: "/5vfrJQgNe9UnHVgVNAwZTy0Jo9o.jpg" }, // Apple iTunes
  68: { tmdb_id: 68, logo_path: "/shq88b09gTBYC4hA7K7MUL8Q4zP.jpg" }, // Microsoft Store
};

/**
 * Query GraphQL para buscar contenido en JustWatch
 */
const SEARCH_QUERY = `
query GetSearchTitles(
  $searchTitlesFilter: TitleFilter!
  $country: Country!
  $language: Language!
  $first: Int!
  $searchAfterCursor: String
) {
  popularTitles(
    filter: $searchTitlesFilter
    after: $searchAfterCursor
    first: $first
    country: $country
  ) {
    edges {
      node {
        id
        objectId
        objectType
        content(country: $country, language: $language) {
          title
          fullPath
          originalReleaseYear
          posterUrl
          externalIds {
            imdbId
            tmdbId
          }
          scoring {
            imdbScore
            tmdbScore
          }
        }
      }
    }
  }
}
`;

/**
 * Query GraphQL para obtener detalles de un título específico (incluye ofertas)
 */
const TITLE_DETAILS_QUERY = `
query GetTitleDetails(
  $nodeId: ID!
  $country: Country!
  $language: Language!
  $platform: Platform!
) {
  node(id: $nodeId) {
    id
    ... on MovieOrShowOrSeason {
      objectId
      objectType
      content(country: $country, language: $language) {
        title
        fullPath
        originalReleaseYear
        externalIds {
          imdbId
          tmdbId
        }
      }
      offers(country: $country, platform: $platform) {
        id
        monetizationType
        presentationType
        standardWebURL
        package {
          id
          packageId
          clearName
          shortName
          technicalName
        }
      }
    }
  }
}
`;

const SHOW_SEASONS_QUERY = `
query GetShowSeasons(
  $nodeId: ID!
  $country: Country!
  $language: Language!
) {
  node(id: $nodeId) {
    ... on Show {
      seasons {
        id
        content(country: $country, language: $language) {
          title
        }
      }
    }
  }
}
`;

const SEASON_EPISODES_QUERY = `
query GetSeasonEpisodes(
  $nodeId: ID!
  $country: Country!
  $language: Language!
  $platform: Platform!
) {
  node(id: $nodeId) {
    ... on Season {
      episodes {
        id
        content(country: $country, language: $language) {
          title
        }
        offers(country: $country, platform: $platform) {
          monetizationType
          presentationType
          standardWebURL
          deeplinkURL(platform: $platform)
          package {
            packageId
            clearName
            shortName
            technicalName
          }
        }
      }
    }
  }
}
`;

async function justWatchGraphql(query, variables) {
  const response = await fetch(JUSTWATCH_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(`JustWatch API error: ${response.status}`);
  }

  const payload = await response.json();
  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    throw new Error(payload.errors[0]?.message || "JustWatch GraphQL error");
  }

  return payload?.data || null;
}

function normalizeComparableTitle(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function selectJustWatchTitle(nodes, { tmdbId, title } = {}) {
  if (!Array.isArray(nodes) || nodes.length === 0) return null;

  const requestedTmdbId = String(tmdbId || "").trim();
  if (requestedTmdbId) {
    const exactTmdb = nodes.find(
      (node) =>
        String(node?.content?.externalIds?.tmdbId || "") === requestedTmdbId,
    );
    if (exactTmdb) return exactTmdb;
  }

  const requestedTitle = normalizeComparableTitle(title);
  if (requestedTitle) {
    const exactTitle = nodes.find(
      (node) =>
        normalizeComparableTitle(node?.content?.title) === requestedTitle,
    );
    if (exactTitle) return exactTitle;
  }

  return nodes[0];
}

function extractNumberFromLabel(value) {
  const match = String(value || "").match(
    /(?:^|\b)(?:temporada|season|saison|staffel|episodio|episode|cap[ií]tulo|chapter|[tse])\s*\.?\s*(\d+)/i,
  );
  if (!match) return null;
  const valueNumber = Number(match[1]);
  return Number.isInteger(valueNumber) ? valueNumber : null;
}

export function selectNumberedJustWatchItem(items, number) {
  if (!Array.isArray(items) || !Number.isInteger(number) || number <= 0) {
    return null;
  }

  const labelled = items.find(
    (item) => extractNumberFromLabel(item?.content?.title) === number,
  );
  return labelled || items[number - 1] || null;
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function mapEpisodeOffersToProviders(offers) {
  const providersByUrl = new Map();

  for (const offer of Array.isArray(offers) ? offers : []) {
    if (offer?.monetizationType !== "FLATRATE" || !offer?.package) continue;

    const directUrl = safeHttpsUrl(offer.deeplinkURL);
    if (!directUrl || providersByUrl.has(directUrl)) continue;

    const providerId = offer.package.packageId;
    const logoPath = JUSTWATCH_TO_TMDB_PROVIDER[providerId]?.logo_path || null;
    if (!logoPath) continue;

    providersByUrl.set(directUrl, {
      provider_id: providerId,
      provider_name: offer.package.clearName,
      logo_path: logoPath,
      url: directUrl,
      monetization_type: offer.monetizationType,
      presentation_type: offer.presentationType,
    });
  }

  return Array.from(providersByUrl.values()).slice(0, 10);
}

async function searchTitles(title, type = "movie", year = null) {
  const searchFilter = {
    searchQuery: title,
  };

  if (type === "movie") {
    searchFilter.objectTypes = ["MOVIE"];
  } else if (type === "tv") {
    searchFilter.objectTypes = ["SHOW"];
  }

  if (year) {
    searchFilter.releaseYear = {
      min: year - 1,
      max: year + 1,
    };
  }

  const data = await justWatchGraphql(SEARCH_QUERY, {
    first: 5,
    searchTitlesFilter: searchFilter,
    country: COUNTRY_CODE,
    language: "es",
  });

  return (data?.popularTitles?.edges || [])
    .map((edge) => edge?.node)
    .filter(Boolean);
}

/**
 * Busca un título en JustWatch
 */
async function searchTitle(title, type = "movie", year = null) {
  try {
    const nodes = await searchTitles(title, type, year);
    return nodes[0] || null;
  } catch (error) {
    console.error("Error searching JustWatch:", error);
    return null;
  }
}

/**
 * Obtiene los detalles completos de un título (incluyendo ofertas de streaming)
 */
async function getTitleDetails(nodeId) {
  try {
    const response = await fetch(JUSTWATCH_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: TITLE_DETAILS_QUERY,
        variables: {
          nodeId,
          country: COUNTRY_CODE,
          language: "es",
          platform: "WEB",
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`JustWatch API error: ${response.status}`);
    }

    const data = await response.json();
    return data?.data?.node || null;
  } catch (error) {
    console.error("Error getting JustWatch details:", error);
    return null;
  }
}

/**
 * Obtiene las plataformas de streaming disponibles con enlaces directos
 * @param {string} title - Título de la película o serie
 * @param {string} type - Tipo: 'movie' o 'tv'
 * @param {number|null} year - Año de lanzamiento (opcional)
 */
export async function getStreamingProviders(
  title,
  type = "movie",
  year = null,
) {
  try {
    // 1. Buscar el título
    const searchResult = await searchTitle(title, type, year);

    if (!searchResult) {
      return {
        providers: [],
        justwatchUrl: null,
      };
    }

    // 2. Obtener detalles completos con ofertas
    const details = await getTitleDetails(searchResult.id);

    if (!details) {
      return {
        providers: [],
        justwatchUrl: null,
      };
    }

    // 3. Construir URL de JustWatch
    const fullPath =
      details.content?.fullPath || searchResult.content?.fullPath;
    const justwatchUrl = fullPath
      ? `https://www.justwatch.com${fullPath}`
      : null;

    // 4. Procesar las ofertas
    const offers = details.offers || [];
    const providerMap = new Map();

    // Agrupar ofertas por proveedor
    for (const offer of offers) {
      const pkg = offer.package;
      if (!pkg) continue;

      const providerId = pkg.packageId;
      const shortName = pkg.shortName || pkg.technicalName;

      if (!providerMap.has(providerId)) {
        // Obtener el logo de TMDB si está mapeado
        const tmdbProvider = JUSTWATCH_TO_TMDB_PROVIDER[providerId];
        const logoPath = tmdbProvider?.logo_path || null;

        providerMap.set(providerId, {
          provider_id: providerId,
          provider_name: pkg.clearName,
          logo_path: logoPath,
          display_priority: 0,
          monetization_type: offer.monetizationType, // 'FLATRATE', 'RENT', 'BUY', 'FREE', 'ADS'
          url: offer.standardWebURL || generateProviderUrl(shortName, title),
        });
      }
    }

    // Convertir a array y filtrar solo FLATRATE (suscripción) y que tengan logo
    const providers = Array.from(providerMap.values())
      .filter((p) => p.monetization_type === "FLATRATE" && p.logo_path)
      .slice(0, 10); // Limitar a 10 proveedores

    return {
      providers,
      justwatchUrl,
    };
  } catch (error) {
    console.error("Error getting streaming providers from JustWatch:", error);
    return {
      providers: [],
      justwatchUrl: null,
    };
  }
}

export async function getEpisodeStreamingProviders({
  title,
  year = null,
  tmdbId = null,
  seasonNumber,
  episodeNumber,
}) {
  try {
    const nodes = await searchTitles(title, "tv", year);
    const showNode = selectJustWatchTitle(nodes, { tmdbId, title });
    if (!showNode?.id) return { providers: [] };

    const seasonsData = await justWatchGraphql(SHOW_SEASONS_QUERY, {
      nodeId: showNode.id,
      country: COUNTRY_CODE,
      language: "es",
    });
    const season = selectNumberedJustWatchItem(
      seasonsData?.node?.seasons,
      Number(seasonNumber),
    );
    if (!season?.id) return { providers: [] };

    const episodesData = await justWatchGraphql(SEASON_EPISODES_QUERY, {
      nodeId: season.id,
      country: COUNTRY_CODE,
      language: "es",
      platform: "WEB",
    });
    const episode = selectNumberedJustWatchItem(
      episodesData?.node?.episodes,
      Number(episodeNumber),
    );
    if (!episode) return { providers: [] };

    return {
      providers: mapEpisodeOffersToProviders(episode.offers),
      justwatchEpisodeId: episode.id,
    };
  } catch (error) {
    console.error("Error getting JustWatch episode offers:", error);
    return { providers: [] };
  }
}

/**
 * Genera una URL de búsqueda para una plataforma específica
 */
function generateProviderUrl(shortName, title) {
  const baseUrl = PLATFORM_URLS[shortName];
  if (!baseUrl) {
    return null;
  }

  return `${baseUrl}${encodeURIComponent(title)}`;
}

/**
 * Obtiene el logo de un proveedor desde TMDB (fallback)
 */
export function getProviderLogoFromTMDB(providerId) {
  // Mapeo de IDs de JustWatch a TMDB
  const jwToTmdb = {
    8: 8, // Netflix
    9: 9, // Amazon Prime Video
    337: 337, // Disney+
    384: 384, // HBO Max
    // Agregar más mapeos según sea necesario
  };

  const tmdbId = jwToTmdb[providerId];
  if (!tmdbId) return null;

  return `https://image.tmdb.org/t/p/original/t2yyOv40HZeVlLjYsCsPHnWLk4W.jpg`; // Placeholder
}

const justwatchClient = {
  getStreamingProviders,
  getEpisodeStreamingProviders,
  searchTitle,
  getTitleDetails,
};

export default justwatchClient;
