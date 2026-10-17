"use client";

// Vistas laterales de las secciones de DetailsClient: al pulsar el título de
// una sección se abre su contenido COMPLETO en una lista (SectionSheet).
//
// Qué sección está abierta vive en un `valueStore` (lib/details/valueStore),
// no en el estado de DetailsClient: abrir o cerrar un panel solo re-renderiza
// este anfitrión, no la ficha entera (cada render de la ficha cuesta y a mitad
// de una animación la deja a tirones). Los datos llegan como props desde la
// ficha, que ya los tiene cargados; el equipo técnico y las notas de IMDb de
// recomendaciones se piden aquí al abrir su vista, con caché compartida.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  ArrowUpRight,
  ArrowUpDown,
  ExternalLink,
  Heart,
  Languages,
  Image as ImageIcon,
  Layers,
  ListVideo,
  Loader2,
  MessageSquare,
  MonitorPlay,
  Music2,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import OptimizedImage from "@/components/OptimizedImage";
import { COMMENT_TABS, DEFAULT_COMMENT_TAB, normalizeCommentFilters } from "@/lib/details/commentFilters";
import { tmdbSrcSet } from "@/lib/tmdb/imageSrcSet";
import SectionSheet, { SHEET_CONTROL, SectionSheetEmpty, SectionSheetGroupTitle } from "./SectionSheet";
import { ListRow, PersonRow, TitleRow, TrackRow, VideoRow } from "./SectionSheetRows";
import { AwardRow } from "@/components/details/AwardCard";
import SeasonCard from "@/components/details/SeasonCard";
import TraktCommentCard from "@/components/details/TraktCommentCard";
import { buildCrewGroups, crewRoleLabel } from "@/lib/details/sectionSheetData";
import { DropdownItem, InlineDropdown } from "@/components/details/CreditFilterControls";
import MobileFiltersPanel from "@/components/ui/MobileFiltersPanel";
import useImdbScoreLoader from "@/hooks/useImdbScoreLoader";
import { getScoreItemKey, readScoreCache } from "@/lib/userLists/listScoreCache";

const SECTIONS = {
  cast: { title: "Reparto", icon: Users },
  recs: { title: "Recomendaciones", icon: MonitorPlay },
  collection: { title: "Colección", icon: Layers },
  awards: { title: "Premios", icon: Trophy },
  images: { title: "Portadas y fondos", icon: ImageIcon },
  videos: { title: "Tráiler y vídeos", icon: MonitorPlay },
  soundtrack: { title: "Soundtrack y música", icon: Music2 },
  sentiment: { title: "Análisis de sentimientos", icon: Sparkles },
  seasons: { title: "Temporadas", icon: Layers },
  comments: { title: "Comentarios", icon: MessageSquare },
  lists: { title: "Listas", icon: ListVideo },
};


function plural(count, one, many) {
  return `${Number(count).toLocaleString("es-ES")} ${count === 1 ? one : many}`;
}

function matches(query, ...values) {
  if (!query) return true;
  const needle = query.toLocaleLowerCase("es-ES");
  return values.some((value) => String(value || "").toLocaleLowerCase("es-ES").includes(needle));
}

const serverSnapshot = () => null;

/** Abre (`id`) o cierra (`null`) la vista lateral de una sección. */
export function openSectionSheet(store, id) {
  store?.set(SECTIONS[id] ? id : null);
}

export default function DetailsSectionSheets({ store, data }) {
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
  const props = { data, onClose, tab, setTab, query, setQuery };

  const views = {
    cast: CastSheet,
    recs: RecommendationsSheet,
    collection: CollectionSheet,
    awards: AwardsSheet,
    images: ImagesSheet,
    videos: VideosSheet,
    soundtrack: SoundtrackSheet,
    sentiment: SentimentSheet,
    seasons: SeasonsSheet,
    comments: CommentsSheet,
    lists: ListsSheet,
  };
  const View = views[id];
  return <View meta={meta} {...props} />;
}

// ─── Reparto y equipo ──────────────────────────────────────────────────────

