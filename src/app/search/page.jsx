// src/app/search/page.jsx
//
// Resultados COMPLETOS de una búsqueda. La barra de búsqueda de la navbar solo
// enseña los primeros resultados; desde ahí («Ver todos los resultados» o
// Enter) se llega a esta página, que pagina los resultados de TMDb de 20 en 20.
//
// Todo el estado vive en la URL (`q`, `type`, `page`): cada página es un enlace
// normal, se puede compartir, y atrás/adelante del navegador funcionan solas.
import Link from "next/link";
import { Clapperboard, Film, FolderKanban, SearchX, Tv, UserRound } from "lucide-react";
import OptimizedImage from "@/components/OptimizedImage";
import { searchTmdb } from "@/lib/api/tmdb";
import SearchUsersResults from "./SearchUsersResults";
import SearchPagination from "./SearchPagination";
import { buildSearchHref } from "@/lib/search/searchPage";

export const dynamic = "force-dynamic";

const SEARCH_TYPES = [
  { id: "all", label: "Todo" },
  { id: "movies", label: "Películas" },
  { id: "series", label: "Series" },
  { id: "people", label: "Personas" },
  { id: "collections", label: "Colecciones" },
  { id: "users", label: "Usuarios" },
];

const TYPE_BADGES = {
  movie: { label: "Película", className: "text-sky-300", Icon: Film },
  tv: { label: "Serie", className: "text-purple-300", Icon: Tv },
  person: { label: "Persona", className: "text-emerald-300", Icon: UserRound },
  collection: { label: "Colección", className: "text-amber-300", Icon: FolderKanban },
};

function readParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

function parseSearchParams(sp) {
  const q = String(readParam(sp?.q) || "").trim();
  const rawType = readParam(sp?.type);
  const type = SEARCH_TYPES.some((t) => t.id === rawType) ? rawType : "all";
  const page = Math.max(1, Math.trunc(Number(readParam(sp?.page)) || 1));
  return { q, type, page };
}

export async function generateMetadata({ searchParams }) {
  const { q } = parseSearchParams(await searchParams);
  return { title: q ? `Resultados de «${q}»` : "Buscar" };
}

function resultHref(item) {
  if (item.media_type === "collection") return `/lists/collection/${item.id}`;
  return `/details/${item.media_type}/${item.id}`;
}

function resultTitle(item) {
  return item.title || item.name || item.original_title || item.original_name || "Sin título";
}

function resultYear(item) {
  const date = item.release_date || item.first_air_date;
  const year = date ? Number(String(date).slice(0, 4)) : NaN;
  return Number.isFinite(year) ? year : null;
}

function ResultCard({ item }) {
  const title = resultTitle(item);
  const imagePath = item.poster_path || item.profile_path;
  const badge = TYPE_BADGES[item.media_type];
  const year = resultYear(item);
  const BadgeIcon = badge?.Icon || Clapperboard;

  return (
    <li>
      <Link
        href={resultHref(item)}
        prefetch={false}
        className="group flex h-full flex-col gap-2 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-400"
      >
        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-white/5 bg-zinc-900 shadow-md">
          {imagePath ? (
            <OptimizedImage
              src={`https://image.tmdb.org/t/p/w342${imagePath}`}
              alt=""
              className="h-full w-full object-cover transition-transform duration-500 ease-out motion-reduce:transition-none lg:group-hover:scale-105"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-zinc-700">
              <BadgeIcon className="h-10 w-10" aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="min-w-0 px-0.5">
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-white transition-colors group-hover:text-amber-200">
            {title}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest">
            {badge && <span className={badge.className}>{badge.label}</span>}
            {year && (
              <>
                <span className="text-zinc-600" aria-hidden="true">
                  ●
                </span>
                <span className="text-zinc-400">{year}</span>
              </>
            )}
          </p>
        </div>
      </Link>
    </li>
  );
}

function EmptyState({ title, text }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[2rem] border border-dashed border-white/10 bg-black/20 p-10 text-center">
      <SearchX className="mb-4 h-10 w-10 text-zinc-500" aria-hidden="true" />
      <h2 className="text-lg font-bold text-zinc-200">{title}</h2>
      {text && <p className="mt-2 max-w-sm text-sm text-zinc-500">{text}</p>}
    </div>
  );
}

export default async function SearchPage({ searchParams }) {
  const { q, type, page } = parseSearchParams(await searchParams);
  const data = q && type !== "users" ? await searchTmdb(type, q, { page }) : null;
  const totalPages = data?.totalPages || 0;

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <div className="mx-auto max-w-[1800px] p-4 lg:p-8">
        <header className="mb-6">
          <div className="mb-2 flex items-center gap-3">
            <div className="h-px w-12 bg-amber-500" />
            <span className="text-xs font-bold uppercase tracking-widest text-amber-400">
              Búsqueda
            </span>
          </div>
          <h1 className="break-words text-3xl font-black tracking-tighter text-white md:text-5xl">
            {q ? <>«{q}»</> : "Buscar"}
          </h1>
          {data && data.totalResults > 0 && (
            <p className="mt-2 text-sm text-zinc-400">
              {data.totalResults.toLocaleString("es-ES")}{" "}
              {data.totalResults === 1 ? "resultado" : "resultados"}
              {totalPages > 1 && ` · página ${Math.min(page, totalPages)} de ${totalPages}`}
            </p>
          )}
        </header>

        {q && (
          <nav aria-label="Tipo de resultado" className="mb-8 overflow-x-auto no-scrollbar">
            <ul className="flex w-max gap-2">
              {SEARCH_TYPES.map((option) => {
                const active = option.id === type;
                return (
                  <li key={option.id}>
                    <Link
                      href={buildSearchHref({ q, type: option.id })}
                      aria-current={active ? "page" : undefined}
                      className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${
                        active
                          ? "bg-white text-black"
                          : "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12] hover:text-white"
                      }`}
                    >
                      {option.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}

        {!q ? (
          <EmptyState
            title="Escribe algo para buscar"
            text="Usa la barra de búsqueda para encontrar películas, series, personas, colecciones o usuarios."
          />
        ) : type === "users" ? (
          <SearchUsersResults query={q} />
        ) : !data ? (
          <EmptyState
            title="No se pudo completar la búsqueda"
            text="El servicio de búsqueda no responde ahora mismo. Inténtalo de nuevo en unos segundos."
          />
        ) : data.results.length === 0 ? (
          <EmptyState
            title="No hay resultados"
            text={
              page > 1 && totalPages > 0
                ? `Esta búsqueda solo tiene ${totalPages} ${totalPages === 1 ? "página" : "páginas"}.`
                : "Prueba con otras palabras o con otro tipo de resultado."
            }
          />
        ) : (
          <>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7">
              {data.results.map((item) => (
                <ResultCard key={`${item.media_type}-${item.id}`} item={item} />
              ))}
            </ul>
            {totalPages > 1 && (
              <SearchPagination
                query={q}
                type={type}
                page={Math.min(page, totalPages)}
                totalPages={totalPages}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
