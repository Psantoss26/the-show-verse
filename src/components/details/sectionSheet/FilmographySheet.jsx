"use client";

// Vista lateral «Filmografía» de la ficha de una persona (ActorDetails): todo
// lo que ha hecho, por departamento y año, en forma de CAMINO (como la
// filmografía de TMDb): una línea vertical con un hito por año, primero lo
// que aún no tiene fecha y después del más reciente al más antiguo. Cada
// título lleva su póster, tipo, episodios y papel, y un círculo que marca si
// el visitante ya lo ha visto. Se abre con el botón de acción de filmografía.
// El rol (departamento) y el tipo de título se eligen en la hoja de ajustes
// (MobileOptionsSheet), que abre el botón junto al buscador.

import { useMemo, useState } from "react";
import Link from "next/link";
import { Briefcase, Check, Film, ImageOff, Layers3, RotateCcw, SlidersHorizontal, Tv as TvIcon } from "lucide-react";
import OptimizedImage from "@/components/OptimizedImage";
import MobileOptionsSheet, { SheetAction, SheetOption, SheetOptionGroup } from "@/components/ui/MobileOptionsSheet";
import SectionSheet, { SHEET_CONTROL, SectionSheetEmpty } from "./SectionSheet";
import { buildFilmography, filmographyRoleLabel } from "@/lib/actor/filmography";
import { careerRange } from "@/lib/actor/careerRange";

const MEDIA_OPTIONS = [
  { id: "all", label: "Todo" },
  { id: "movie", label: "Películas" },
  { id: "tv", label: "Series" },
];

function plural(count, one, many) {
  return `${Number(count).toLocaleString("es-ES")} ${count === 1 ? one : many}`;
}

