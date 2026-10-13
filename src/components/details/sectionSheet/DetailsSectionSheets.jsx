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

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Layers,
  ListVideo,
  Loader2,
  MessageSquare,
  MonitorPlay,
  Music2,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import OptimizedImage from "@/components/OptimizedImage";
import SectionSheet, { SectionSheetEmpty, SectionSheetGroupTitle } from "./SectionSheet";
import { ListRow, PersonRow, TitleRow, TrackRow, VideoRow } from "./SectionSheetRows";
import { AwardRow } from "@/components/details/AwardCard";
import SeasonCard from "@/components/details/SeasonCard";
import TraktCommentCard from "@/components/details/TraktCommentCard";
import { buildCrewGroups, crewRoleLabel } from "@/lib/details/sectionSheetData";
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

const COMMENT_TABS = [
  { id: "likes30", label: "Top 30 días" },
  { id: "likesAll", label: "Top histórico" },
  { id: "recent", label: "Recientes" },
];

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
  const items = Array.isArray(collection.items) ? collection.items : [];
  return (
    <SectionSheet
      open
      onClose={onClose}
      title={collection.name || meta.title}
      icon={meta.icon}
      subtitle={plural(items.length, "película", "películas")}
      headerAction={
        collection.id ? (
          <Link
            href={`/lists/collection/${collection.id}`}
            onClick={onClose}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-white/5 px-3 text-xs font-bold text-zinc-200 transition hover:bg-white/10 hover:text-white"
          >
            Abrir
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : null
      }
    >
      {items.length ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <TitleRow item={item} mediaType="movie" onNavigate={onClose} />
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

function ImagesSheet({ meta, data, onClose, tab, setTab }) {
  const posters = (data.images?.posters || []).filter((image) => image?.file_path);
  const backdrops = (data.images?.backdrops || []).filter((image) => image?.file_path);
  const logos = (data.images?.logos || []).filter((image) => image?.file_path);
  const tabs = [
    { id: "posters", label: "Pósters", count: posters.length },
    { id: "backdrops", label: "Fondos", count: backdrops.length },
    { id: "logos", label: "Logos", count: logos.length },
  ].filter((item) => item.count > 0);
  const activeTab = tab || tabs[0]?.id || "posters";
  const images = activeTab === "backdrops" ? backdrops : activeTab === "logos" ? logos : posters;
  const isPoster = activeTab === "posters";
  return (
    <SectionSheet
      open
      onClose={onClose}
      title={meta.title}
      icon={meta.icon}
      subtitle={plural(posters.length + backdrops.length + logos.length, "imagen", "imágenes")}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setTab}
    >
      {images.length ? (
        <ul className={isPoster ? "grid grid-cols-2 gap-3 sm:grid-cols-3" : "space-y-3"}>
          {images.map((image) => {
            const size = isPoster ? "w342" : activeTab === "logos" ? "w500" : "w780";
            const resolution = image.width && image.height ? `${image.width}×${image.height}` : null;
            return (
              <li key={image.file_path}>
                <a
                  href={`https://image.tmdb.org/t/p/original${image.file_path}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group/img relative block overflow-hidden rounded-xl bg-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400"
                  aria-label={`Abrir imagen original${resolution ? ` (${resolution})` : ""}`}
                >
                  <span
                    className={`block ${isPoster ? "aspect-[2/3]" : "aspect-video"} ${
                      activeTab === "logos" ? "bg-[repeating-conic-gradient(#27272a_0%_25%,#18181b_0%_50%)] bg-[length:16px_16px] p-5" : ""
                    }`}
                  >
                    <OptimizedImage
                      src={`https://image.tmdb.org/t/p/${size}${image.file_path}`}
                      alt=""
                      className={`h-full w-full ${activeTab === "logos" ? "object-contain" : "object-cover"} transition-transform duration-500 group-hover/img:scale-[1.03]`}
                      loading="lazy"
                      decoding="async"
                    />
                  </span>
                  {resolution || image.iso_639_1 ? (
                    <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-bold text-zinc-200">
                      {[image.iso_639_1?.toUpperCase(), resolution].filter(Boolean).join(" · ")}
                    </span>
                  ) : null}
                </a>
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
  const state = comments.state || {};
  const items = Array.isArray(state.items) ? state.items : [];
  return (
    <SectionSheet
      open
      onClose={onClose}
      title={meta.title}
      icon={meta.icon}
      subtitle={state.total > 0 ? plural(state.total, "comentario", "comentarios") : null}
      tabs={COMMENT_TABS}
      activeTab={comments.tab}
      onTabChange={comments.onTabChange}
    >
      {state.loading && !items.length ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500" aria-label="Cargando comentarios" />
        </div>
      ) : items.length ? (
        <ul className={`space-y-3 transition-opacity ${state.loading ? "opacity-60" : ""}`}>
          {items.map((comment) => (
            <li key={String(comment?.id || `${comment?.user?.username}-${comment?.created_at}`)}>
              <TraktCommentCard
                comment={comment}
                profileUsernames={comments.profileUsernames}
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

      {state.pageCount > 1 ? (
        <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Paginación de comentarios">
          <button
            type="button"
            onClick={() => comments.onPageChange?.(state.page - 1)}
            disabled={state.loading || state.page <= 1}
            className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-white/5 px-3 text-xs font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Anterior
          </button>
          <span className="text-xs font-bold text-zinc-500" aria-live="polite">
            {state.page} / {state.pageCount}
          </span>
          <button
            type="button"
            onClick={() => comments.onPageChange?.(state.page + 1)}
            disabled={state.loading || state.page >= state.pageCount}
            className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-white/5 px-3 text-xs font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Siguiente
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </nav>
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
