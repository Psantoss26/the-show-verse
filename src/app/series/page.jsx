// /src/app/series/page.jsx
import SeriesPageClient from "./SeriesPageClient";

import {
  fetchPopularMedia,
  fetchTrendingTVDay,
} from "@/lib/api/tmdb";

export const revalidate = 1800; // 30 min

export const metadata = {
  title: "Series",
};

/* ========= Utilidad para obtener la URL base en servidor ========= */
function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL)
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/* ======== Llamada SERVER-SIDE a /api/imdb/top-rated (series) ======== */
async function fetchTopRatedImdbTvServer() {
  const baseUrl = getBaseUrl();

  const url = `${baseUrl}/api/imdb/top-rated?type=tv&pages=3&limit=80&minVotes=5000`;

  let res;
  try {
    res = await fetch(url, {
      next: { revalidate },
    });
  } catch (networkErr) {
    console.error(
      "Error de red al llamar a /api/imdb/top-rated (tv):",
      networkErr?.message,
    );
    return [];
  }

  if (!res.ok) {
    console.error("Error al llamar a /api/imdb/top-rated (tv):", res.status);
    return [];
  }

  const json = await res.json();

  if (Array.isArray(json)) return json;
  if (Array.isArray(json.results)) return json.results;
  if (Array.isArray(json.items)) return json.items;

  return [];
}

/* ======== Curado de listas tipo Netflix/Prime ======== */
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

/* ======== Carga de datos CRÍTICOS en el SERVIDOR para series ======== */
async function getCriticalDashboardData() {
  const lang = "es-ES";

  try {
    const [popular, topImdbRaw, topES] = await Promise.all([
      fetchPopularMedia({ type: "tv", language: lang }),
      fetchTopRatedImdbTvServer(),
      fetchTrendingTVDay(),
    ]);

    const curatedPopular = curateList(popular, {
      minVotes: 1200,
      minRating: 6.3,
      minSize: 30,
      maxSize: 80,
    });

    const curatedTopIMDb = curateList(topImdbRaw, {
      minVotes: 8000,
      minRating: 7.4,
      minSize: 30,
      maxSize: 80,
    });

    const curatedTopES = (topES || []).slice(0, 10);

    return {
      popular: curatedPopular,
      top_imdb: curatedTopIMDb,
      "Top 10 hoy en España": curatedTopES,
    };
  } catch (err) {
    console.error("Error cargando datos críticos de series (SSR):", err);
    return {
      popular: [],
      top_imdb: [],
      "Top 10 hoy en España": [],
    };
  }
}

/* =================== Componente de servidor =================== */
export default async function SeriesPage() {
  const initialData = await getCriticalDashboardData();

  return (
    <SeriesPageClient
      initialData={initialData}
    />
  );
}
