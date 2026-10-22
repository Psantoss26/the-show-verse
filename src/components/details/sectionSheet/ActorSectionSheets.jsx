"use client";

// Vistas laterales de las secciones de la ficha de una persona (ActorDetails):
// al pulsar el título de una sección se abre su contenido COMPLETO en una
// lista, como en DetailsClient (DetailsSectionSheets), con el acento verde de
// la ficha del actor.
//
// Qué sección está abierta vive en un `valueStore`, no en el estado de la
// ficha: abrir o cerrar un panel solo re-renderiza este anfitrión.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  CheckCircle2,
  Clapperboard,
  ExternalLink,
  Film,
  SlidersHorizontal,
  Images,
  Star,
  Tags,
  Trophy,
  Tv as TvIcon,
} from "lucide-react";
import OptimizedImage from "@/components/OptimizedImage";
import MobileFiltersPanel from "@/components/ui/MobileFiltersPanel";
import SectionSheet, { SHEET_CONTROL, SectionSheetEmpty } from "./SectionSheet";
import { TitleRow } from "./SectionSheetRows";
import FilmographySheet from "./FilmographySheet";
import { AwardRow } from "@/components/details/AwardCard";
import {
  CreditsFilterDropdowns,
  YearFilterDropdown,
} from "@/components/details/CreditFilterControls";
import useImdbScoreLoader from "@/hooks/useImdbScoreLoader";
import { getScoreItemKey, readScoreCache } from "@/lib/userLists/listScoreCache";

const SECTIONS = {
  popular: { title: "Conocido por", icon: Star },
  watched: { title: "Títulos vistos", icon: CheckCircle2 },
  movies: { title: "Películas", icon: Film },
  series: { title: "Series", icon: TvIcon },
  awards: { title: "Premios", icon: Trophy },
  photos: { title: "Fotos", icon: Images },
  tagged: { title: "Apariciones en medios", icon: Tags },
  // No es una sección de la ficha: la abre su botón de acción de filmografía.
  filmography: { title: "Filmografía", icon: Clapperboard },
};

const ACCENT = "emerald";

function plural(count, one, many) {
  return `${Number(count).toLocaleString("es-ES")} ${count === 1 ? one : many}`;
}

function matches(query, ...values) {
  if (!query) return true;
  const needle = query.toLocaleLowerCase("es-ES");
  return values.some((value) => String(value || "").toLocaleLowerCase("es-ES").includes(needle));
}

// Papel de la persona en el título: «como Walter White» o su trabajo.
function creditRole(item) {
  if (item?.subtitle) return item.subtitle;
  if (item?.character) return `como ${item.character}`;
  return item?.job || null;
}

const serverSnapshot = () => null;

/** Abre (`id`) o cierra (`null`) la vista lateral de una sección. */
export function openActorSectionSheet(store, id) {
  store?.set(SECTIONS[id] ? id : null);
}

export default function ActorSectionSheets({ store, data }) {
  const openId = useSyncExternalStore(store.subscribe, store.get, serverSnapshot);
  const close = () => store.set(null);
  if (!openId || !SECTIONS[openId]) return null;
  // `key`: cada apertura empieza con su pestaña y su búsqueda limpias.
  return <SheetContent key={openId} id={openId} data={data} onClose={close} />;
}

function SheetContent({ id, data, onClose }) {
  const meta = SECTIONS[id];
  const [tab, setTab] = useState(null);
  const [query, setQuery] = useState("");
  const props = { meta, data, onClose, tab, setTab, query, setQuery };
  if (id === "filmography") return <FilmographySheet {...props} />;
  if (id === "awards") return <AwardsSheet {...props} />;
  if (id === "photos") return <PhotosSheet {...props} />;
  if (id === "tagged") return <TaggedSheet {...props} />;
  if (id === "movies" || id === "series") {
    return <CreditsSheet {...props} items={data[id]} rawItems={data[`${id}Raw`]} />;
  }
  return <TitlesSheet {...props} items={data[id]} />;
}

// Notas de IMDb de los títulos del panel, POR TRAMOS según se ven: Películas
// y Series pueden pasar del centenar y pedirlas todas al abrir era una ráfaga
// de peticiones para filas que quizá nunca se ven. Se piden las de las
// primeras IMDB_SHEET_STEP filas de lo que se muestra (con la búsqueda y la
// pestaña aplicadas) y, al acercarse al final de lo pedido con el scroll, las
// siguientes. Solo se amplía con la carga anterior terminada: cambiar la
// lista a mitad cancela la carga del cargador y la empezaba de nuevo. Las ya
// conocidas salen al momento de la caché compartida de notas.
const IMDB_SHEET_STEP = 12;
// Fila (contando desde el final de lo pedido) cuya llegada a la vista pide el
// siguiente tramo.
const IMDB_SHEET_LOOKAHEAD = 4;