function useCrew({ type, tmdbId, enabled, creators }) {
  const [state, setState] = useState({ loading: false, groups: null, error: false });
  const loaded = state.groups != null;
  useEffect(() => {
    // Solo la primera vez que se abre la pestaña. Depende de `loaded` y no de
    // `loading`: si no, marcar la carga re-ejecutaba el efecto y su limpieza
    // cancelaba la propia petición.
    if (!enabled || loaded) return undefined;
    const key = process.env.NEXT_PUBLIC_TMDB_API_KEY;
    if (!key || !tmdbId) {
      setState({ loading: false, groups: buildCrewGroups([], { creators }), error: true });
      return undefined;
    }
    const controller = new AbortController();
    setState((prev) => ({ ...prev, loading: true }));
    const path = type === "tv" ? `tv/${tmdbId}/aggregate_credits` : `movie/${tmdbId}/credits`;
    fetch(`https://api.themoviedb.org/3/${path}?api_key=${key}&language=es-ES`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setState({ loading: false, groups: buildCrewGroups(json?.crew, { creators }), error: !json }))
      .catch((error) => {
        if (error?.name !== "AbortError") setState({ loading: false, groups: buildCrewGroups([], { creators }), error: true });
      });
    return () => controller.abort();
    // `creators` se lee al cargar: llegan con la ficha, antes de abrir el panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, loaded, tmdbId, type]);
  return state;
}

function CastSheet({ meta, data, onClose, tab, setTab, query, setQuery }) {
  const activeTab = tab || "cast";
  const cast = Array.isArray(data.cast) ? data.cast : [];
  const crew = useCrew({ type: data.type, tmdbId: data.tmdbId, enabled: activeTab === "crew", creators: data.creators });
  const filteredCast = cast.filter((person) => matches(query, person.name, person.character));
  const crewGroups = (crew.groups || [])
    .map((group) => ({
      ...group,
      people: group.people.filter((person) => matches(query, person.name, ...person.jobs.map((job) => job.job))),
    }))
    .filter((group) => group.people.length);

  return (
    <SectionSheet
      open
      onClose={onClose}
      title={meta.title}
      icon={meta.icon}
      subtitle={activeTab === "cast" ? plural(cast.length, "persona", "personas") : "Equipo técnico"}
      tabs={[
        { id: "cast", label: "Reparto", count: cast.length },
        { id: "crew", label: "Equipo" },
      ]}
      activeTab={activeTab}
      onTabChange={setTab}
      search={{ value: query, onChange: setQuery, placeholder: "Buscar nombre, personaje o trabajo…" }}
    >
      {activeTab === "cast" ? (
        filteredCast.length ? (
          <ul className="space-y-2">
            {filteredCast.map((person) => (
              <li key={person.id}>
                <PersonRow
                  person={person}
                  role={person.character}
                  episodes={data.type === "tv" ? person.total_episode_count || null : null}
                  onNavigate={onClose}
                />
              </li>
            ))}
          </ul>
        ) : (
          <SectionSheetEmpty>{query ? "Nadie coincide con la búsqueda." : "No hay reparto disponible."}</SectionSheetEmpty>
        )
      ) : crew.loading || crew.groups == null ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500" aria-label="Cargando equipo" />
        </div>
      ) : crewGroups.length ? (
        crewGroups.map((group) => (
          <section key={group.department} className="mt-7 first:mt-0">
            <SectionSheetGroupTitle title={group.label} count={group.people.length} />
            <ul className="space-y-2">
              {group.people.map((person) => (
                <li key={`${group.department}-${person.id}`}>
                  <PersonRow
                    person={person}
                    role={person.jobs.map((job) => crewRoleLabel(job.job)).join(", ")}
                    episodes={data.type === "tv" ? person.episodes || null : null}
                    onNavigate={onClose}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))
      ) : (
        <SectionSheetEmpty>
          {crew.error ? "No se pudo cargar el equipo." : query ? "Nadie coincide con la búsqueda." : "No hay equipo disponible."}
        </SectionSheetEmpty>
      )}
    </SectionSheet>
  );
}

// ─── Títulos: recomendaciones y colección ─────────────────────────────────

function RecommendationsSheet({ meta, data, onClose, query, setQuery }) {
  const items = useMemo(
    () => (Array.isArray(data.recommendations) ? data.recommendations : []).map((item) => ({
      ...item,
      media_type: item.media_type || data.type,
    })),
    [data.recommendations, data.type],
  );
  const [imdbScores, setImdbScores] = useState(() => readScoreCache("imdb"));
  const [imdbLoading, setImdbLoading] = useState(true);
  useImdbScoreLoader({
    items,
    enabled: true,
    frozen: false,
    setImdbScores,
    setLoading: setImdbLoading,
    batchSize: 6,
    parallelBatches: 2,
  });
  const filtered = items.filter((item) => matches(query, item.title, item.name));
  return (
    <SectionSheet
      open
      onClose={onClose}
      title={meta.title}
      icon={meta.icon}
      subtitle={plural(items.length, "título", "títulos")}
      search={items.length > 8 ? { value: query, onChange: setQuery, placeholder: "Buscar título…" } : null}
    >
      {filtered.length ? (
        <ul className="space-y-2">
          {filtered.map((item) => (
            <li key={`${item.media_type || data.type}-${item.id}`}>
              <TitleRow
                item={item}
                mediaType={item.media_type}
                onNavigate={onClose}
                onOpenTitle={data.onOpenTitle}
                showImdb
                imdbRating={imdbScores.get(getScoreItemKey(item))}
                imdbLoading={imdbLoading && !imdbScores.has(getScoreItemKey(item))}
              />
            </li>
          ))}
        </ul>
      ) : (
        <SectionSheetEmpty>{query ? "Ningún título coincide." : "No hay recomendaciones."}</SectionSheetEmpty>
      )}
    </SectionSheet>
  );
}

function CollectionSheet({ meta, data, onClose }) {
  const collection = data.collection || {};
  const items = useMemo(
    () => (Array.isArray(collection.items) ? collection.items : []).map((item) => ({
      ...item,
      media_type: "movie",
    })),
    [collection.items],
  );
  const [imdbScores, setImdbScores] = useState(() => readScoreCache("imdb"));
  const [imdbLoading, setImdbLoading] = useState(true);
  useImdbScoreLoader({
    items,
    enabled: true,
    frozen: false,
    setImdbScores,
    setLoading: setImdbLoading,
    batchSize: 6,
    parallelBatches: 2,
  });
  return (
    <SectionSheet
      open
      onClose={onClose}
      title={collection.name || meta.title}
      icon={meta.icon}
      subtitle={plural(items.length, "película", "películas")}
      headerAction={
        collection.id ? (
          // El mismo botón que el de cerrar del panel (SectionSheet): mismo
          // círculo, fondo y estados; el nombre va de tooltip.
          <Link
            href={`/lists/collection/${collection.id}`}
            onClick={onClose}
            aria-label="Abrir colección completa"
            title="Abrir colección"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400"
          >
            <ArrowUpRight className="h-5 w-5" aria-hidden="true" />
          </Link>
        ) : null
      }
    >
      {items.length ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <TitleRow
                item={item}
                mediaType="movie"
                onNavigate={onClose}
                onOpenTitle={data.onOpenTitle}
                showImdb
                imdbRating={imdbScores.get(getScoreItemKey(item))}
                imdbLoading={imdbLoading && !imdbScores.has(getScoreItemKey(item))}
              />
            </li>
          ))}
        </ul>
      ) : (
        <SectionSheetEmpty>No hay películas en la colección.</SectionSheetEmpty>
      )}
    </SectionSheet>
  );
}

