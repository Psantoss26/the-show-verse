"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookmarkPlus,
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Eye,
  Film,
  Filter,
  Heart,
  Layers3,
  ListChecks,
  LocateFixed,
  Maximize,
  Minimize,
  Minus,
  Network,
  Plus,
  Search,
  SlidersHorizontal,
  Tv,
  X,
} from "lucide-react";
import OptimizedImage from "@/components/OptimizedImage";
import usePreviewOpen from "@/components/preview/usePreviewOpen";
import { ProfileMenuDropdown } from "@/app/u/[username]/ProfileSection";
import { useAuth } from "@/context/AuthContext";
import { setAppPullToRefreshLocked } from "@/lib/android/appBridge";
import { readNeuralPreferences, saveNeuralPreferences } from "@/lib/profile/neuralPreferences";
import {
  getNeuralLayout,
  neuralLayoutKey,
  saveNeuralLayout,
  useNeuralPayload,
} from "@/lib/profile/neuralGraphData";
import { NEURAL_STAGE_CLASS, NeuralSkeletonArt, documentTop } from "./NeuralGraphSkeleton";
import { LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";
import {
  FLAG_FAVORITE,
  FLAG_WATCHED,
  FLAG_WATCHLIST,
  HUB_KIND_LABEL,
  buildNeuralGraph,
  computeVisibility,
  fitCamera,
  searchNodes,
} from "@/lib/profile/neuralGraph";

// Opciones del menú, con la misma forma que las del resto de secciones del
// perfil (ProfileSection: [valor, etiqueta]).
const TYPE_OPTIONS = [["all", "Todo"], ["movie", "Películas"], ["tv", "Series"]];
const RECORD_OPTIONS = [
  ["all", "Todos los registros"],
  ["watched", "Vistos"],
  ["rated", "Puntuados"],
  ["favorite", "Favoritos"],
  ["pending", "Pendientes"],
];
const GROUP_OPTIONS = [
  ["genre-saga", "Género y saga"],
  ["genre", "Solo género"],
  ["decade", "Década"],
];
const optionLabel = (options, value) => options.find(([v]) => v === value)?.[1] || options[0][1];

// Mismo acabado que las piezas del menú de las secciones del perfil.
const MENU_SURFACE = "overflow-clip rounded-2xl bg-black/30 bg-gradient-to-br from-white/10 to-white/5 shadow-lg";

// VISTA NEURAL del perfil, al estilo de la vista de grafo de Obsidian: cada
// título registrado es un punto, unido a los hubs de sus géneros y de su saga.
// Los racimos aparecen solos con la simulación de fuerzas.
//
// RENDIMIENTO
//   - Una sola petición, con la firma de la versión que ya se tiene: si no ha
//     cambiado nada la respuesta son unos bytes (`unchanged`).
//   - La simulación corre en un Web Worker (neuralGraph.worker.js).
//   - Todo se pinta en UN <canvas>, sin un elemento del DOM por nodo, agrupando
//     trazos por color, saltando lo que queda fuera de pantalla y solo cuando
//     algo cambia (posiciones, cámara, hover).

const MIN_K = 0.06;
const MAX_K = 6;
// Zoom a partir del cual se leen los títulos (como el "text fade" de Obsidian).
const LABEL_K = 1.25;
// Botón del grupo de la derecha del menú: mismo aspecto que los modos de vista
// de las secciones del perfil (ProfileViewMode), pero son acciones.
function MenuViewButton({ label, icon: Icon, onClick, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`flex h-full min-w-0 flex-1 items-center justify-center rounded-xl px-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/70 ${
        active ? "text-emerald-400 hover:bg-white/10" : "text-zinc-400 hover:bg-white/10 hover:text-white"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
    </button>
  );
}

// Botón de los controles dentro del lienzo (cuando el menú está oculto).
function StageButton({ label, icon: Icon, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/70"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

function detailsHref(title) {
  return `/details/${title.mediaType === "tv" ? "tv" : "movie"}/${title.tmdbId}`;
}

function SelectedCard({ node, graph, onClose, onFocusNode }) {
  const previewClick = usePreviewOpen();
  if (!node) return null;

  if (node.kind !== "title") {
    const index = graph.nodes.indexOf(node);
    const titles = graph.neighbors[index]
      .map((i) => graph.nodes[i])
      .filter((n) => n.kind === "title");
    const series = titles.filter((n) => n.title.mediaType === "tv").length;
    const top = [...titles].sort((a, b) => b.r - a.r).slice(0, 6);
    const isSaga = node.kind === "saga";
    const collectionHref = isSaga && node.id ? `/lists/collection/${node.id}` : null;
    return (
      <div className={`pointer-events-auto relative w-full max-w-sm rounded-2xl p-4 text-left text-white ${LIQUID_GLASS_PANEL}`}>
        {/* Móvil: toda la ficha abre la colección (la flecha solo lo indica). */}
        {collectionHref ? (
          <Link
            href={collectionHref}
            aria-label={`Ver colección ${node.label}`}
            className="absolute inset-0 rounded-2xl @[640px]/detail-page:hidden"
          />
        ) : null}
        <div className="flex items-start gap-3">
          <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: node.color }} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">
              {HUB_KIND_LABEL[node.kind] || "Grupo"}
            </p>
            <h3 className="truncate text-lg font-black">{node.label}</h3>
            <p className="text-xs text-white/60">
              {/* Una saga solo reúne películas: no se cuentan series. */}
              {isSaga
                ? `${titles.length} ${titles.length === 1 ? "película" : "películas"}`
                : `${titles.length - series} películas · ${series} series`}
            </p>
          </div>
          {/* La saga abre su colección: en móvil con la flecha (se cierra
              tocando fuera, como la ficha de un título) y desde 640px con el
              botón "Ver colección" de abajo. */}
          {collectionHref ? (
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-full bg-white/10 text-white @[640px]/detail-page:hidden"
            >
              <ChevronRight className="h-4 w-4" />
            </span>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className={`h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white ${collectionHref ? "hidden @[640px]/detail-page:flex" : "flex"}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {top.length ? (
          // Los títulos siguen enfocando su nodo; el hueco entre ellos deja
          // pasar el toque al enlace de la colección.
          <ul className="pointer-events-none relative mt-3 flex flex-wrap gap-1.5">
            {top.map((n) => (
              <li key={n.id} className="pointer-events-auto">
                <button
                  type="button"
                  onClick={() => onFocusNode(graph.nodes.indexOf(n))}
                  className="max-w-[10rem] truncate rounded-lg bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-white/80 transition hover:bg-white/[0.12] hover:text-white"
                >
                  {n.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {collectionHref ? (
          <Link
            href={collectionHref}
            className="mt-3 hidden h-9 items-center justify-center rounded-xl bg-white/10 text-xs font-bold text-white transition hover:bg-white/20 @[640px]/detail-page:flex"
          >
            Ver colección
          </Link>
        ) : null}
      </div>
    );
  }

  const title = node.title;
  const href = detailsHref(title);
  const openPreview = previewClick(
    { tmdbId: title.tmdbId, mediaType: title.mediaType, title: title.title, posterPath: title.posterPath },
    { mediaType: title.mediaType },
  );
  // MÓVIL: una sola fila compacta (cartel pequeño, datos y, a la derecha,
  // cerrar y una flecha para abrir la ficha). Desde 640px, la ficha amplia
  // con el botón "Ver ficha" debajo. Siempre alineada a la izquierda (el pie
  // de la vista se centra en móvil).
  return (
    <div className={`pointer-events-auto relative w-full max-w-sm rounded-2xl p-2 text-left text-white @[640px]/detail-page:p-3 ${LIQUID_GLASS_PANEL}`}>
      {/* Móvil: toda la ficha abre el título (la flecha solo lo indica). */}
      <Link
        href={href}
        onClick={openPreview}
        aria-label={`Ver ficha de ${title.title}`}
        className="absolute inset-0 z-10 rounded-2xl @[640px]/detail-page:hidden"
      />
      <div className="flex items-center gap-3 @[640px]/detail-page:items-start">
        <div className="h-[4.25rem] w-[2.85rem] shrink-0 overflow-hidden rounded-lg bg-white/5 shadow-[0_16px_32px_-10px_rgba(0,0,0,0.9)] @[640px]/detail-page:h-[6.5rem] @[640px]/detail-page:w-[4.4rem] @[640px]/detail-page:rounded-xl">
          {title.posterPath ? (
            <OptimizedImage
              src={`https://image.tmdb.org/t/p/w185${title.posterPath}`}
              alt=""
              width={70}
              height={104}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-white/30">
              {title.mediaType === "tv" ? <Tv className="h-5 w-5" /> : <Film className="h-5 w-5" />}
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1 @[640px]/detail-page:gap-1.5">
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 truncate text-[10px] font-bold uppercase leading-4 tracking-[0.2em] text-white/45">
              {title.mediaType === "tv" ? "Serie" : "Película"}
              {title.year ? ` · ${title.year}` : ""}
            </p>
            <button type="button" onClick={onClose} aria-label="Cerrar" className="-mr-1 -mt-1 hidden h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white @[640px]/detail-page:flex">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <h3 className="truncate text-sm font-black leading-5 @[640px]/detail-page:line-clamp-2 @[640px]/detail-page:whitespace-normal @[640px]/detail-page:text-base @[640px]/detail-page:leading-snug">{title.title}</h3>
          {title.genres.length || title.saga ? (
            <p className="truncate text-xs leading-4 text-white/60">
              {[title.saga, ...title.genres].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          {/* Mismos iconos y colores que los registros de Actividad del
              perfil: visto (ojo), nota (el número en ámbar), favorita
              (corazón) y pendiente (marcador). */}
          <div className="flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold leading-5 text-white/75">
            {title.flags & FLAG_WATCHED ? (
              <span className="inline-flex items-center gap-1" title="Vista" aria-label="Vista">
                <Eye className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                {/* Solo el icono; el número únicamente si aporta algo. */}
                {title.mediaType === "tv" ? `${title.plays} ep.` : title.plays > 1 ? `${title.plays} veces` : null}
              </span>
            ) : null}
            {title.rating ? (
              <span className="text-base font-black leading-none tabular-nums text-amber-300" title="Tu puntuación">
                {title.rating}
              </span>
            ) : null}
            {title.flags & FLAG_FAVORITE ? (
              <Heart className="h-4 w-4 fill-current text-red-300" aria-label="Favorita" />
            ) : null}
            {title.flags & FLAG_WATCHLIST ? (
              <BookmarkPlus className="h-4 w-4 fill-current text-sky-300" aria-label="Pendiente" />
            ) : null}
          </div>
        </div>
        {/* Móvil: la flecha indica que la ficha abre el título. Se cierra
            tocando fuera, en la red. */}
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white @[640px]/detail-page:hidden"
        >
          <ChevronRight className="h-4 w-4" />
        </span>
      </div>
      <Link
        href={href}
        onClick={openPreview}
        className="mt-3 hidden h-9 items-center justify-center rounded-xl bg-white/10 text-xs font-bold text-white transition hover:bg-white/20 @[640px]/detail-page:flex"
      >
        Ver ficha
      </Link>
    </div>
  );
}

// ENTRADA ANIMADA. Cada nodo tiene un retraso según su distancia al centro de
// la red: los hubs (géneros, sagas, décadas) se adelantan y los títulos van
// apareciendo hacia fuera. Cada uno tarda NODE_REVEAL de la duración total.
const INTRO_MS = 1100;
const NODE_REVEAL = 0.32;

function introReveal(intro, index) {
  const t = (performance.now() - intro.start) / INTRO_MS;
  const local = Math.min(1, Math.max(0, (t - intro.delays[index]) / NODE_REVEAL));
  return 1 - (1 - local) ** 3;
}

// Bloqueo del desplazamiento vertical de la página mientras la vista neuronal
// ocupa toda la pantalla. Al bloquear se vuelve arriba (se podía llegar a la
// pestaña con la página desplazada) y se evita el rebote de iOS.
// `overflow: hidden` en <html> y <body> corta la rueda y el dedo (también en
// iOS), pero no los desplazamientos por código (restauración de scroll, foco):
// esos se devuelven arriba al momento mientras dure el bloqueo.
let pageScrollLocked = false;
const keepPageAtTop = () => {
  if (window.scrollY !== 0) window.scrollTo({ top: 0, behavior: "instant" });
};
function lockPageScroll(locked) {
  if (typeof document === "undefined" || pageScrollLocked === locked) return;
  pageScrollLocked = locked;
  for (const element of [document.documentElement, document.body]) {
    element.style.overflowY = locked ? "hidden" : "";
    element.style.overscrollBehaviorY = locked ? "none" : "";
  }
  if (locked) {
    keepPageAtTop();
    window.addEventListener("scroll", keepPageAtTop, { passive: true });
  } else {
    window.removeEventListener("scroll", keepPageAtTop);
  }
}

export default function NeuralGraphView({ username, headerCollapsed = false, onToggleHeader = null }) {
  const router = useRouter();
  const { status, payload } = useNeuralPayload(username);
  // Preferencias guardadas (por cuenta). El componente solo existe en el
  // navegador (dynamic, sin SSR), así que se leen al crear el estado y la
  // vista nace ya como se dejó: sin pintar antes los valores por defecto.
  const { user: viewer } = useAuth();
  const viewerId = viewer?.id || null;
  const [groupBy, setGroupBy] = useState(() => readNeuralPreferences(viewerId).groupBy);
  const graph = useMemo(() => (payload ? buildNeuralGraph(payload, { groupBy }) : null), [payload, groupBy]);

  const containerRef = useRef(null);
  const menuRef = useRef(null);
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const workerRef = useRef(null);
  const positionsRef = useRef(null);
  const cameraRef = useRef({ x: 0, y: 0, k: 1 });
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const hoverRef = useRef(-1);
  const frameRef = useRef(0);
  const interactedRef = useRef(false);
  const cameraAnimRef = useRef(0);
  // Entrada animada en curso: { start, delays: Float32Array } o null.
  const introRef = useRef(null);
  const introFrameRef = useRef(0);
  const viewRef = useRef({ visible: null, focus: null, matchSet: null, selected: -1 });

  const [filters, setFilters] = useState(() => {
    const prefs = readNeuralPreferences(viewerId);
    return { type: prefs.type, record: prefs.record };
  });
  const [menuOpen, setMenuOpen] = useState(false);
  // Menú oculto por defecto: la vista arranca con todo el alto para la red.
  const [menuVisible, setMenuVisible] = useState(() => readNeuralPreferences(viewerId).menuVisible);
  // En MÓVIL el menú está siempre presente (su fila de buscador, centrar y
  // opciones no ocupa casi nada) y no hay botón para ocultarlo. Mismo corte que
  // el resto del perfil: 640px.
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(max-width: 639px)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia?.("(max-width: 639px)");
    if (!query) return undefined;
    const onChange = () => setNarrow(query.matches);
    onChange();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  const menuShown = narrow || menuVisible;
  const [menuAnimating, setMenuAnimating] = useState(false);
  // Guardar lo que cambie. Si la sesión termina de cargar con otra cuenta,
  // se aplican las preferencias de esa cuenta.
  const loadedViewerRef = useRef(viewerId);
  useEffect(() => {
    if (loadedViewerRef.current === viewerId) return;
    loadedViewerRef.current = viewerId;
    const prefs = readNeuralPreferences(viewerId);
    setGroupBy(prefs.groupBy);
    setFilters({ type: prefs.type, record: prefs.record });
    setMenuVisible(prefs.menuVisible);
  }, [viewerId]);
  useEffect(() => {
    if (loadedViewerRef.current !== viewerId) return;
    saveNeuralPreferences(viewerId, { groupBy, type: filters.type, record: filters.record, menuVisible });
  }, [filters, groupBy, menuVisible, viewerId]);

  // Buscador dentro del lienzo (con el menú oculto).
  const [searchOpen, setSearchOpen] = useState(false);
  const stageSearchRef = useRef(null);
  useEffect(() => {
    if (searchOpen) stageSearchRef.current?.focus();
  }, [searchOpen]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(-1);
  const [settled, setSettled] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const visibility = useMemo(() => (graph ? computeVisibility(graph, filters) : null), [filters, graph]);
  const matches = useMemo(() => {
    if (!graph) return [];
    return searchNodes(graph.nodes, query).filter((i) => visibility?.[i]);
  }, [graph, query, visibility]);

  // Grupos de color, calculados una vez por grafo: se pinta un trazo por color.
  const colorGroups = useMemo(() => {
    if (!graph) return [];
    const groups = new Map();
    graph.nodes.forEach((node, index) => {
      const key = `${node.color}|${node.pending ? 1 : 0}`;
      if (!groups.has(key)) groups.set(key, { color: node.color, pending: node.pending, indices: [] });
      groups.get(key).indices.push(index);
    });
    return [...groups.values()];
  }, [graph]);

  const legend = useMemo(() => {
    if (!graph) return [];
    return graph.nodes
      .map((node, index) => ({ node, index }))
      .filter(({ node, index }) => (node.kind === "genre" || node.kind === "decade") && visibility?.[index])
      .map((entry) => ({
        ...entry,
        // Títulos del grupo que pasan los filtros, no el total.
        count: graph.neighbors[entry.index].filter((n) => visibility[n] && graph.nodes[n].kind === "title").length,
      }))
      .sort((a, b) => (graph.groupBy === "decade" ? a.node.id - b.node.id : b.count - a.count));
  }, [graph, visibility]);

  const pos = useCallback((index) => {
    const positions = positionsRef.current;
    if (positions && positions.length > index * 2 + 1) {
      return { x: positions[index * 2], y: positions[index * 2 + 1] };
    }
    const node = graph?.nodes[index];
    return { x: node?.x || 0, y: node?.y || 0 };
  }, [graph]);

  // ── Dibujo ────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    frameRef.current = 0;
    const canvas = canvasRef.current;
    if (!canvas || !graph) return;
    const ctx = canvas.getContext("2d");
    const { w, h, dpr } = sizeRef.current;
    const { x: cx, y: cy, k } = cameraRef.current;
    const { visible: visibleRef, focus, matchSet, selected: selectedIndex } = viewRef.current;
    const nodes = graph.nodes;
    const P = positionsRef.current;
    const px = (i) => (P ? P[i * 2] : nodes[i].x);
    const py = (i) => (P ? P[i * 2 + 1] : nodes[i].y);
    // Entrada animada: cuánto se ha revelado cada nodo (0 → 1).
    const intro = introRef.current;
    const reveal = intro ? (i) => introReveal(intro, i) : null;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (w / 2 + cx), dpr * (h / 2 + cy));

    // Zona visible en coordenadas del mundo (con margen), para no pintar fuera.
    const margin = 40 / k;
    const x0 = (-w / 2 - cx) / k - margin;
    const x1 = (w / 2 - cx) / k + margin;
    const y0 = (-h / 2 - cy) / k - margin;
    const y1 = (h / 2 - cy) / k + margin;
    const visible = visibleRef || new Uint8Array(nodes.length).fill(1);
    const onScreen = (i) => {
      const x = px(i);
      const y = py(i);
      return x > x0 && x < x1 && y > y0 && y < y1;
    };
    const highlight = focus || matchSet;

    // Enlaces. NÍTIDOS: un píxel de pantalla entero (1/k en el mundo) y no
    // medio, que el suavizado emborronaba hasta perderse. Y SIN RECORTAR: se
    // descarta un enlace solo si su caja no toca la pantalla; antes se
    // descartaba si sus dos extremos quedaban fuera, aunque la cruzara.
    const segmentOnScreen = (a, b) => {
      const ax = px(a);
      const ay = py(a);
      const bx = px(b);
      const by = py(b);
      return Math.max(ax, bx) > x0 && Math.min(ax, bx) < x1 && Math.max(ay, by) > y0 && Math.min(ay, by) < y1;
    };
    ctx.lineCap = "round";
    ctx.lineWidth = 1 / k;
    ctx.strokeStyle = highlight ? "rgba(148,163,184,0.07)" : "rgba(161,161,170,0.24)";
    if (reveal) {
      // Durante la entrada, cada enlace aparece con el MENOS revelado de sus
      // dos extremos, agrupados en 6 niveles para seguir pintando por lotes.
      const baseAlpha = highlight ? 0.07 : 0.24;
      const buckets = Array.from({ length: 6 }, () => []);
      for (const [a, b] of graph.links) {
        if (!visible[a] || !visible[b] || !segmentOnScreen(a, b)) continue;
        const level = Math.min(reveal(a), reveal(b));
        if (level <= 0) continue;
        buckets[Math.min(5, Math.ceil(level * 6) - 1)].push(a, b);
      }
      buckets.forEach((segments, level) => {
        if (!segments.length) return;
        ctx.strokeStyle = `rgba(161,161,170,${(baseAlpha * (level + 1)) / 6})`;
        ctx.beginPath();
        for (let j = 0; j < segments.length; j += 2) {
          ctx.moveTo(px(segments[j]), py(segments[j]));
          ctx.lineTo(px(segments[j + 1]), py(segments[j + 1]));
        }
        ctx.stroke();
      });
    } else {
      ctx.beginPath();
      for (const [a, b] of graph.links) {
        if (!visible[a] || !visible[b]) continue;
        if (!segmentOnScreen(a, b)) continue;
        ctx.moveTo(px(a), py(a));
        ctx.lineTo(px(b), py(b));
      }
      ctx.stroke();
    }
    if (focus) {
      ctx.lineWidth = 1.4 / k;
      ctx.strokeStyle = "rgba(226,232,240,0.55)";
      ctx.beginPath();
      for (const [a, b] of graph.links) {
        if (!visible[a] || !visible[b] || !(focus.has(a) && focus.has(b))) continue;
        ctx.moveTo(px(a), py(a));
        ctx.lineTo(px(b), py(b));
      }
      ctx.stroke();
    }

    // Nodos, un trazo por color. Con algo resaltado, primero todo atenuado y
    // luego lo resaltado encima.
    const paintNodes = (filter, alpha) => {
      if (reveal) {
        // Entrada: cada nodo crece y aparece con su propio ritmo.
        for (const group of colorGroups) {
          for (const i of group.indices) {
            if (!visible[i] || !filter(i) || !onScreen(i)) continue;
            const amount = reveal(i);
            if (amount <= 0) continue;
            const r = nodes[i].r * (0.35 + 0.65 * amount);
            ctx.globalAlpha = alpha * amount;
            ctx.beginPath();
            ctx.arc(px(i), py(i), r, 0, Math.PI * 2);
            if (group.pending) {
              ctx.lineWidth = Math.max(1.2 / k, 0.6);
              ctx.strokeStyle = group.color;
              ctx.stroke();
            } else {
              ctx.fillStyle = group.color;
              ctx.fill();
            }
          }
        }
        ctx.globalAlpha = 1;
        return;
      }
      ctx.globalAlpha = alpha;
      for (const group of colorGroups) {
        ctx.beginPath();
        let any = false;
        for (const i of group.indices) {
          if (!visible[i] || !filter(i) || !onScreen(i)) continue;
          const r = nodes[i].r;
          ctx.moveTo(px(i) + r, py(i));
          ctx.arc(px(i), py(i), r, 0, Math.PI * 2);
          any = true;
        }
        if (!any) continue;
        if (group.pending) {
          ctx.lineWidth = Math.max(1.2 / k, 0.6);
          ctx.strokeStyle = group.color;
          ctx.stroke();
        } else {
          ctx.fillStyle = group.color;
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    };
    if (highlight) {
      paintNodes((i) => !highlight.has(i), 0.14);
      paintNodes((i) => highlight.has(i), 1);
    } else {
      paintNodes(() => true, 1);
    }

    // Anillo del seleccionado.
    if (selectedIndex >= 0 && visible[selectedIndex]) {
      ctx.lineWidth = 2 / k;
      ctx.strokeStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(px(selectedIndex), py(selectedIndex), nodes[selectedIndex].r + 3 / k, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Etiquetas, en coordenadas de PANTALLA (tamaño fijo al hacer zoom). Los
    // géneros siempre; sagas y títulos al acercarse, o si están resaltados.
    // Como en Obsidian, una etiqueta que pisaría a otra de más prioridad no se
    // dibuja: se colocan de mayor a menor importancia sobre una rejilla.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.lineJoin = "round";
    const sagaAlpha = Math.max(0, Math.min(1, (k - 0.55) / 0.35));
    const titleAlpha = Math.max(0, Math.min(1, (k - LABEL_K) / 0.5));
    const candidates = [];
    for (let i = 0; i < nodes.length; i += 1) {
      if (!visible[i] || !onScreen(i)) continue;
      const node = nodes[i];
      const emphasized = i === selectedIndex || (highlight?.has(i) && highlight.size <= 60);
      let alpha;
      const mainHub = node.kind === "genre" || node.kind === "decade";
      if (mainHub) alpha = highlight && !highlight.has(i) ? 0.3 : 1;
      else if (emphasized) alpha = 1;
      else if (highlight) alpha = 0;
      else alpha = node.kind === "saga" ? sagaAlpha : titleAlpha;
      if (reveal) alpha *= reveal(i);
      if (alpha <= 0.02) continue;
      const priority = (emphasized ? 1e6 : 0) + (mainHub ? 1e5 : node.kind === "saga" ? 1e4 : 0) + node.degree * 10 + node.r;
      candidates.push({ i, alpha, priority });
    }
    candidates.sort((x, y) => y.priority - x.priority);
    const CELL = 48;
    const grid = new Map();
    const collides = (rect) => {
      for (let gx = Math.floor(rect.x0 / CELL); gx <= Math.floor(rect.x1 / CELL); gx += 1) {
        for (let gy = Math.floor(rect.y0 / CELL); gy <= Math.floor(rect.y1 / CELL); gy += 1) {
          for (const other of grid.get(`${gx},${gy}`) || []) {
            if (rect.x0 < other.x1 && rect.x1 > other.x0 && rect.y0 < other.y1 && rect.y1 > other.y0) return true;
          }
        }
      }
      return false;
    };
    const place = (rect) => {
      for (let gx = Math.floor(rect.x0 / CELL); gx <= Math.floor(rect.x1 / CELL); gx += 1) {
        for (let gy = Math.floor(rect.y0 / CELL); gy <= Math.floor(rect.y1 / CELL); gy += 1) {
          const key = `${gx},${gy}`;
          if (!grid.has(key)) grid.set(key, []);
          grid.get(key).push(rect);
        }
      }
    };
    for (const { i, alpha } of candidates) {
      const node = nodes[i];
      const isGenre = node.kind === "genre" || node.kind === "decade";
      const size = isGenre ? Math.min(17, 11 + Math.sqrt(node.degree) * 0.35) : node.kind === "saga" ? 12 : 11;
      const font = `${isGenre ? 800 : node.kind === "saga" ? 700 : 600} ${size}px ui-sans-serif, system-ui, sans-serif`;
      ctx.font = font;
      node._labelWidth ??= {};
      const width = node._labelWidth[font] ??= ctx.measureText(node.label).width;
      const sx = px(i) * k + w / 2 + cx;
      const sy = (py(i) + node.r) * k + h / 2 + cy + 3;
      const rect = { x0: sx - width / 2 - 3, x1: sx + width / 2 + 3, y0: sy - 1, y1: sy + size + 1 };
      if (collides(rect)) continue;
      place(rect);
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.strokeText(node.label, sx, sy);
      ctx.fillStyle = node.kind === "title" ? "rgba(228,228,231,0.92)" : "#ffffff";
      ctx.fillText(node.label, sx, sy);
    }
    ctx.globalAlpha = 1;
  }, [colorGroups, graph]);

  // Último draw, para el observador de tamaño (que no se recrea con él).
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
    draw();
  }, [draw]);

  const requestDraw = useCallback(() => {
    if (!frameRef.current) frameRef.current = window.requestAnimationFrame(draw);
  }, [draw]);

  // Estado de vista que usa el dibujo (sin re-render de React por frame).
  useEffect(() => {
    const neighbors = graph?.neighbors || [];
    const hub = selected >= 0 ? selected : -1;
    const focus = hub >= 0 ? new Set([hub, ...(neighbors[hub] || [])]) : null;
    viewRef.current = {
      visible: visibility,
      focus,
      matchSet: matches.length ? new Set(matches) : null,
      selected,
    };
    requestDraw();
  }, [graph, matches, requestDraw, selected, visibility]);

  // ── Cámara ────────────────────────────────────────────────────────────────
  const animateCamera = useCallback((target, duration = 450) => {
    window.cancelAnimationFrame(cameraAnimRef.current);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const from = { ...cameraRef.current };
    if (reduce || duration <= 0) {
      cameraRef.current = target;
      requestDraw();
      return;
    }
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const e = 1 - (1 - t) ** 3;
      cameraRef.current = {
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
        k: from.k + (target.k - from.k) * e,
      };
      draw();
      if (t < 1) cameraAnimRef.current = window.requestAnimationFrame(step);
    };
    cameraAnimRef.current = window.requestAnimationFrame(step);
  }, [draw, requestDraw]);

  // Un encuadre pedido antes de que el lienzo tenga tamaño queda PENDIENTE y
  // se aplica en cuanto se mide (si no, se perdía y la red salía ampliada).
  const pendingFitRef = useRef(false);
  // `animate`: true (transición), false (al instante) o "follow": un paso
  // suave hacia el encuadre, para acompañar a la red mientras se asienta sin
  // saltos de zoom (con un tope de zoom que no llega a mostrar los títulos).
  const fitView = useCallback((animate = true) => {
    if (!graph) return;
    const { w, h } = sizeRef.current;
    if (!w || !h) {
      // Se recuerda el modo: uno de acompañamiento se aplicará con su tope.
      pendingFitRef.current = animate === "follow" || animate === "start" ? "start" : "snap";
      return;
    }
    pendingFitRef.current = false;
    const points = [];
    graph.nodes.forEach((node, index) => {
      if (!visibility || visibility[index]) points.push({ ...pos(index), r: node.r });
    });
    const follow = animate === "follow";
    const capped = follow || animate === "start";
    const target = fitCamera(points, w, h, { padding: 40, minK: MIN_K, maxK: capped ? LABEL_K - 0.1 : 1.6 });
    if (animate === "start") {
      cameraRef.current = target;
      requestDraw();
    } else if (follow) {
      const cam = cameraRef.current;
      const ease = 0.14;
      cameraRef.current = {
        x: cam.x + (target.x - cam.x) * ease,
        y: cam.y + (target.y - cam.y) * ease,
        k: cam.k + (target.k - cam.k) * ease,
      };
      requestDraw();
    } else if (animate) animateCamera(target);
    else {
      cameraRef.current = target;
      requestDraw();
    }
  }, [animateCamera, graph, pos, requestDraw, visibility]);

  const fitViewRef = useRef(fitView);
  useEffect(() => {
    fitViewRef.current = fitView;
  }, [fitView]);

  const focusNode = useCallback((index, { select = true } = {}) => {
    if (!graph || index < 0) return;
    interactedRef.current = true;
    if (select) setSelected(index);
    const { x, y } = pos(index);
    const k = Math.max(cameraRef.current.k, graph.nodes[index].kind === "title" ? 1.8 : 0.9);
    animateCamera({ x: -x * k, y: -y * k, k });
  }, [animateCamera, graph, pos]);

  const zoomBy = useCallback((factor, sx = null, sy = null) => {
    const { w, h } = sizeRef.current;
    const cam = cameraRef.current;
    const ax = sx ?? w / 2;
    const ay = sy ?? h / 2;
    const k = Math.min(MAX_K, Math.max(MIN_K, cam.k * factor));
    const wx = (ax - w / 2 - cam.x) / cam.k;
    const wy = (ay - h / 2 - cam.y) / cam.k;
    cameraRef.current = { x: ax - w / 2 - wx * k, y: ay - h / 2 - wy * k, k };
    interactedRef.current = true;
    requestDraw();
  }, [requestDraw]);

  // ── Simulación (worker) ───────────────────────────────────────────────────
  // La red se PINTA EN CUANTO HAY DATOS, sin esperar al worker:
  //   - si hay una disposición guardada de esta misma red (misma versión y
  //     agrupación), con sus posiciones y su cámara, tal como se dejó; el
  //     worker arranca ya asentado, solo para poder arrastrar nodos;
  //   - si no, con las posiciones de partida (ya agrupadas por hub), y la
  //     simulación la va asentando desde ahí.
  // Al asentarse se guarda la disposición; al salir, también la cámara.
  const layoutKey = neuralLayoutKey(username, payload, groupBy);

  // Arranca la entrada animada con las posiciones de ese momento (guardadas o
  // de partida) y la pinta fotograma a fotograma hasta terminar.
  const startIntro = useCallback(() => {
    window.cancelAnimationFrame(introFrameRef.current);
    if (!graph || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      introRef.current = null;
      return;
    }
    const count = graph.nodes.length;
    const points = new Float32Array(count * 2);
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < count; i += 1) {
      const p = pos(i);
      points[i * 2] = p.x;
      points[i * 2 + 1] = p.y;
      cx += p.x / count;
      cy += p.y / count;
    }
    let maxDist = 1;
    const dist = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      dist[i] = Math.hypot(points[i * 2] - cx, points[i * 2 + 1] - cy);
      maxDist = Math.max(maxDist, dist[i]);
    }
    const delays = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      const d = dist[i] / maxDist;
      delays[i] = graph.nodes[i].kind === "title" ? 0.12 + 0.56 * d : 0.42 * d;
    }
    introRef.current = { start: performance.now(), delays };
    const step = () => {
      drawRef.current();
      if (performance.now() - introRef.current.start < INTRO_MS) {
        introFrameRef.current = window.requestAnimationFrame(step);
      } else {
        introRef.current = null;
        drawRef.current();
      }
    };
    introFrameRef.current = window.requestAnimationFrame(step);
  }, [graph, pos]);
  useEffect(() => {
    if (!graph) return undefined;
    setSelected(-1);
    const saved = getNeuralLayout(layoutKey, graph.nodes.length);
    positionsRef.current = saved ? new Float32Array(saved.positions) : null;
    interactedRef.current = Boolean(saved?.camera);
    let settledNow = Boolean(saved);
    setSettled(settledNow);
    if (saved?.camera) {
      cameraRef.current = saved.camera;
      requestDraw();
    } else if (saved) {
      fitView(false);
    } else {
      // Red nueva: se encuadra la posición de partida sin llegar al zoom de
      // los títulos; a partir de ahí la cámara la acompaña suavemente.
      fitView("start");
    }

    startIntro();

    const worker = new Worker(new URL("./neuralGraph.worker.js", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.onmessage = ({ data }) => {
      if (data.type === "tick") {
        positionsRef.current = data.positions;
        // Mientras se asienta, el encuadre acompaña a la red en cada paso (un
        // alejamiento gradual) salvo que ya se haya movido la cámara a mano.
        if (!interactedRef.current && !settledNow) fitView("follow");
        requestDraw();
      } else if (data.type === "end") {
        settledNow = true;
        setSettled(true);
        if (!interactedRef.current) fitView(true);
        saveNeuralLayout(layoutKey, { positions: positionsRef.current, camera: null });
      }
    };
    const P = saved?.positions;
    worker.postMessage({
      type: "init",
      // Repulsión: los géneros separan los racimos; una saga repele poco para
      // quedarse DENTRO del suyo, junto a sus películas.
      nodes: graph.nodes.map((node, i) => ({
        x: P ? P[i * 2] : node.x,
        y: P ? P[i * 2 + 1] : node.y,
        r: node.r,
        charge: node.kind === "genre" || node.kind === "decade" ? -320 : node.kind === "saga" ? -40 : -26,
        saga: node.kind === "saga",
      })),
      links: graph.links,
      resume: Boolean(saved),
      instant: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || false,
    });
    return () => {
      // Solo una red asentada: una a medio colocar se volvería a recolocar.
      if (settledNow && positionsRef.current) {
        saveNeuralLayout(layoutKey, { positions: positionsRef.current, camera: { ...cameraRef.current } });
      }
      window.cancelAnimationFrame(introFrameRef.current);
      introRef.current = null;
      worker.postMessage({ type: "stop" });
      worker.terminate();
      workerRef.current = null;
    };
    // fitView cambia con los filtros; el worker solo debe reiniciarse con el grafo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  // ── Alto justo del lienzo ─────────────────────────────────────────────────
  // El lienzo ocupa desde donde empieza hasta el borde inferior de la
  // pantalla (menos la barra inferior en táctil): se ve entero sin hacer
  // scroll. Hay que volver a medir cuando se mueve lo de encima:
  //   - el menú de opciones se abre en móvil (se observa su tamaño);
  //   - la cabecera se compacta o despliega (se mide en cada fotograma
  //     mientras dura su animación, para crecer A LA VEZ que ella);
  //   - la ventana cambia de tamaño o de orientación.
  // No basta con observar el <body>: la página tiene alto mínimo de pantalla
  // completa y al encoger la cabecera su alto no cambia.
  const measureStageRef = useRef(() => {});
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const top = Math.round(documentTop(stage));
      stage.style.setProperty("--neural-top", `${top}px`);
      // SIN DESPLAZAMIENTO VERTICAL: la vista ya ocupa justo la pantalla, y lo
      // que queda por debajo es relleno de la página. Solo si cabe entera: en
      // pantallas muy bajas (alto mínimo del lienzo) se deja desplazar.
      lockPageScroll(top + stage.offsetHeight <= window.innerHeight + 2);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    measureStageRef.current = measure;
    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);
    if (menuRef.current) observer.observe(menuRef.current);
    window.addEventListener("resize", schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      lockPageScroll(false);
    };
  }, [fullscreen, status]);

  // Mientras se anima el menú o la cabecera, la cámara acompaña el cambio de
  // tamaño del lienzo para que la red no se mueva en pantalla (ver resize).
  // Solo entonces: al montarse el lienzo se coloca en pasos provisionales, y
  // compensarlos desplazaba la red al volver a la pestaña.
  const anchorUntilRef = useRef(0);
  const layoutTogglesRef = useRef({ headerCollapsed, menuShown });
  useEffect(() => {
    // Solo si de verdad han cambiado (no por montarse ni por el doble montaje
    // de desarrollo de React).
    const previous = layoutTogglesRef.current;
    if (previous.headerCollapsed !== headerCollapsed || previous.menuShown !== menuShown) {
      anchorUntilRef.current = performance.now() + 700;
    }
    layoutTogglesRef.current = { headerCollapsed, menuShown };
    let frame = 0;
    const until = performance.now() + 600;
    const loop = () => {
      measureStageRef.current();
      if (performance.now() < until) frame = window.requestAnimationFrame(loop);
    };
    frame = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frame);
    // Cabecera y menú animan su altura durante 300 ms: se mide en CADA
    // fotograma de la animación (en requestAnimationFrame ya se ve su estado
    // de ese fotograma), para que el lienzo encaje sin desfase de un cuadro.
  }, [headerCollapsed, menuShown]);

  // ── Tamaño del lienzo ─────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return undefined;
    // Sin parpadeos al cambiar de tamaño (menú o cabecera que se animan):
    //   1. Redimensionar un <canvas> lo BORRA. El observador se ejecuta antes
    //      de pintar, así que se redibuja ahí mismo, no en el fotograma
    //      siguiente (eso dejaba fotogramas en blanco durante la animación).
    //      Y solo se redimensiona si el tamaño cambia de verdad.
    //   2. La red NO se reencuadra: la cámara se corrige para que cada punto
    //      siga en el mismo sitio de la pantalla mientras se mueven los bordes
    //      del lienzo. Se ve más o menos red, pero nada salta ni cambia de zoom.
    let last = null;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const top = documentTop(canvas);
      const left = rect.left + window.scrollX;
      const ratio = Math.min(3, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(rect.width * ratio));
      const height = Math.max(1, Math.round(rect.height * ratio));
      if (last && positionsRef.current && performance.now() < anchorUntilRef.current) {
        const cam = cameraRef.current;
        cameraRef.current = {
          ...cam,
          x: cam.x + (last.left + last.w / 2) - (left + rect.width / 2),
          y: cam.y + (last.top + last.h / 2) - (top + rect.height / 2),
        };
      }
      last = { top, left, w: rect.width, h: rect.height };
      // Hasta 3x (pantallas retina de móvil) y con la escala REAL del lienzo:
      // redondear el tamaño y dibujar con la escala teórica dejaba el trazo
      // fuera de la rejilla de píxeles, y se veía borroso.
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      sizeRef.current = { w: rect.width, h: rect.height, dpr: canvas.width / Math.max(1, rect.width) };
      if (pendingFitRef.current && rect.width && rect.height) {
        fitViewRef.current(pendingFitRef.current === "start" ? "start" : false);
      }
      window.cancelAnimationFrame(frameRef.current);
      drawRef.current();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const onFullscreen = () => setFullscreen(document.fullscreenElement === container);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      observer.disconnect();
      document.removeEventListener("fullscreenchange", onFullscreen);
      window.cancelAnimationFrame(frameRef.current);
      window.cancelAnimationFrame(cameraAnimRef.current);
      frameRef.current = 0;
    };
  }, [status]);

  // ── Interacción ───────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !graph) return undefined;
    const pointers = new Map();
    let down = null;
    let pinch = null;

    const local = (event) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const toWorld = ({ x, y }) => {
      const { w, h } = sizeRef.current;
      const cam = cameraRef.current;
      return { x: (x - w / 2 - cam.x) / cam.k, y: (y - h / 2 - cam.y) / cam.k };
    };
    const hit = (point) => {
      const world = toWorld(point);
      const k = cameraRef.current.k;
      const visibleNow = viewRef.current.visible;
      let best = -1;
      let bestDist = Infinity;
      for (let i = 0; i < graph.nodes.length; i += 1) {
        const node = graph.nodes[i];
        if (visibleNow && !visibleNow[i]) continue;
        const p = pos(i);
        const dx = p.x - world.x;
        const dy = p.y - world.y;
        const d = dx * dx + dy * dy;
        const reach = node.r + 5 / k;
        if (d <= reach * reach && d < bestDist) {
          best = i;
          bestDist = d;
        }
      }
      return best;
    };
    const setHover = (index) => {
      if (hoverRef.current === index) return;
      hoverRef.current = index;
      canvas.style.cursor = index >= 0 ? "pointer" : "grab";
      // Hover: resalta el nodo y sus vecinos mientras no haya uno fijado.
      if (viewRef.current.selected < 0) {
        viewRef.current = {
          ...viewRef.current,
          focus: index >= 0 ? new Set([index, ...graph.neighbors[index]]) : null,
        };
      }
      requestDraw();
    };

    // App de Android: su "deslizar para recargar" nativo no ve el gesto del
    // lienzo y recargaba al arrastrar la red hacia abajo. Se bloquea mientras
    // haya un dedo encima (fuera de la app no hace nada).
    let pullLocked = false;
    const lockPull = (locked) => {
      if (pullLocked === locked) return;
      pullLocked = locked;
      setAppPullToRefreshLocked(locked);
    };

    const onPointerDown = (event) => {
      if (event.pointerType === "touch") lockPull(true);
      canvas.setPointerCapture?.(event.pointerId);
      const point = local(event);
      pointers.set(event.pointerId, point);
      window.cancelAnimationFrame(cameraAnimRef.current);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), k: cameraRef.current.k, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
        down = null;
        return;
      }
      down = { start: point, cam: { ...cameraRef.current }, node: hit(point), moved: false };
    };

    const onPointerMove = (event) => {
      const point = local(event);
      if (pointers.has(event.pointerId)) pointers.set(event.pointerId, point);
      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const factor = (pinch.k * (dist / Math.max(1, pinch.dist))) / cameraRef.current.k;
        zoomBy(factor, mid.x, mid.y);
        cameraRef.current = {
          ...cameraRef.current,
          x: cameraRef.current.x + (mid.x - pinch.mid.x),
          y: cameraRef.current.y + (mid.y - pinch.mid.y),
        };
        pinch.mid = mid;
        return;
      }
      if (down) {
        const dx = point.x - down.start.x;
        const dy = point.y - down.start.y;
        if (!down.moved && Math.hypot(dx, dy) > 4) {
          down.moved = true;
          interactedRef.current = true;
          canvas.style.cursor = "grabbing";
        }
        if (!down.moved) return;
        if (down.node >= 0) {
          const world = toWorld(point);
          workerRef.current?.postMessage({ type: "drag", index: down.node, x: world.x, y: world.y });
        } else {
          cameraRef.current = { ...down.cam, x: down.cam.x + dx, y: down.cam.y + dy };
          requestDraw();
        }
        return;
      }
      if (event.pointerType === "mouse") setHover(hit(point));
    };

    const onPointerUp = (event) => {
      pointers.delete(event.pointerId);
      if (!pointers.size) lockPull(false);
      if (pointers.size < 2) pinch = null;
      if (!down) return;
      const current = down;
      down = null;
      canvas.style.cursor = hoverRef.current >= 0 ? "pointer" : "grab";
      if (current.moved) {
        if (current.node >= 0) workerRef.current?.postMessage({ type: "release", index: current.node });
        return;
      }
      setSelected(current.node);
    };

    const onPointerLeave = () => setHover(-1);

    const onWheel = (event) => {
      event.preventDefault();
      const point = local(event);
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      zoomBy(Math.exp(-delta * 0.0015), point.x, point.y);
    };

    const onDoubleClick = (event) => {
      const index = hit(local(event));
      const node = graph.nodes[index];
      if (node?.kind === "title") router.push(detailsHref(node.title));
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("dblclick", onDoubleClick);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("dblclick", onDoubleClick);
      lockPull(false);
    };
  }, [graph, pos, requestDraw, router, zoomBy]);

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else container.requestFullscreen?.().catch(() => {});
  };

  const onSearchKey = (event) => {
    if (event.key === "Enter" && matches.length) {
      event.preventDefault();
      focusNode(matches[0]);
    }
    if (event.key === "Escape") setQuery("");
  };

  const selectedNode = graph && selected >= 0 ? graph.nodes[selected] : null;

  const searchField = (className, placeholder, inputClass) => (
    <label className={`relative min-w-0 ${className}`}>
      <span className="sr-only">Buscar en la vista neuronal</span>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-400" aria-hidden="true" />
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onSearchKey}
        placeholder={placeholder}
        className={`h-11 w-full rounded-2xl bg-black/30 bg-gradient-to-br from-white/10 to-white/5 py-2.5 pl-10 pr-16 text-white shadow-lg transition placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/60 ${inputClass}`}
      />
      {query ? (
        <span className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
          <span className="text-[11px] font-semibold tabular-nums text-zinc-400">{matches.length}</span>
          <button
            type="button"
            onClick={() => setQuery("")}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Limpiar búsqueda"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ) : null}
    </label>
  );

  // Mismas piezas y disposición que el menú de las demás secciones del perfil
  // (ProfileSectionToolbar): buscador, desplegables y grupo de botones.
  const menuControls = (
    <>
      <ProfileMenuDropdown
        label="Tipo"
        valueLabel={optionLabel(TYPE_OPTIONS, filters.type)}
        icon={Filter}
        options={TYPE_OPTIONS}
        value={filters.type}
        onChange={(type) => setFilters((current) => ({ ...current, type }))}
      />
      <ProfileMenuDropdown
        label="Registro"
        valueLabel={optionLabel(RECORD_OPTIONS, filters.record)}
        icon={ListChecks}
        options={RECORD_OPTIONS}
        value={filters.record}
        onChange={(record) => setFilters((current) => ({ ...current, record }))}
      />
      <ProfileMenuDropdown
        label="Agrupar"
        valueLabel={optionLabel(GROUP_OPTIONS, groupBy)}
        icon={Layers3}
        options={GROUP_OPTIONS}
        value={groupBy}
        onChange={setGroupBy}
      />
      <div className={`flex h-11 w-full items-center gap-1 p-1 ${MENU_SURFACE}`}>
        {onToggleHeader && !fullscreen ? (
          <span className="flex h-full flex-1">
            <MenuViewButton
              label={headerCollapsed ? "Mostrar la cabecera del perfil" : "Compactar la cabecera del perfil"}
              icon={headerCollapsed ? ChevronsDown : ChevronsUp}
              onClick={onToggleHeader}
              active={headerCollapsed}
            />
          </span>
        ) : null}
        <MenuViewButton label="Alejar" icon={Minus} onClick={() => zoomBy(1 / 1.35)} />
        <MenuViewButton label="Acercar" icon={Plus} onClick={() => zoomBy(1.35)} />
        {/* Por debajo de 1024px ya está en la fila del buscador: no se repite. */}
        <span className="hidden h-full flex-1 @[1024px]/detail-page:flex">
          <MenuViewButton label="Centrar y encuadrar todo" icon={LocateFixed} onClick={() => fitView(true)} />
        </span>
        <MenuViewButton
          label={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
          icon={fullscreen ? Minimize : Maximize}
          onClick={toggleFullscreen}
        />
      </div>
    </>
  );

  if (status === "error" && !graph) {
    return (
      <section className="flex min-h-72 flex-col items-center justify-center rounded-2xl bg-white/[0.02] px-6 text-center">
        <Network className="h-7 w-7 text-emerald-400/70" />
        <h2 className="mt-4 text-lg font-black text-white">No se pudo cargar la vista neuronal</h2>
        <p className="mt-1 max-w-sm text-sm text-zinc-500">Vuelve a intentarlo en unos segundos.</p>
      </section>
    );
  }

  if (graph && !graph.stats.titles) {
    return (
      <section className="flex min-h-72 flex-col items-center justify-center rounded-2xl bg-white/[0.02] px-6 text-center">
        <Network className="h-7 w-7 text-emerald-400/70" />
        <h2 className="mt-4 text-lg font-black text-white">Aún no hay títulos que conectar</h2>
        <p className="mt-1 max-w-sm text-sm text-zinc-500">
          Cuando haya películas o series registradas, aparecerán aquí agrupadas por género y saga.
        </p>
      </section>
    );
  }

  const visibleTitles = graph && visibility
    ? graph.nodes.reduce((sum, node, i) => sum + (node.kind === "title" && visibility[i] ? 1 : 0), 0)
    : 0;

  return (
    <div
      ref={containerRef}
      className={fullscreen ? "flex h-screen w-screen flex-col overflow-hidden bg-black p-4" : ""}
    >
      {/* ── MENÚ, fuera del lienzo ──
          Oculto por defecto; se despliega con el botón de flecha de arriba del
          lienzo. Filas de rejilla 0fr ↔ 1fr para animar la altura real: el
          lienzo (que se mide contra lo de encima) crece o encoge a la vez. */}
      <div
        ref={menuRef}
        id="neural-menu"
        inert={!menuShown || undefined}
        onTransitionEnd={(event) => {
          if (event.target === event.currentTarget) setMenuAnimating(false);
        }}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
          menuShown ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        {/* Sin recorte a la vista: los anillos de foco no deben cortarse. */}
        <div className={`min-h-0 ${!menuShown || menuAnimating ? "overflow-hidden" : ""}`}>
      <section aria-label="Opciones de la vista neuronal" className="relative z-20 mb-5 space-y-2 @[640px]/detail-page:mb-6">
        <div className="flex gap-2 @[1024px]/detail-page:hidden">
          {searchField("flex-1", "Buscar...", "text-base")}
          <button
            type="button"
            onClick={() => fitView(true)}
            className={`flex h-11 w-11 shrink-0 items-center justify-center text-zinc-200 transition-all hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/70 ${MENU_SURFACE}`}
            aria-label="Centrar y encuadrar todo"
          >
            <LocateFixed className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            className={`flex h-11 w-11 shrink-0 items-center justify-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/70 ${MENU_SURFACE} ${
              menuOpen ? "text-emerald-400" : "text-zinc-200 hover:bg-white/10"
            }`}
            aria-expanded={menuOpen}
            aria-controls="profile-menu-neural"
            aria-label="Mostrar opciones"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="hidden grid-cols-1 gap-2 @[1024px]/detail-page:grid @[1024px]/detail-page:grid-cols-[minmax(13rem,1.35fr)_repeat(3,minmax(10rem,1fr))_minmax(10rem,0.8fr)]">
          {searchField("", "Buscar título, género o saga...", "text-sm")}
          {menuControls}
        </div>
        <div id="profile-menu-neural" className={`${menuOpen ? "grid" : "hidden"} grid-cols-2 gap-2 @[1024px]/detail-page:hidden`}>
          {menuControls}
        </div>
      </section>
        </div>
      </div>

      {/* ── LIENZO ── */}
      <section
        ref={stageRef}
        aria-label="Vista neuronal de títulos"
        // El grafo tiene gestos propios (arrastrar, pellizcar): en móvil no
        // deben cambiar de sección del perfil (data-profile-swipe-exempt) ni
        // de página de usuario (data-mobile-page-swipe-ignore).
        data-profile-swipe-exempt
        data-mobile-page-swipe-ignore
        className={`relative isolate overflow-hidden ${
          fullscreen
            ? "min-h-0 flex-1 rounded-2xl bg-[radial-gradient(120%_90%_at_50%_0%,rgba(16,185,129,0.07),transparent_60%),radial-gradient(90%_80%_at_50%_100%,rgba(99,102,241,0.06),transparent_60%)]"
            : NEURAL_STAGE_CLASS
        }`}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={
            graph
              ? `Red de ${graph.stats.titles} títulos agrupados en ${graph.stats.genres} géneros y ${graph.stats.sagas} sagas`
              : "Cargando la red de títulos"
          }
          // En móvil la red se funde arriba y abajo en vez de cortarse en seco.
          className="absolute inset-0 h-full w-full touch-none cursor-grab select-none [-webkit-mask-image:linear-gradient(to_bottom,transparent,black_32px,black_calc(100%_-_32px),transparent)] [mask-image:linear-gradient(to_bottom,transparent,black_32px,black_calc(100%_-_32px),transparent)] @[640px]/detail-page:[-webkit-mask-image:none] @[640px]/detail-page:[mask-image:none]"
        />

        {/* Con el menú OCULTO, lo esencial sigue dentro del lienzo, arriba:
            a la izquierda el buscador (una lupa que se despliega) y a la
            derecha los controles de vista en una fila. Con el menú abierto
            están en él, así que aquí se desvanecen. */}
        {/* Una sola fila: el buscador ocupa lo que quede y los controles nunca
            encogen, con un hueco fijo entre ambos. La fila no captura el
            puntero: entre las dos piezas se sigue arrastrando la red. */}
        <div
          aria-hidden={menuShown}
          inert={menuShown || undefined}
          // No en móvil: allí el lienzo es estrecho y todo esto está en el menú.
          className={`pointer-events-none absolute inset-x-3 top-3 z-10 hidden items-start justify-between gap-3 transition-opacity duration-300 motion-reduce:transition-none @[640px]/detail-page:flex ${
            menuShown ? "opacity-0" : "opacity-100"
          }`}
        >
          <div className={`pointer-events-auto flex min-w-0 ${searchOpen ? "flex-1 @[1024px]/detail-page:flex-none" : ""}`}>
          {searchOpen ? (
            <label className={`flex h-10 w-full items-center gap-2 rounded-xl pl-3 pr-1 @[1024px]/detail-page:w-72 ${LIQUID_GLASS_PANEL}`}>
              <span className="sr-only">Buscar en la vista neuronal</span>
              <Search className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
              <input
                ref={stageSearchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setQuery("");
                    setSearchOpen(false);
                    return;
                  }
                  onSearchKey(event);
                }}
                onBlur={() => {
                  if (!query) setSearchOpen(false);
                }}
                placeholder="Buscar título, género o saga..."
                className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-zinc-400 focus:outline-none"
              />
              {query ? <span className="shrink-0 text-[11px] font-semibold tabular-nums text-zinc-400">{matches.length}</span> : null}
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setSearchOpen(false);
                }}
                aria-label="Cerrar la búsqueda"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </label>
          ) : (
            <span className={`flex rounded-xl p-1 ${LIQUID_GLASS_PANEL}`}>
              <StageButton label="Buscar en la vista neuronal" icon={Search} onClick={() => setSearchOpen(true)} />
            </span>
          )}
          </div>

        <div
          role="group"
          aria-label="Controles de la vista"
          className={`pointer-events-auto flex shrink-0 items-center gap-0.5 rounded-xl p-1 ${LIQUID_GLASS_PANEL}`}
        >
          <StageButton label="Alejar" icon={Minus} onClick={() => zoomBy(1 / 1.35)} />
          <StageButton label="Acercar" icon={Plus} onClick={() => zoomBy(1.35)} />
          <span className="mx-0.5 h-5 w-px bg-white/10" aria-hidden="true" />
          <StageButton label="Centrar y encuadrar todo" icon={LocateFixed} onClick={() => fitView(true)} />
          <StageButton
            label={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
            icon={fullscreen ? Minimize : Maximize}
            onClick={toggleFullscreen}
          />
        </div>
        </div>

        {/* Mostrar u ocultar el menú, arriba y en el centro del lienzo. */}
        <button
          type="button"
          onClick={() => {
            // Sin transición (reducir movimiento) no llega transitionend.
            if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) setMenuAnimating(true);
            setMenuVisible((current) => !current);
          }}
          aria-expanded={menuVisible}
          aria-controls="neural-menu"
          aria-label={menuVisible ? "Ocultar el menú" : "Mostrar el menú"}
          title={menuVisible ? "Ocultar el menú" : "Mostrar el menú"}
          className={`absolute left-1/2 top-1.5 z-10 h-8 w-12 -translate-x-1/2 @[640px]/detail-page:top-3 items-center justify-center rounded-xl text-zinc-300 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 ${LIQUID_GLASS_PANEL} ${
            // En pantallas estrechas el buscador abierto necesita ese hueco.
            // (en móvil no hay buscador en el lienzo, así que ahí siempre se ve).
            // No en móvil (menú siempre presente); en pantallas medianas, el
            // buscador abierto necesita ese hueco.
            searchOpen && !menuVisible ? "hidden @[1024px]/detail-page:flex" : "hidden @[640px]/detail-page:flex"
          }`}
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-300 motion-reduce:transition-none ${menuVisible ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>

        {/* Mientras llegan los datos (solo la primera vez: después se pinta la
            copia guardada), el mismo esqueleto que usa el perfil al cargar. */}
        {!graph ? <NeuralSkeletonArt /> : null}

        {graph ? (
          <>
            {/* Leyenda de los grupos (géneros o décadas). */}
            <div
              className={`pointer-events-none absolute bottom-3 right-3 hidden w-48 flex-col justify-end @[1024px]/detail-page:flex ${
                // Con el menú oculto, arriba a la derecha están los controles.
                menuShown ? "top-3" : "top-16"
              }`}
            >
              <ul className={`pointer-events-auto max-h-full overflow-y-auto overscroll-contain rounded-2xl p-2 [scrollbar-width:none] ${LIQUID_GLASS_PANEL}`}>
                {legend.map(({ node, index, count }) => (
                  <li key={node.id}>
                    <button
                      type="button"
                      onClick={() => focusNode(index)}
                      className={`flex w-full items-center gap-2 rounded-xl px-2 py-1 text-left text-xs transition hover:bg-white/[0.07] ${
                        selected === index ? "bg-white/10 text-white" : "text-white/75"
                      }`}
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: node.color }} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate font-semibold">{node.label}</span>
                      <span className="tabular-nums text-white/40">{count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Pie: recuento, estado y ficha del nodo seleccionado. */}
            {/* En móvil, por encima de la barra inferior flotante. */}
            <div className="pointer-events-none absolute inset-x-4 bottom-[calc(5.5rem_+_env(safe-area-inset-bottom))] flex flex-col items-center gap-2 text-center @[640px]/detail-page:items-start @[640px]/detail-page:text-left @[640px]/detail-page:inset-x-3 @[640px]/detail-page:bottom-3 @[1024px]/detail-page:right-56">
              <SelectedCard
                node={selectedNode}
                graph={graph}
                onClose={() => setSelected(-1)}
                onFocusNode={(index) => focusNode(index)}
              />
              <p className="rounded-full bg-black/40 px-3 py-1 text-[11px] font-semibold text-white/55 backdrop-blur-md">
                {visibleTitles === graph.stats.titles
                  ? `${graph.stats.titles} títulos · ${graph.stats.movies} películas · ${graph.stats.series} series`
                  : `${visibleTitles} de ${graph.stats.titles} títulos`}
                {` · ${legend.length} ${graph.groupBy === "decade" ? "décadas" : "géneros"}`}
                {graph.groupBy === "genre-saga" ? ` · ${graph.stats.sagas} sagas` : ""}
                {!settled ? " · organizando…" : ""}
                {payload?.missing ? ` · clasificando ${payload.missing}…` : ""}
              </p>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