function useSheetImdbScores(shownItems) {
  const [limit, setLimit] = useState(IMDB_SHEET_STEP);
  const requested = useMemo(() => shownItems.slice(0, limit), [shownItems, limit]);
  const [imdbScores, setImdbScores] = useState(() => readScoreCache("imdb"));
  const [imdbLoading, setImdbLoading] = useState(true);
  useImdbScoreLoader({
    items: requested,
    enabled: requested.length > 0,
    frozen: false,
    setImdbScores,
    setLoading: setImdbLoading,
    batchSize: IMDB_SHEET_STEP,
    parallelBatches: 1,
  });
  // La fila del aviso, visible o no (la marca TitleList).
  const [triggerVisible, setTriggerVisible] = useState(false);
  const more = limit < shownItems.length;
  useEffect(() => {
    if (triggerVisible && more && !imdbLoading) {
      setLimit((current) => current + IMDB_SHEET_STEP);
    }
  }, [triggerVisible, more, imdbLoading]);
  return {
    imdbScores,
    imdbLoading,
    requestedCount: Math.min(limit, shownItems.length),
    triggerIndex: more ? Math.max(0, limit - IMDB_SHEET_LOOKAHEAD) : -1,
    onTriggerVisible: setTriggerVisible,
  };
}

function TitleList({
  items,
  onClose,
  imdbScores,
  imdbLoading,
  requestedCount,
  triggerIndex,
  onTriggerVisible,
}) {
  const triggerRef = useRef(null);
  useEffect(() => {
    const el = triggerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      onTriggerVisible(false);
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => onTriggerVisible(entry.isIntersecting),
      // El panel se desplaza por dentro (`.details-sheet-scroll`).
      { root: el.closest(".details-sheet-scroll"), rootMargin: "0px 0px 200px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [triggerIndex, onTriggerVisible]);

  return (
    <ul className="space-y-2">
      {items.map((item, index) => {
        const scoreKey = getScoreItemKey(item);
        // Aún sin pedir: «…», no «—» (sin nota).
        const pending = index >= requestedCount || imdbLoading;
        return (
          <li
            key={`${item.media_type || "movie"}-${item.id}-${item.credit_id || index}`}
            ref={index === triggerIndex ? triggerRef : undefined}
          >
            <TitleRow
              item={item}
              mediaType={item.media_type}
              onNavigate={onClose}
              detail={creditRole(item)}
              showImdb
              imdbRating={imdbScores.get(scoreKey)}
              imdbLoading={pending && !imdbScores.has(scoreKey)}
            />
          </li>
        );
      })}
    </ul>
  );
}

// ─── Conocido por / Títulos vistos ────────────────────────────────────────

function TitlesSheet({ meta, items: rawItems, onClose, query, setQuery }) {
  const items = useMemo(() => (Array.isArray(rawItems) ? rawItems : []), [rawItems]);
  const filtered = useMemo(
    () => items.filter((item) => matches(query, item.title, item.name, creditRole(item))),
    [items, query],
  );
  const scores = useSheetImdbScores(filtered);
  return (
    <SectionSheet
      open
      accent={ACCENT}
      onClose={onClose}
      title={meta.title}
      icon={meta.icon}
      subtitle={plural(items.length, "título", "títulos")}
      search={items.length > 8 ? { value: query, onChange: setQuery, placeholder: "Buscar título o papel…" } : null}
    >
      {filtered.length ? (
        <TitleList items={filtered} onClose={onClose} {...scores} />
      ) : (
        <SectionSheetEmpty>{query ? "Ningún título coincide." : "No hay títulos."}</SectionSheetEmpty>
      )}
    </SectionSheet>
  );
}

// ─── Películas / Series ───────────────────────────────────────────────────

// Menús de los filtros por encima del panel (z-[10000]).
const SHEET_MENU_Z = 10050;

function CreditsSheet({ meta, data, items: dedupedItems, rawItems, onClose, tab, setTab, query, setQuery }) {
  const items = useMemo(() => (Array.isArray(dedupedItems) ? dedupedItems : []), [dedupedItems]);
  const raw = useMemo(() => (Array.isArray(rawItems) ? rawItems : []), [rawItems]);
  const actingCount = items.filter((item) => item.kind === "acting").length;
  const crewCount = items.filter((item) => item.kind === "crew").length;
  const tabs =
    actingCount && crewCount
      ? [
          { id: "all", label: "Todos", count: items.length },
          { id: "acting", label: "Actuación", count: actingCount },
          { id: "crew", label: "Equipo", count: crewCount },
        ]
      : null;
  const activeTab = tabs ? tab || "all" : "all";
  // Los mismos filtros que la sección de la ficha (orden y años; el rol son
  // las pestañas), con su misma lógica (`data.filterCredits`).
  const [sort, setSort] = useState("date_desc");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const yearOptions = useMemo(() => {
    const set = new Set(raw.map((c) => c.year).filter((y) => y > 0));
    return Array.from(set)
      .sort((a, b) => b - a)
      .map((y) => ({ value: String(y), label: String(y) }));
  }, [raw]);
  const filtered = useMemo(
    () =>
      data.filterCredits
        ? data.filterCredits(raw, { q: query, creditFilter: activeTab, sort, yearFrom, yearTo })
        : items,
    [data, raw, items, query, activeTab, sort, yearFrom, yearTo],
  );
  const filtersChanged = sort !== "date_desc" || yearFrom || yearTo;
  // Los filtros se despliegan con el botón junto al buscador, como en la
  // sección de la ficha.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const scores = useSheetImdbScores(filtered);
  return (
    <SectionSheet
      open
      accent={ACCENT}
      onClose={onClose}
      title={meta.title}
      icon={meta.icon}
      subtitle={`${filtered.length} de ${plural(items.length, "título", "títulos")}`}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setTab}
      search={{ value: query, onChange: setQuery, placeholder: "Buscar título o papel…" }}
      searchAccessory={
        <button
          type="button"
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
          aria-label="Filtros y ajustes"
          title="Filtros y ajustes"
          className={`relative flex h-11 w-11 shrink-0 items-center justify-center transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ${SHEET_CONTROL} ${
            filtersOpen
              ? "text-emerald-400 !shadow-[0_0_15px_rgba(16,185,129,0.3)]"
              : "text-zinc-200 hover:from-white/15 hover:to-white/10 hover:text-white"
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          {/* Filtros cambiados: un punto, también con el desplegable cerrado. */}
          {filtersChanged ? (
            <span
              aria-hidden="true"
              className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]"
            />
          ) : null}
        </button>
      }
      toolbar={
        <MobileFiltersPanel open={filtersOpen} gapClassName="pt-3">
        {/* Ordenar · Desde · Hasta en UNA fila: cada botón parte del ancho
            de su contenido y reparte el sobrante (o encoge) según el ancho
            del panel (`@container`, ver `compact` en InlineDropdown). */}
        <div className="@container flex gap-2">
          <CreditsFilterDropdowns
            showRole={false}
            sort={sort}
            setSort={setSort}
            menuZIndex={SHEET_MENU_Z}
            compact
          />
          <YearFilterDropdown
            label="Desde"
            value={yearFrom}
            setValue={setYearFrom}
            options={yearOptions}
            menuZIndex={SHEET_MENU_Z}
            compact
            compactIcon="wide"
          />
          <YearFilterDropdown
            label="Hasta"
            value={yearTo}
            setValue={setYearTo}
            options={yearOptions}
            menuZIndex={SHEET_MENU_Z}
            compact
            compactIcon="wide"
          />
        </div>
        </MobileFiltersPanel>
      }
    >
      {filtered.length ? (
        <TitleList items={filtered} onClose={onClose} {...scores} />
      ) : (
        <div className="space-y-3">
          <SectionSheetEmpty>{query || filtersChanged ? "Ningún título coincide." : "No hay créditos."}</SectionSheetEmpty>
          {filtersChanged ? (
            <button
              type="button"
              onClick={() => {
                setSort("date_desc");
                setYearFrom("");
                setYearTo("");
              }}
              className="mx-auto block text-sm font-bold text-emerald-400 hover:underline"
            >
              Limpiar filtros
            </button>
          ) : null}
        </div>
      )}
    </SectionSheet>
  );
}

// ─── Premios ──────────────────────────────────────────────────────────────

function AwardsSheet({ meta, data, onClose, tab, setTab }) {
  const items = Array.isArray(data.awards) ? data.awards : [];
  const winners = items.filter((item) => item?.result === "winner");
  const nominees = items.filter((item) => item?.result === "nominee");
  const tabs =
    winners.length && nominees.length
      ? [
          { id: "all", label: "Todos", count: items.length },
          { id: "winner", label: "Ganados", count: winners.length },
          { id: "nominee", label: "Nominaciones", count: nominees.length },
        ]
      : null;
  const activeTab = tab || "all";
  const visible = activeTab === "winner" ? winners : activeTab === "nominee" ? nominees : items;
  return (
    <SectionSheet
      open
      accent={ACCENT}
      onClose={onClose}
      title={meta.title}
      icon={meta.icon}
      subtitle={`${plural(winners.length, "premio", "premios")} · ${plural(nominees.length, "nominación", "nominaciones")}`}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setTab}
    >
      {visible.length ? (
        <ul className="space-y-2">
          {visible.map((item) => (
            <li key={item.id}>
              <AwardRow item={item} />
            </li>
          ))}
        </ul>
      ) : (
        <SectionSheetEmpty>No hay premios públicos registrados.</SectionSheetEmpty>
      )}
    </SectionSheet>
  );
}

// ─── Fotos y apariciones en medios ────────────────────────────────────────

const IMAGE_LINK =
  "group/img relative block overflow-hidden rounded-xl bg-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400";

function PhotosSheet({ meta, data, onClose }) {
  const photos = Array.isArray(data.photos) ? data.photos : [];
  return (
    <SectionSheet
      open
      accent={ACCENT}
      onClose={onClose}
      title={meta.title}
      icon={meta.icon}
      subtitle={plural(photos.length, "imagen", "imágenes")}
    >
      {photos.length ? (
        <ul className="grid grid-cols-3 gap-2.5 sm:gap-3">
          {photos.map((image) => (
            <li key={image.file_path}>
              <a
                href={`https://image.tmdb.org/t/p/original${image.file_path}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Abrir imagen original${imageResolution(image) ? ` (${imageResolution(image)})` : ""}`}
                className={IMAGE_LINK}
              >
                <span className="block aspect-[2/3]">
                  <OptimizedImage
                    src={`https://image.tmdb.org/t/p/w342${image.file_path}`}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-500 group-hover/img:scale-[1.03]"
                    loading="lazy"
                    decoding="async"
                  />
                </span>
                {/* Resolución del original, como en «Portadas y fondos» de la ficha. */}
                {imageResolution(image) ? (
                  <span className="absolute bottom-1.5 left-1.5 right-1.5 truncate text-right text-[10px] font-bold text-zinc-200">
                    <span className="rounded-md bg-black/65 px-1.5 py-0.5">{imageResolution(image)}</span>
                  </span>
                ) : null}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <SectionSheetEmpty>No hay fotos.</SectionSheetEmpty>
      )}
    </SectionSheet>
  );
}

function imageResolution(image) {
  return image?.width && image?.height ? `${image.width}×${image.height}` : null;
}

// Proporción real de cada imagen: en el panel tampoco se recortan.
function imageAspect(image) {
  const ratio = Number(image?.aspect_ratio);
  if (Number.isFinite(ratio) && ratio > 0) return ratio;
  const width = Number(image?.width);
  const height = Number(image?.height);
  return width > 0 && height > 0 ? width / height : 16 / 9;
}

function TaggedSheet({ meta, data, onClose }) {
  const images = useMemo(() => (Array.isArray(data.tagged) ? data.tagged : []), [data.tagged]);
  return (
    <SectionSheet
      open
      accent={ACCENT}
      onClose={onClose}
      title={meta.title}
      icon={meta.icon}
      subtitle={plural(images.length, "imagen", "imágenes")}
    >
      {images.length ? (
        // Dos columnas tipo mosaico: cada imagen con su proporción, sin recortes.
        <ul className="columns-2 gap-2.5 sm:gap-3">
          {images.map((image) => {
            const title = image?.media?.title || image?.media?.name || "";
            return (
              <li key={image.file_path} className="mb-2.5 break-inside-avoid sm:mb-3">
                <a
                  href={`https://image.tmdb.org/t/p/original${image.file_path}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={title ? `Abrir imagen de ${title}` : "Abrir imagen original"}
                  className={IMAGE_LINK}
                >
                  <span className="block" style={{ aspectRatio: imageAspect(image) }}>
                    <OptimizedImage
                      src={`https://image.tmdb.org/t/p/w500${image.file_path}`}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-500 group-hover/img:scale-[1.03]"
                      loading="lazy"
                      decoding="async"
                    />
                  </span>
                  <span className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white/85 backdrop-blur-sm">
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </a>
                {title ? (
                  <p className="mt-1.5 line-clamp-1 px-0.5 text-xs font-bold text-zinc-300">{title}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <SectionSheetEmpty>No hay imágenes.</SectionSheetEmpty>
      )}
    </SectionSheet>
  );
}