// ─── Premios ───────────────────────────────────────────────────────────────

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
        <SectionSheetEmpty>No hay premios registrados.</SectionSheetEmpty>
      )}
    </SectionSheet>
  );
}

// ─── Portadas y fondos ────────────────────────────────────────────────────

// Orden y filtro de idioma de «Portadas y fondos».
const IMAGE_SORTS = [
  { id: "default", label: "Por defecto" },
  { id: "res_desc", label: "Mayor resolución" },
  { id: "res_asc", label: "Menor resolución" },
];
// Imágenes sin idioma (sin texto): TMDb las marca con null, "" o "xx".
const NO_LANGUAGE = "none";
const imageLanguage = (image) => {
  const code = String(image?.iso_639_1 || "").toLowerCase();
  return code && code !== "xx" ? code : NO_LANGUAGE;
};
const imagePixels = (image) => (Number(image?.width) || 0) * (Number(image?.height) || 0);
let languageNames = null;
function languageLabel(code) {
  if (code === NO_LANGUAGE) return "Sin idioma";
  try {
    languageNames ??= new Intl.DisplayNames(["es"], { type: "language" });
    const name = languageNames.of(code);
    return name ? name.charAt(0).toLocaleUpperCase("es-ES") + name.slice(1) : code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}
// Menús por encima del panel (z-[10000]).
const SHEET_MENU_Z = 10050;

function ImagesSheet({ meta, data, onClose, tab, setTab }) {
  // Pestañas ya calculadas por la ficha (lib/details/artworkSheetTabs): las
  // mismas que su galería, con la imagen elegida primero.
  const tabs = Array.isArray(data.images?.tabs) ? data.images.tabs : [];
  const onSelect = data.images?.onSelect;
  const onReset = data.images?.onReset;
  const current = tabs.find((item) => item.id === tab) || tabs[0] || null;
  const currentImages = current?.images;
  const tabImages = useMemo(() => currentImages || [], [currentImages]);
  const isPoster = current?.aspect === "poster";
  const isLogo = current?.aspect === "logo";
  const total = tabs.reduce((sum, item) => sum + item.count, 0);
  // Orden por resolución y filtro por idioma. El idioma depende de la
  // pestaña: al cambiarla vuelve a «Todos».
  const [sort, setSort] = useState("default");
  const [language, setLanguage] = useState("all");
  const languages = useMemo(() => {
    const counts = new Map();
    tabImages.forEach((image) => {
      const code = imageLanguage(image);
      counts.set(code, (counts.get(code) || 0) + 1);
    });
    // Sin idioma primero; luego por número de imágenes.
    return [...counts.entries()]
      .sort(([a, na], [b, nb]) => (a === NO_LANGUAGE ? -1 : b === NO_LANGUAGE ? 1 : nb - na))
      .map(([code, count]) => ({ code, count, label: languageLabel(code) }));
  }, [tabImages]);
  const images = useMemo(() => {
    const filtered =
      language === "all" ? tabImages : tabImages.filter((image) => imageLanguage(image) === language);
    if (sort === "default") return filtered;
    const direction = sort === "res_asc" ? 1 : -1;
    return [...filtered].sort((a, b) => direction * (imagePixels(a) - imagePixels(b)));
  }, [tabImages, language, sort]);
  const changeTab = (id) => {
    setLanguage("all");
    setTab(id);
  };
  // Los filtros se despliegan con su botón, junto a las pestañas.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersChanged = sort !== "default" || language !== "all";
  const filtersToggle =
    tabImages.length > 1 ? (
      // La misma pastilla que la barra de pestañas (SectionSheet).
      <div className={`flex shrink-0 p-1 ${SHEET_CONTROL}`}>
        <button
          type="button"
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
          aria-label="Filtros: ordenar e idioma"
          title="Ordenar y filtrar por idioma"
          className={`relative flex min-h-9 w-9 items-center justify-center rounded-xl transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-yellow-400 ${
            filtersOpen ? "bg-white/15 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white"
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          {/* Filtros cambiados: un punto, también cerrado. */}
          {filtersChanged ? (
            <span
              aria-hidden="true"
              className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.9)]"
            />
          ) : null}
        </button>
      </div>
    ) : null;
  const sortLabel = IMAGE_SORTS.find((item) => item.id === sort)?.label || IMAGE_SORTS[0].label;
  const languageValue = language === "all" ? "Todos" : languageLabel(language);
  return (
    <SectionSheet
      open
      onClose={onClose}
      title={meta.title}
      icon={meta.icon}
      subtitle={
        language === "all"
          ? plural(total, "imagen", "imágenes")
          : `${images.length} de ${plural(tabImages.length, "imagen", "imágenes")}`
      }
      tabs={tabs.map(({ id, label, count }) => ({ id, label, count }))}
      activeTab={current?.id}
      onTabChange={changeTab}
      tabsAccessory={tabs.length > 1 ? filtersToggle : null}
      // Con una sola pestaña no hay barra: el botón va solo, a la derecha.
      searchAccessory={tabs.length > 1 ? null : filtersToggle}
      toolbar={
        tabImages.length > 1 ? (
          <MobileFiltersPanel open={filtersOpen} gapClassName="pt-3">
          <div className="grid grid-cols-2 gap-2">
            <InlineDropdown
              accent="yellow"
              label="Ordenar"
              valueLabel={sortLabel}
              icon={ArrowUpDown}
              menuZIndex={SHEET_MENU_Z}
              fullWidth
            >
              {({ close }) =>
                IMAGE_SORTS.map((option) => (
                  <DropdownItem
                    key={option.id}
                    active={sort === option.id}
                    onClick={() => {
                      setSort(option.id);
                      close();
                    }}
                  >
                    {option.label}
                  </DropdownItem>
                ))
              }
            </InlineDropdown>
            <InlineDropdown
              accent="yellow"
              label="Idioma"
              valueLabel={languageValue}
              icon={Languages}
              menuZIndex={SHEET_MENU_Z}
              fullWidth
            >
              {({ close }) => (
                <>
                  <DropdownItem
                    active={language === "all"}
                    onClick={() => {
                      setLanguage("all");
                      close();
                    }}
                  >
                    Todos ({tabImages.length})
                  </DropdownItem>
                  {languages.map((option) => (
                    <DropdownItem
                      key={option.code}
                      active={language === option.code}
                      onClick={() => {
                        setLanguage(option.code);
                        close();
                      }}
                    >
                      {option.label} ({option.count})
                    </DropdownItem>
                  ))}
                </>
              )}
            </InlineDropdown>
          </div>
          </MobileFiltersPanel>
        ) : null
      }
      headerAction={
        onReset ? (
          // El mismo «restablecer» que la galería de la ficha: vuelve a las
          // imágenes por defecto en todas las pestañas.
          <button
            type="button"
            onClick={onReset}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/5 text-red-400 transition hover:bg-red-500/20 hover:text-red-300 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400"
            aria-label="Restaurar valores por defecto"
            title="Restaurar valores por defecto"
          >
            <RotateCcw className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : null
      }
    >
      {images.length ? (
        <ul className={`grid gap-2.5 sm:gap-3 ${isPoster ? "grid-cols-3" : "grid-cols-2"}`}>
          {images.map((image) => {
            const active = image.file_path === current.activePath;
            const resolution = image.width && image.height ? `${image.width}×${image.height}` : null;
            const badge = [isPoster ? null : image.iso_639_1?.toUpperCase(), resolution].filter(Boolean).join(" · ");
            return (
              <li key={image.file_path} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    if (!active) onSelect?.(current.kind, image.file_path);
                  }}
                  aria-pressed={active}
                  aria-label={`${active ? "Seleccionada" : "Seleccionar"}${resolution ? ` (${resolution})` : ""}`}
                  className={`group/img relative block w-full overflow-hidden rounded-xl bg-zinc-900 after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400 ${
                    active
                      ? "shadow-[0_0_12px_rgba(16,185,129,0.35)] after:shadow-[inset_0_0_0_2px_rgba(52,211,153,1)]"
                      : ""
                  }`}
                >
                  <span
                    className={`block ${isPoster ? "aspect-[2/3]" : "aspect-video"} ${
                      isLogo ? "bg-[repeating-conic-gradient(#27272a_0%_25%,#18181b_0%_50%)] bg-[length:16px_16px] p-4" : ""
                    }`}
                  >
                    <OptimizedImage
                      src={`https://image.tmdb.org/t/p/${isPoster ? "w342" : isLogo ? "w500" : "w780"}${image.file_path}`}
                      srcSet={isLogo ? undefined : tmdbSrcSet(image.file_path, isPoster ? "poster" : "backdrop")}
                      sizes={isPoster ? "(min-width: 640px) 250px, 48vw" : "(min-width: 640px) 400px, 75vw"}
                      alt=""
                      className={`h-full w-full ${isLogo ? "object-contain" : "object-cover"} transition-transform duration-500 group-hover/img:scale-[1.03]`}
                      loading="lazy"
                      decoding="async"
                    />
                  </span>
                  {active ? (
                    <span className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
                    </span>
                  ) : null}
                  {badge ? (
                    <span className="absolute bottom-1.5 left-1.5 right-1.5 truncate text-right text-[10px] font-bold text-zinc-200">
                      <span className="rounded-md bg-black/65 px-1.5 py-0.5">{badge}</span>
                    </span>
                  ) : null}
                </button>
                <a
                  href={`https://image.tmdb.org/t/p/original${image.file_path}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white/85 backdrop-blur-sm transition hover:bg-black/75 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-yellow-400"
                  aria-label={`Abrir imagen original${resolution ? ` (${resolution})` : ""}`}
                  title="Abrir original"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </li>
            );
          })}
        </ul>
      ) : (
        <SectionSheetEmpty>{tabImages.length ? "Ninguna imagen en ese idioma." : "No hay imágenes."}</SectionSheetEmpty>
      )}
    </SectionSheet>
  );
}

// ─── Vídeos y soundtrack ──────────────────────────────────────────────────

function VideosSheet({ meta, data, onClose }) {
  const videos = Array.isArray(data.videos) ? data.videos : [];
  return (
    <SectionSheet open onClose={onClose} title={meta.title} icon={meta.icon} subtitle={plural(videos.length, "vídeo", "vídeos")}>
      {videos.length ? (
        <ul className="space-y-2">
          {videos.map((video) => (
            <li key={video.id || video.key}>
              <VideoRow
                video={video}
                onPlay={(item) => {
                  // El reproductor de la ficha se abre encima: el panel se cierra.
                  onClose();
                  data.onPlayVideo?.(item);
                }}
              />
            </li>
          ))}
        </ul>
      ) : (
        <SectionSheetEmpty>No hay vídeos.</SectionSheetEmpty>
      )}
    </SectionSheet>
  );
}

function SoundtrackSheet({ meta, data, onClose, query, setQuery }) {
  const tracks = Array.isArray(data.soundtrack) ? data.soundtrack : [];
  const filtered = tracks.filter((track) => matches(query, track.trackName, track.artistName, track.collectionName));
  return (
    <SectionSheet
      open
      onClose={onClose}
      title={meta.title}
      icon={meta.icon}
      subtitle={plural(tracks.length, "canción", "canciones")}
      search={tracks.length > 8 ? { value: query, onChange: setQuery, placeholder: "Buscar canción o artista…" } : null}
    >
      {filtered.length ? (
        <ul className="space-y-2">
          {filtered.map((track) => (
            <li key={track.id}>
              <TrackRow
                track={track}
                onPlay={(item) => {
                  onClose();
                  data.onPlayTrack?.(item.id);
                }}
              />
            </li>
          ))}
        </ul>
      ) : (
        <SectionSheetEmpty>{query ? "Ninguna canción coincide." : "No hay canciones."}</SectionSheetEmpty>
      )}
    </SectionSheet>
  );
}

// ─── Sentimientos ─────────────────────────────────────────────────────────

function SentimentSheet({ meta, data, onClose }) {
  const pros = Array.isArray(data.sentiment?.pros) ? data.sentiment.pros : [];
  const cons = Array.isArray(data.sentiment?.cons) ? data.sentiment.cons : [];
  const groups = [
    { id: "pros", title: "Lo mejor", items: pros, dot: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" },
    { id: "cons", title: "Lo peor", items: cons, dot: "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.6)]" },
  ];
  return (
    <SectionSheet open onClose={onClose} title={meta.title} icon={meta.icon} subtitle="Según los comentarios de la comunidad">
      {groups.map((group) => (
        <section key={group.id} className="mt-7 first:mt-0">
          <SectionSheetGroupTitle title={group.title} count={group.items.length} />
          {group.items.length ? (
            <ul className="space-y-2">
              {group.items.map((text, index) => (
                <li key={index} className="flex items-start gap-3 rounded-2xl bg-black/15 p-3.5 text-sm leading-relaxed text-zinc-200">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${group.dot}`} />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <SectionSheetEmpty>No hay suficientes datos.</SectionSheetEmpty>
          )}
        </section>
      ))}
    </SectionSheet>
  );
}

