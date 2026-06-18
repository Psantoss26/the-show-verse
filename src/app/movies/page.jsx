// /src/app/movies/page.jsx
import MoviesPageClient from "./MoviesPageClient";

import {
  fetchPopularMedia,
  discoverMovies,
} from "@/lib/api/tmdb";

// Ajusta el revalidate según lo fresco que quieras el contenido
export const revalidate = 1800; // 30 minutos

export const metadata = {
  title: "Películas",
};

/* ========= Utilidad para obtener la URL base en servidor ========= */
function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL)
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  // Fallback para desarrollo local
  return "http://localhost:3000";
}

/* ======== Llamada SERVER-SIDE a /api/imdb/top-rated ======== */
async function fetchTopRatedImdbServer() {
  const baseUrl = getBaseUrl();

  const url = `${baseUrl}/api/imdb/top-rated?type=movie&pages=3&limit=80&minVotes=15000`;

  let res;
  try {
    res = await fetch(url, {
      // Opcional, para que Next cachee también esta llamada
      next: { revalidate },
    });
  } catch (networkErr) {
    console.error(
      "Error de red al llamar a /api/imdb/top-rated:",
      networkErr?.message,
    );
    return [];
  }

  if (!res.ok) {
    console.error("Error al llamar a /api/imdb/top-rated:", res.status);
    return [];
  }

  const json = await res.json();

  // Cubrimos varias formas posibles de respuesta:
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.results)) return json.results;
  if (Array.isArray(json.items)) return json.items;

  return [];
}

/* ======== Curado de listas tipo Netflix/Prime (solo servidor) ======== */
const sortByVotes = (list = []) =>
  [...list].sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0));

function curateList(
  list,
  { minVotes = 0, minRating = 0, minSize = 20, maxSize = 60 } = {},
) {
  if (!Array.isArray(list)) return [];

  const sorted = sortByVotes(list);

  const applyFilter = (minV, minR) =>
    sorted.filter((m) => {
      const votes = m?.vote_count || 0;
      const rating = typeof m?.vote_average === "number" ? m.vote_average : 0;
      return votes >= minV && rating >= minR;
    });

  let current = applyFilter(minVotes, minRating);
  if (current.length >= minSize) return current.slice(0, maxSize);

  const steps = [
    { factorV: 0.7, deltaR: -0.3 },
    { factorV: 0.5, deltaR: -0.6 },
    { factorV: 0.3, deltaR: -1.0 },
    { factorV: 0.1, deltaR: -1.5 },
  ];

  let mv = minVotes;
  let mr = minRating;

  for (const step of steps) {
    mv = Math.max(0, Math.round(mv * step.factorV));
    mr = Math.max(0, mr + step.deltaR);
    current = applyFilter(mv, mr);
    if (current.length >= minSize) return current.slice(0, maxSize);
  }

  if (sorted.length === 0) return [];
  const size = Math.min(sorted.length, Math.max(minSize, maxSize));
  return sorted.slice(0, size);
}

/* ======== Carga de datos CRÍTICOS en el SERVIDOR ======== */
async function getCriticalDashboardData() {
  const lang = "es-ES";

  try {
    const [popular, topImdbRaw, topES] = await Promise.all([
      fetchPopularMedia({ type: "movie", language: lang }),
      fetchTopRatedImdbServer(),
      discoverMovies({ region: "ES", sort_by: "popularity.desc", page: 1 }),
    ]);

    const curatedPopular = curateList(popular, {
      minVotes: 1500,
      minRating: 6.2,
      minSize: 30,
      maxSize: 80,
    });

    const curatedTopIMDb = curateList(topImdbRaw, {
      minVotes: 20000,
      minRating: 7.3,
      minSize: 30,
      maxSize: 80,
    });

    const curatedTopES = sortByVotes(topES).slice(0, 10);

    return {
      popular: curatedPopular,
      top_imdb: curatedTopIMDb,
      "Top 10 hoy en España": curatedTopES,
    };
  } catch (err) {
    console.error("Error cargando datos críticos de películas (SSR):", err);
    return {
      popular: [],
      top_imdb: [],
      "Top 10 hoy en España": [],
    };
  }
}

/* =================== Componente de servidor =================== */
export default async function MoviesPage() {
  const initialData = await getCriticalDashboardData();

  return (
    <MoviesPageClient
      initialData={initialData}
    />
  );
}

