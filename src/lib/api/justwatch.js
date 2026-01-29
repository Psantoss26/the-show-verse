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
  9: { tmdb_id: 9, logo_path: "/emthp39XA2YScoYL1p0sdbAH2WA.jpg" }, // Amazon Prime Video
  337: { tmdb_id: 337, logo_path: "/7rwgEs15tFwyR9NPQ5vpzxTj19Q.jpg" }, // Disney+
  384: { tmdb_id: 384, logo_path: "/Ajqyt5aNxNGjmF9uOfxArGrdf3X.jpg" }, // HBO Max
  350: { tmdb_id: 350, logo_path: "/6uhKBfmtzFqOcLousHwZuzcrScK.jpg" }, // Apple TV+
  149: { tmdb_id: 149, logo_path: "/8z7rC8uIDaTM91X0ZfkRf04ydj2.jpg" }, // Movistar Plus+
  583: { tmdb_id: 583, logo_path: "/2ioan5BX5L9tz4fIGU93blTeFhv.jpg" }, // SkyShowtime
  63: { tmdb_id: 63, logo_path: "/cQQYtdaCg7vDo28JPru4v8Ypi8x.jpg" }, // Filmin
  531: { tmdb_id: 531, logo_path: "/xbhHHa1YgtpwhC8lb1NQ3ACVcLd.jpg" }, // Paramount+
  283: { tmdb_id: 283, logo_path: "/8Gt1iClBlzTeQs8WQm8UrCoIxnQ.jpg" }, // Crunchyroll
  85: { tmdb_id: 85, logo_path: "/aPJcLVqbdwXtkIIF3SxKg8XkZSf.jpg" }, // Atresplayer
  35: { tmdb_id: 35, logo_path: "/5GEbAhFW2S5T8zVc1MNvz00pIzM.jpg" }, // Rakuten TV

  // Plataformas adicionales comunes en España
  119: { tmdb_id: 119, logo_path: "/pZgeSWpfvD59x6sLFQevirwfF7E.jpg" }, // Amazon Prime Video (adicional)
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

/**
 * Busca un título en JustWatch
 */
async function searchTitle(title, type = "movie", year = null) {
  try {
    const searchFilter = {
      searchQuery: title,
    };

    // Filtrar por tipo de contenido
    if (type === "movie") {
      searchFilter.objectTypes = ["MOVIE"];
    } else if (type === "tv") {
      searchFilter.objectTypes = ["SHOW"];
    }

    // Agregar año si está disponible
    if (year) {
      searchFilter.releaseYear = {
        min: year - 1,
        max: year + 1,
      };
    }

    const response = await fetch(JUSTWATCH_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: SEARCH_QUERY,
        variables: {
          first: 5,
          searchTitlesFilter: searchFilter,
          country: COUNTRY_CODE,
          language: "es",
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`JustWatch API error: ${response.status}`);
    }

    const data = await response.json();
    const edges = data?.data?.popularTitles?.edges || [];

    if (edges.length === 0) {
      return null;
    }

    // Retornar el primer resultado (el más relevante)
    return edges[0].node;
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
  searchTitle,
  getTitleDetails,
};

export default justwatchClient;