// ─── Temporadas ───────────────────────────────────────────────────────────

function SeasonsSheet({ meta, data, onClose }) {
  const seasons = Array.isArray(data.seasons) ? data.seasons : [];
  return (
    <SectionSheet open onClose={onClose} title={meta.title} icon={meta.icon} subtitle={plural(seasons.length, "temporada", "temporadas")}>
      {seasons.length ? (
        <ul className="space-y-3">
          {seasons.map(({ key, onClick, ...season }) => (
            <li key={key}>
              <SeasonCard
                {...season}
                compact
                onClick={() => {
                  onClose();
                  onClick?.();
                }}
              />
            </li>
          ))}
        </ul>
      ) : (
        <SectionSheetEmpty>No hay temporadas.</SectionSheetEmpty>
      )}
    </SectionSheet>
  );
}

// ─── Comentarios ──────────────────────────────────────────────────────────

function CommentsSheet({ meta, data, onClose }) {
  const comments = data.comments || {};
  const onLoadPage = comments.onLoadPage;
  const initialProfileUsernames = comments.profileUsernames;
  const sourceState = comments.state || {};
  const initialFilters = normalizeCommentFilters(comments.tab || DEFAULT_COMMENT_TAB, comments.byLikes);
  // La primera página de la ficha sirve si es del MISMO filtro.
  const seededItems = sourceState.page === 1 && Array.isArray(sourceState.items)
    ? sourceState.items
    : [];
  const [activeTab, setActiveTab] = useState(initialFilters.tab);
  const [byLikes, setByLikes] = useState(initialFilters.byLikes);
  const [state, setState] = useState(() => ({
    items: seededItems,
    page: seededItems.length ? 1 : 0,
    pageCount: Number(sourceState.pageCount || 0),
    total: Number(sourceState.total || 0),
    hasMore: Boolean(sourceState.hasMore),
    loading: !seededItems.length,
    error: "",
    profileUsernames: initialProfileUsernames || new Map(),
  }));
  const sentinelRef = useRef(null);
  const loadingRef = useRef(false);
  const requestIdRef = useRef(0);
  const items = state.items;

  const fetchPage = useCallback(async (page, tab, append = false, likes = false) => {
    if (!onLoadPage || loadingRef.current) return;
    loadingRef.current = true;
    const requestId = ++requestIdRef.current;
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const payload = await onLoadPage(page, tab, likes);
      if (requestId !== requestIdRef.current) return;
      const nextItems = Array.isArray(payload?.items) ? payload.items : [];
      const pagination = payload?.pagination || {};
      const currentPage = Number(pagination.page || page) || page;
      const pageCount = Number(pagination.pageCount || 0);
      let resolvedProfiles = new Map();
      const usernames = [...new Set(nextItems.map((item) => String(item?.user?.username || "").trim()).filter(Boolean))];
      if (usernames.length) {
        try {
          const response = await fetch(`/api/users/resolve-usernames?usernames=${encodeURIComponent(usernames.join(","))}`, { cache: "no-store" });
          if (response.ok) {
            const result = await response.json();
            resolvedProfiles = new Map((Array.isArray(result?.usernames) ? result.usernames : []).map((username) => [String(username).toLowerCase(), String(username)]));
          }
        } catch {}
      }
      if (requestId !== requestIdRef.current) return;
      setState((current) => {
        const profileUsernames = new Map(append ? current.profileUsernames : initialProfileUsernames || []);
        for (const [username, profile] of resolvedProfiles) profileUsernames.set(username, profile);
        return {
          items: append ? [...current.items, ...nextItems] : nextItems,
          page: currentPage,
          pageCount,
          total: Number(pagination.itemCount || current.total || 0),
          hasMore: pageCount > currentPage,
          loading: false,
          error: "",
          profileUsernames,
        };
      });
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setState((current) => ({ ...current, loading: false, error: error?.message || "Error cargando comentarios" }));
    } finally {
      if (requestId === requestIdRef.current) loadingRef.current = false;
    }
  }, [initialProfileUsernames, onLoadPage]);

  useEffect(() => {
    if (!state.page && state.loading && !state.error) fetchPage(1, activeTab, false, byLikes);
  }, [activeTab, byLikes, fetchPage, state.error, state.loading, state.page]);

  // Al cambiar de filtro NO se vacía la lista: los comentarios de antes se
  // quedan atenuados hasta que llegan los nuevos (los ya vistos o precargados
  // llegan al instante desde la caché de la sesión, vía `onLoadPage`).
  const resetForFilter = () => {
    requestIdRef.current += 1;
    loadingRef.current = false;
    setState((current) => ({ ...current, page: 0, hasMore: false, loading: true, error: "" }));
  };
  const changeTab = (tab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    comments.onTabChange?.(tab);
    resetForFilter();
  };
  const changeLikes = (next) => {
    if (next === byLikes) return;
    setByLikes(next);
    comments.onLikesChange?.(next);
    resetForFilter();
  };

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !state.hasMore || state.loading || state.error || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !loadingRef.current) fetchPage(state.page + 1, activeTab, true, byLikes);
    }, { root: sentinel.closest(".details-sheet-scroll"), rootMargin: "0px 0px 240px", threshold: 0.01 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [activeTab, byLikes, fetchPage, state.error, state.hasMore, state.loading, state.page]);

  return (
    <SectionSheet
      open
      onClose={onClose}
      title={meta.title}
      icon={meta.icon}
      subtitle={state.total > 0 ? plural(state.total, "comentario", "comentarios") : null}
      tabs={COMMENT_TABS}
      activeTab={activeTab}
      onTabChange={changeTab}
      // «Más likes» junto a las pestañas, solo con el icono (como en la ficha).
      tabsAccessory={(
        <button
          type="button"
          onClick={() => changeLikes(!byLikes)}
          aria-pressed={byLikes}
          aria-label="Ordenar por likes"
          title={byLikes ? "Quitar el orden por likes" : "Ordenar por likes"}
          className={`flex w-11 shrink-0 items-center justify-center transition-colors ${SHEET_CONTROL} ${
            byLikes ? "!from-white/20 !to-white/15 text-white" : "text-zinc-400 hover:from-white/15 hover:to-white/10 hover:text-white"
          }`}
        >
          <Heart className={`h-4 w-4 ${byLikes ? "fill-pink-400 text-pink-400" : ""}`} aria-hidden="true" />
        </button>
      )}
    >
      {state.loading && !items.length ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500" aria-label="Cargando comentarios" />
        </div>
      ) : items.length ? (
        <ul aria-busy={state.loading} className={`space-y-3 transition-opacity duration-200 ${state.loading ? "opacity-50" : "opacity-100"}`}>
          {items.map((comment) => (
            <li key={String(comment?.id || `${comment?.user?.username}-${comment?.created_at}`)}>
              <TraktCommentCard
                comment={comment}
                profileUsernames={state.profileUsernames}
                mediaType={comments.mediaType}
                tmdbId={comments.tmdbId}
                canLike={comments.canLike}
              />
            </li>
          ))}
        </ul>
      ) : (
        <SectionSheetEmpty>Todavía no hay comentarios.</SectionSheetEmpty>
      )}

      {state.hasMore ? (
        <div ref={sentinelRef} className="flex min-h-12 items-center justify-center" aria-live="polite">
          {state.loading ? <Loader2 className="h-5 w-5 animate-spin text-zinc-500" aria-label="Cargando más comentarios" /> : null}
        </div>
      ) : null}
      {state.error ? (
        <button type="button" onClick={() => fetchPage(state.page + 1, activeTab, true, byLikes)} className="mt-3 w-full py-3 text-sm font-bold text-emerald-300">
          Reintentar cargar comentarios
        </button>
      ) : null}
    </SectionSheet>
  );
}