function FilmographyRow({ item, department, watched, onNavigate }) {
  const isTv = item.media_type === "tv";
  const role = filmographyRoleLabel(item, department);
  const MediaIcon = isTv ? TvIcon : Film;
  const poster = item.poster_path ? `https://image.tmdb.org/t/p/w185${item.poster_path}` : null;
  return (
    <Link
      href={`/details/${item.media_type}/${item.id}`}
      onClick={onNavigate}
      className="group/row flex items-center gap-3 rounded-2xl p-2 transition-colors hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
    >
      {/* 56px de ancho y esquinas apenas redondeadas: el póster se ve entero. */}
      <span className="flex aspect-[2/3] w-14 shrink-0 items-center justify-center overflow-hidden rounded-[5px] bg-zinc-900 shadow-md">
        {poster ? (
          <OptimizedImage
            src={poster}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 group-hover/row:scale-105"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <ImageOff className="h-4 w-4 text-zinc-600" aria-hidden="true" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block line-clamp-2 text-sm font-bold leading-tight text-white">{item.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-zinc-400">
          <span className="inline-flex items-center gap-1 font-semibold text-zinc-300">
            <MediaIcon className="h-3 w-3 text-emerald-400" aria-hidden="true" />
            {isTv ? "Serie" : "Película"}
          </span>
          {item.episodes > 0 ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{plural(item.episodes, "episodio", "episodios")}</span>
            </>
          ) : null}
        </span>
        {role ? <span className="mt-0.5 block line-clamp-2 text-xs text-zinc-400">{role}</span> : null}
      </span>
      {/* El círculo de TMDb: relleno si el visitante ya lo ha visto. */}
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
          watched
            ? "bg-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.45)]"
            : "ring-2 ring-inset ring-white/20"
        }`}
        title={watched ? "Visto" : "Sin ver"}
      >
        {watched ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" /> : null}
        <span className="sr-only">{watched ? "Visto" : "Sin ver"}</span>
      </span>
    </Link>
  );
}

export default function FilmographySheet({ meta, data, onClose, tab, setTab, query, setQuery }) {
  const [media, setMedia] = useState("all");
  const credits = data.filmography;
  // Lo que ha visto el visitante (la sección «Títulos vistos» de la ficha).
  const watchedKeys = useMemo(
    () =>
      new Set(
        (Array.isArray(data.watched) ? data.watched : []).map(
          (item) => `${item.media_type === "tv" ? "tv" : "movie"}-${item.id}`,
        ),
      ),
    [data.watched],
  );
  // Pestañas y recuentos con todo; la lista, con el tipo y la búsqueda.
  // Con el nacimiento: lo fechado antes (galas, programas con décadas de
  // emisión) no marca hitos de años en los que la persona no había nacido.
  const birthday = data.birthday || null;
  const allDepartments = useMemo(() => buildFilmography(credits, { birthday }), [credits, birthday]);
  const mediaCounts = useMemo(() => {
    const keys = { movie: new Set(), tv: new Set() };
    allDepartments.forEach((department) =>
      department.years.forEach((group) =>
        group.items.forEach((item) => keys[item.media_type]?.add(item.key)),
      ),
    );
    return { all: keys.movie.size + keys.tv.size, movie: keys.movie.size, tv: keys.tv.size };
  }, [allDepartments]);
  const departments = useMemo(
    () => buildFilmography(credits, { media, query, birthday }),
    [credits, media, query, birthday],
  );
  const activeKey = allDepartments.some((department) => department.key === tab)
    ? tab
    : allDepartments[0]?.key;
  const current = departments.find((department) => department.key === activeKey) || null;

  const [filtersOpen, setFiltersOpen] = useState(false);
  // Fuera de lo de partida (el primer rol y todos los tipos): un punto en el
  // botón, también con la hoja cerrada.
  const defaultKey = allDepartments[0]?.key;
  const filtersChanged = (activeKey && activeKey !== defaultKey) || media !== "all";
  const showMedia = mediaCounts.movie > 0 && mediaCounts.tv > 0;
  const showRoles = allDepartments.length > 1;

  // El mismo rango que la trayectoria de la ficha (careerRange.js).
  const range = useMemo(
    () =>
      careerRange(
        allDepartments.flatMap((department) =>
          department.years.flatMap((group) => group.items.map((item) => ({ year: item.year }))),
        ),
        birthday,
      ),
    [allDepartments, birthday],
  );
  const span = range ? (range.start === range.end ? String(range.start) : `${range.start}–${range.end}`) : null;

  return (
    <>
      <SectionSheet
        open
        accent="emerald"
        onClose={onClose}
        title={meta.title}
        icon={meta.icon}
        // Sin pestañas: el rol elegido va en el subtítulo.
        subtitle={[
          showRoles ? current?.label || allDepartments.find((d) => d.key === activeKey)?.label : null,
          plural(mediaCounts.all, "título", "títulos"),
          span,
        ]
          .filter(Boolean)
          .join(" · ")}
        search={{ value: query, onChange: setQuery, placeholder: "Buscar título o papel…" }}
        searchAccessory={
          showRoles || showMedia ? (
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={filtersOpen}
              aria-label="Ajustes: rol y tipo de título"
              title="Rol y tipo de título"
              className={`relative flex h-11 w-11 shrink-0 items-center justify-center transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ${SHEET_CONTROL} ${
                filtersOpen
                  ? "text-emerald-400 !shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                  : "text-zinc-200 hover:from-white/15 hover:to-white/10 hover:text-white"
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              {filtersChanged ? (
                <span
                  aria-hidden="true"
                  className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]"
                />
              ) : null}
            </button>
          ) : null
        }
      >
        {current ? (
          // Cerca del borde izquierdo, con algo de aire: en móvil el relleno
          // del panel (20px hasta el año); en escritorio, 4px menos que él.
          <ol className="pt-3 sm:-ml-1" aria-label={`Filmografía: ${current.label}`}>
            {current.years.map((group) => (
              <li
                key={group.year ?? group.undated}
                // Columna del año justa para «2028» y poco hueco hasta la línea.
                className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2.5"
              >
                {/* Año, a la altura de su hito: el centro del póster de la
                    primera fila (8px de relleno + 42px, medio póster de 84px),
                    descontando la mitad de su línea de texto. */}
                <div className="pt-[38px] text-right">
                  <span className="text-sm font-black tabular-nums leading-none text-white">
                    {group.year ?? "—"}
                  </span>
                  {group.year == null ? (
                    <span className="sr-only">
                      {group.undated === "unknown" ? "Fecha de la aparición desconocida" : "Sin fecha"}
                    </span>
                  ) : null}
                </div>
                {/* El camino: una línea continua (el borde de cada año, sin
                    huecos entre ellos) con un hito por año. */}
                <div className="relative border-l border-white/10 pb-4 pl-3">
                  <span
                    aria-hidden="true"
                    className={`absolute -left-[5px] top-[46px] h-[9px] w-[9px] rounded-full ${
                      group.year == null
                        ? "bg-zinc-500 ring-4 ring-zinc-500/15"
                        : "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.6)] ring-4 ring-emerald-400/15"
                    }`}
                  />
                  <ul className="space-y-0.5">
                    {group.items.map((item) => (
                      <li key={item.key}>
                        <FilmographyRow
                          item={item}
                          department={current.key}
                          watched={watchedKeys.has(item.key)}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <SectionSheetEmpty>
            {query || media !== "all" ? "Ningún título coincide." : "No hay créditos."}
          </SectionSheetEmpty>
        )}
      </SectionSheet>
      <MobileOptionsSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Ajustes"
        subtitle={meta.title}
        accent="emerald"
        placement="sectionSheet"
      >
        {showRoles ? (
          <SheetOptionGroup label="Rol" icon={Briefcase}>
            {allDepartments.map((department) => (
              <SheetOption
                key={department.key}
                active={department.key === activeKey}
                onClick={() => setTab(department.key)}
              >
                {department.label} · {department.count}
              </SheetOption>
            ))}
          </SheetOptionGroup>
        ) : null}
        {showMedia ? (
          <SheetOptionGroup label="Tipo de título" icon={Layers3}>
            {MEDIA_OPTIONS.map((option) => (
              <SheetOption
                key={option.id}
                icon={option.id === "movie" ? Film : option.id === "tv" ? TvIcon : null}
                active={media === option.id}
                onClick={() => setMedia(option.id)}
              >
                {option.label} · {mediaCounts[option.id]}
              </SheetOption>
            ))}
          </SheetOptionGroup>
        ) : null}
        <SheetOptionGroup label="Acciones" layout="stack">
          <SheetAction
            icon={RotateCcw}
            disabled={!filtersChanged}
            onClick={() => {
              setFiltersOpen(false);
              setTab(defaultKey);
              setMedia("all");
            }}
          >
            Limpiar filtros
          </SheetAction>
        </SheetOptionGroup>
      </MobileOptionsSheet>
    </>
  );
}