// ─── Listas ───────────────────────────────────────────────────────────────

function ListsSheet({ meta, data, onClose, query, setQuery }) {
  const lists = data.lists || {};
  const state = lists.state || {};
  const items = Array.isArray(state.items) ? state.items : [];
  const filtered = items.filter((row) => matches(query, (row?.list || row)?.name, (row?.user || row?.list?.user)?.username));
  return (
    <SectionSheet
      open
      onClose={onClose}
      title={meta.title}
      icon={meta.icon}
      subtitle={plural(items.length, "lista", "listas")}
      search={items.length > 8 ? { value: query, onChange: setQuery, placeholder: "Buscar lista o autor…" } : null}
    >
      {state.loading && !items.length ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500" aria-label="Cargando listas" />
        </div>
      ) : filtered.length ? (
        <ul className="space-y-2">
          {filtered.map((row, index) => {
            const list = row?.list || row || {};
            return (
              <li key={String(list.id || `${list.name}-${index}`)}>
                <ListRow row={row} onNavigate={onClose} />
              </li>
            );
          })}
        </ul>
      ) : (
        <SectionSheetEmpty>{query ? "Ninguna lista coincide." : "No hay listas con este título."}</SectionSheetEmpty>
      )}
      {state.hasMore && !query ? (
        <button
          type="button"
          onClick={lists.onLoadMore}
          disabled={state.loading}
          className="mx-auto mt-4 flex min-h-10 items-center gap-2 rounded-full bg-white/5 px-5 text-xs font-bold text-zinc-200 transition hover:bg-white/10 disabled:opacity-50"
        >
          {state.loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
          Cargar más listas
        </button>
      ) : null}
    </SectionSheet>
  );
}
