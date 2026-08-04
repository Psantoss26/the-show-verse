"use client";

// Sección de Recomendaciones: baraja de títulos que se deslizan.
//
//   ← izquierda  descartar (se recuerda en el backend, vale en todos los
//                dispositivos: no vuelve a salir)
//   → derecha    añadir a pendientes
//   ↑ arriba     añadir a favoritos
//   botón        añadir a una lista
//
// El backend entrega la baraja YA filtrada (sin descartes ni lo que esté en
// pendientes/favoritos), así que aquí no hay que cruzar listas: se consume en
// orden. Ver src/lib/recommendations/swipeDecision.js para los umbrales del gesto.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import {
  BookmarkPlus,
  Heart,
  ListVideo,
  Loader2,
  RotateCcw,
  Sparkles,
  Star,
  Undo2,
  X,
} from "lucide-react";

import OptimizedImage from "@/components/OptimizedImage";
import LiquidButton from "@/components/LiquidButton";
import AddToListModal from "@/components/details/AddToListModal";
import { DetailsRatingsBadges } from "@/components/details/DetailsScoreboardPanel";
import { formatCountShort } from "@/lib/details/formatters";
import { useAuth } from "@/context/AuthContext";
import { LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";
import { markAsFavorite, markInWatchlist } from "@/lib/api/tmdb";
import {
  cacheAddFavorite,
  cacheAddWatchlist,
} from "@/lib/userLists/optimisticListCache";
import useAddToListFlow from "@/lib/recommendations/useAddToListFlow";
import {
  prefetchCardArtwork,
  useCardArtwork,
} from "@/lib/recommendations/cardArtwork";
import {
  prefetchCardImdbRating,
  useCardImdbRating,
} from "@/lib/recommendations/cardImdbRating";
import {
  SWIPE_ACTIONS,
  exitTargetFor,
  resolveSwipeAction,
} from "@/lib/recommendations/swipeDecision";

const TYPE_FILTERS = [
  { value: "all", label: "Todo" },
  { value: "movie", label: "Películas" },
  { value: "tv", label: "Series" },
];

// Cuando queden menos cartas que esto, se pide otra tanda por detrás.
const REFILL_THRESHOLD = 4;

const ACTION_STYLE = {
  [SWIPE_ACTIONS.DISMISS]: {
    label: "Descartado",
    icon: X,
    ring: "ring-zinc-300/70",
    text: "text-zinc-100",
    glow: "shadow-[0_0_40px_rgba(244,244,245,0.25)]",
  },
  [SWIPE_ACTIONS.WATCHLIST]: {
    label: "Pendiente",
    icon: BookmarkPlus,
    ring: "ring-sky-400/80",
    text: "text-sky-300",
    glow: "shadow-[0_0_40px_rgba(56,189,248,0.35)]",
  },
  [SWIPE_ACTIONS.FAVORITE]: {
    label: "Favorito",
    icon: Heart,
    ring: "ring-red-400/80",
    text: "text-red-300",
    glow: "shadow-[0_0_40px_rgba(248,113,113,0.35)]",
  },
};

function cardKey(item) {
  return `${item.mediaType}:${item.tmdbId}`;
}

function detailsHref(item) {
  return `/details/${item.mediaType === "tv" ? "tv" : "movie"}/${item.tmdbId}`;
}

// "Porque viste X": el backend devuelve las semillas que han motivado la
// recomendación. Es lo que hace entendible por qué aparece cada carta.
function reasonText(item) {
  const seed = (item?.reasons || []).find((r) => r?.seedTitle)?.seedTitle;
  return seed ? `Porque viste ${seed}` : null;
}

export default function RecommendationsClient() {
  const { session, account, hydrated } = useAuth();
  const reduceMotion = useReducedMotion();
  const listFlow = useAddToListFlow();

  const [typeFilter, setTypeFilter] = useState("all");
  const [deck, setDeck] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [needsAuth, setNeedsAuth] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastAction, setLastAction] = useState(null);

  // Claves ya consumidas en esta sesión: al recargar la baraja (refill o cambio
  // de filtro) el backend puede devolver otra vez algo que acabamos de deslizar,
  // porque su caché de recomendaciones dura 24h.
  const consumedRef = useRef(new Set());

  const current = deck[0] || null;
  const upcoming = deck.slice(1, 3);

  const loadDeck = useCallback(
    async ({ append = false } = {}) => {
      if (!append) setLoading(true);
      setError("");
      try {
        const res = await fetch(
          `/api/recommendations?type=${typeFilter}&limit=40`,
          { credentials: "include", cache: "no-store" },
        );
        if (res.status === 401) {
          setNeedsAuth(true);
          setDeck([]);
          return;
        }
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Error al cargar");
        setNeedsAuth(false);

        const incoming = (json.items || []).filter(
          (item) => item?.tmdbId && !consumedRef.current.has(cardKey(item)),
        );

        setDeck((prev) => {
          if (!append) return incoming;
          const known = new Set(prev.map(cardKey));
          return [...prev, ...incoming.filter((i) => !known.has(cardKey(i)))];
        });
      } catch (err) {
        setError(err?.message || "No se pudieron cargar las recomendaciones.");
      } finally {
        setLoading(false);
      }
    },
    [typeFilter],
  );

  useEffect(() => {
    if (!hydrated) return;
    consumedRef.current = new Set();
    loadDeck();
  }, [hydrated, loadDeck]);

  // MÓVIL: esta vista no se desplaza en absoluto.
  //
  // La capa de la baraja es fija, pero el contenedor del layout conserva su
  // `min-h-[100svh]` (más la reserva inferior) y, al empezar POR DEBAJO del
  // navbar, el documento acababa midiendo 3rem de más: quedaba una franja negra
  // al arrastrar hacia arriba y su barra de scroll recortaba el borde derecho de
  // la portada. Ocultar el desbordamiento no bastaba, porque el documento seguía
  // siendo más alto que la pantalla; hay que quitar ESE alto sobrante.
  //
  // Como la baraja está fuera del flujo, el contenedor no necesita reservar
  // nada: se colapsa mientras se está aquí y se restaura al salir.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const root = document.querySelector("[data-scroll-restoration-root]");
    if (!root) return undefined;

    const media = window.matchMedia("(max-width: 639px)");
    const apply = () => {
      if (media.matches) {
        root.style.minHeight = "0px";
        root.style.paddingBottom = "0px";
      } else {
        root.style.minHeight = "";
        root.style.paddingBottom = "";
      }
    };

    apply();
    media.addEventListener("change", apply);
    return () => {
      media.removeEventListener("change", apply);
      root.style.minHeight = "";
      root.style.paddingBottom = "";
    };
  }, []);

  // Precarga el arte (póster sin idioma + logo) de las siguientes cartas: al
  // deslizar, la que entra ya lo tiene resuelto y no se ve aparecer el logo
  // encima de la portada un instante después.
  useEffect(() => {
    if (deck.length === 0) return;
    const siguientes = deck.slice(1, 4);
    prefetchCardArtwork(siguientes);
    prefetchCardImdbRating(siguientes);
  }, [deck]);

  // Rellena por detrás antes de quedarse sin cartas, para que no aparezca un
  // estado vacío momentáneo entre tandas.
  useEffect(() => {
    if (loading || needsAuth || deck.length === 0) return;
    if (deck.length > REFILL_THRESHOLD) return;
    loadDeck({ append: true });
  }, [deck.length, loading, needsAuth, loadDeck]);

  const advance = useCallback((item, action) => {
    consumedRef.current.add(cardKey(item));
    setDeck((prev) => prev.slice(1));
    setLastAction({ item, action });
  }, []);

  const runAction = useCallback(
    async (action) => {
      const item = deck[0];
      if (!item || busy) return;

      // La carta avanza YA: esperar a la red dejaría la baraja congelada tras
      // cada gesto y el flujo dejaría de sentirse continuo.
      advance(item, action);
      setBusy(true);
      try {
        if (action === SWIPE_ACTIONS.DISMISS) {
          await fetch("/api/recommendations/dismiss", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tmdbId: item.tmdbId,
              mediaType: item.mediaType,
            }),
          });
        } else if (action === SWIPE_ACTIONS.WATCHLIST) {
          await markInWatchlist({
            accountId: account?.id,
            sessionId: session,
            type: item.mediaType,
            mediaId: item.tmdbId,
            watchlist: true,
            title: item.title,
            posterPath: item.posterPath,
          });
          cacheAddWatchlist({
            type: item.mediaType,
            mediaId: item.tmdbId,
            title: item.title,
            posterPath: item.posterPath,
          });
        } else if (action === SWIPE_ACTIONS.FAVORITE) {
          await markAsFavorite({
            accountId: account?.id,
            sessionId: session,
            type: item.mediaType,
            mediaId: item.tmdbId,
            favorite: true,
            title: item.title,
            posterPath: item.posterPath,
          });
          cacheAddFavorite({
            type: item.mediaType,
            mediaId: item.tmdbId,
            title: item.title,
            posterPath: item.posterPath,
          });
        }
      } catch {
        setError("No se pudo guardar la acción. Inténtalo de nuevo.");
      } finally {
        setBusy(false);
      }
    },
    [deck, busy, account, session, advance],
  );

  // Deshacer: devuelve la carta al principio de la baraja y revierte lo hecho.
  // Un gesto rápido se equivoca con facilidad, y sin esto el error sería
  // irreversible (sobre todo el descarte, que es permanente).
  const undoLast = useCallback(async () => {
    if (!lastAction || busy) return;
    const { item, action } = lastAction;
    setLastAction(null);
    consumedRef.current.delete(cardKey(item));
    setDeck((prev) => [item, ...prev]);
    setBusy(true);
    try {
      if (action === SWIPE_ACTIONS.DISMISS) {
        await fetch(
          `/api/recommendations/dismiss/${item.mediaType}/${item.tmdbId}`,
          { method: "DELETE", credentials: "include" },
        );
      } else if (action === SWIPE_ACTIONS.WATCHLIST) {
        await markInWatchlist({
          accountId: account?.id,
          sessionId: session,
          type: item.mediaType,
          mediaId: item.tmdbId,
          watchlist: false,
          title: item.title,
          posterPath: item.posterPath,
        });
      } else if (action === SWIPE_ACTIONS.FAVORITE) {
        await markAsFavorite({
          accountId: account?.id,
          sessionId: session,
          type: item.mediaType,
          mediaId: item.tmdbId,
          favorite: false,
          title: item.title,
          posterPath: item.posterPath,
        });
      }
    } catch {
      setError("No se pudo deshacer. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }, [lastAction, busy, account, session]);

  // Atajos de teclado (escritorio). Se ignoran con el modal de listas abierto
  // para no deslizar cartas por detrás mientras se escribe en él.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (listFlow.open) return;
      if (event.target?.closest?.("input, textarea, [contenteditable]")) return;
      if (event.key === "ArrowLeft") runAction(SWIPE_ACTIONS.DISMISS);
      else if (event.key === "ArrowRight") runAction(SWIPE_ACTIONS.WATCHLIST);
      else if (event.key === "ArrowUp") {
        event.preventDefault();
        runAction(SWIPE_ACTIONS.FAVORITE);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [runAction, listFlow.open]);

  const showEmpty =
    !loading && !needsAuth && deck.length === 0 && !error;

  return (
    // La baraja y sus botones deben verse A LA VEZ sin scroll: en un flujo de
    // deslizar, tener que bajar para pulsar una acción rompe el ritmo. Por eso
    // las alturas van en `vh` y los márgenes se aprietan en móvil.
    // MÓVIL: columna de alto exacto de pantalla. La portada ocupa el espacio
    // sobrante y la fila de acciones queda SIEMPRE anclada por encima de la barra
    // inferior, sea cual sea el alto del móvil (por eso `flex-1` en vez de una
    // altura calculada a mano, que fallaba al cambiar de dispositivo).
    // MÓVIL: capa FIJA a pantalla completa. Al salir del flujo, la portada queda
    // pegada a los cuatro bordes y ni ella ni las acciones se mueven; además deja
    // de depender del `min-h-[100svh]` del layout, que era lo que provocaba un
    // resto de scroll. `z-0` la mantiene por debajo de las dos barras de
    // navegación. El bloqueo del scroll del documento se hace en un efecto.
    <div className="fixed inset-0 z-0 flex flex-col overflow-hidden pb-[calc(5rem+env(safe-area-inset-bottom))] sm:static sm:z-auto sm:block sm:overflow-visible sm:pb-32 sm:pt-24">
      {/* En móvil el contenedor no aporta márgenes NI ancho máximo: la portada
          va a sangre hasta los bordes laterales. */}
      <div className="mx-auto flex w-full min-h-0 max-w-none flex-1 flex-col px-0 sm:block sm:max-w-5xl sm:px-6">
        {/* Cabecera, con el mismo tratamiento que Historial / Favoritos.
            En MÓVIL no se muestra: la vista es inmersiva como la ficha, solo el
            título en pantalla (póster + logo + puntuaciones + acciones). */}
        <motion.header
          className="mb-4 hidden sm:block lg:mb-8"
          initial={reduceMotion ? false : { opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="mb-2 flex items-center gap-3">
            <span className="h-px w-8 bg-emerald-500/70" />
            <span className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-400">
              Para ti
            </span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-5xl">
            Recomendaciones<span className="text-emerald-500">.</span>
          </h1>
          {/* En pantallas bajas este texto se lleva el espacio de la carta; los
              sellos al arrastrar ya explican cada dirección. */}
          <p className="mt-2 hidden max-w-xl text-sm text-zinc-400 min-[420px]:block sm:block">
            Desliza para decidir: a la izquierda descartas, a la derecha lo
            guardas en pendientes y hacia arriba lo marcas como favorito.
          </p>
        </motion.header>

        {/* Filtro de tipo */}
        <motion.div
          className="mb-4 hidden items-center gap-2 sm:mb-6 sm:flex"
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          {TYPE_FILTERS.map((filter) => {
            const active = typeFilter === filter.value;
            return (
              <button
                key={filter.value}
                type="button"
                onClick={() => setTypeFilter(filter.value)}
                className={`rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wide transition-all ${
                  active
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                    : `${LIQUID_GLASS_PANEL} text-zinc-300 hover:text-white`
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </motion.div>

        {needsAuth ? (
          <EmptyState
            icon={Sparkles}
            title="Inicia sesión para ver tus recomendaciones"
            description="Se calculan a partir de lo que ves, puntúas y guardas."
            action={
              <Link
                href="/login?next=/recommendations"
                className="rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-400"
              >
                Iniciar sesión
              </Link>
            }
          />
        ) : loading ? (
          <div className="flex min-h-[420px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
          </div>
        ) : showEmpty ? (
          <EmptyState
            icon={Sparkles}
            title="No quedan recomendaciones por ahora"
            description="Ve, puntúa o guarda algún título más y volveremos con nuevas sugerencias."
            action={
              <button
                type="button"
                onClick={() => {
                  consumedRef.current = new Set();
                  loadDeck();
                }}
                className="flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-400"
              >
                <RotateCcw className="h-4 w-4" /> Volver a buscar
              </button>
            }
          />
        ) : (
          <>
            {/* Baraja */}
            {/* MÓVIL: la portada ocupa el espacio libre y sube bajo el navbar
                superior (que es transparente en esta ruta), igual que el hero de
                la ficha. ESCRITORIO: tarjeta centrada de tamaño fijo. */}
            {/* La capa ya es fija a pantalla completa, así que la portada llega
                sola al borde superior (bajo el navbar transparente) y a los
                laterales: no hacen falta márgenes negativos. */}
            <div className="relative mx-auto flex min-h-0 w-full flex-1 items-center justify-center sm:h-[clamp(300px,44vh,520px)] sm:max-w-sm sm:flex-none">
              {/* Cartas de detrás: dan sensación de pila sin ser interactivas */}
              {upcoming
                .slice()
                .reverse()
                .map((item, indexFromBack) => {
                  const depth = upcoming.length - indexFromBack;
                  return (
                    <div
                      key={cardKey(item)}
                      aria-hidden="true"
                      // Solo en escritorio: en móvil la vista es inmersiva y se
                      // muestra ÚNICAMENTE el título actual.
                      className="absolute inset-0 hidden origin-bottom overflow-hidden rounded-[2rem] border border-white/5 bg-zinc-900 sm:block"
                      style={{
                        transform: `translateY(${depth * 12}px) scale(${1 - depth * 0.04})`,
                        opacity: 1 - depth * 0.35,
                      }}
                    >
                      {item.posterPath && (
                        <OptimizedImage
                          src={`https://image.tmdb.org/t/p/w500${item.posterPath}`}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      )}
                    </div>
                  );
                })}

              <AnimatePresence mode="popLayout">
                {current && (
                  <SwipeCard
                    key={cardKey(current)}
                    item={current}
                    reduceMotion={reduceMotion}
                    onAction={runAction}
                  />
                )}
              </AnimatePresence>
            </div>

            {/* Fila de acciones: mismos botones que la ficha (LiquidButton con
                `groupId="details-actions"`), deshacer incluido como uno más.
                En móvil queda anclada por encima de la barra inferior. */}
            {/* La fila va CENTRADA, con el ancho acotado en móvil (16rem) en vez
                de con relleno lateral: así queda simétrica respecto a la pantalla
                y, aun centrada, su borde derecho no llega a la esquina donde la
                app fija su botón flotante de "Instalar app" (que además solo
                aparece a veces, así que descentrar la fila por él dejaba el
                diseño torcido el resto del tiempo). */}
            <div className="mx-auto flex w-full max-w-[16rem] shrink-0 items-center justify-center gap-2.5 px-2 pt-3 sm:max-w-sm sm:gap-3 sm:px-4 sm:pt-6">
              <RecommendationActionButton
                label="Deshacer"
                onClick={undoLast}
                disabled={!lastAction}
                activeColor="emerald"
              >
                <Undo2 />
              </RecommendationActionButton>
              <RecommendationActionButton
                label="Descartar"
                onClick={() => runAction(SWIPE_ACTIONS.DISMISS)}
                activeColor="blue"
              >
                <X />
              </RecommendationActionButton>
              <RecommendationActionButton
                label="Añadir a favoritos"
                onClick={() => runAction(SWIPE_ACTIONS.FAVORITE)}
                activeColor="red"
              >
                <Heart />
              </RecommendationActionButton>
              <RecommendationActionButton
                label="Añadir a pendientes"
                onClick={() => runAction(SWIPE_ACTIONS.WATCHLIST)}
                activeColor="blue"
              >
                <BookmarkPlus />
              </RecommendationActionButton>
              <RecommendationActionButton
                label="Añadir a una lista"
                onClick={() => current && listFlow.openFor(current)}
                activeColor="purple"
              >
                <ListVideo />
              </RecommendationActionButton>
            </div>

            <p className="hidden text-center text-[11px] text-zinc-500 sm:block">
              También puedes usar las flechas ← → ↑ del teclado
            </p>
          </>
        )}

        {error && (
          <p className="mt-4 text-center text-sm text-red-400" role="alert">
            {error}
          </p>
        )}
      </div>

      <AddToListModal {...listFlow.modalProps} />
    </div>
  );
}

// ----------------------------
// CARTA DESLIZABLE
// ----------------------------
function SwipeCard({ item, reduceMotion, onAction }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [exiting, setExiting] = useState(null);

  // La carta se inclina según cuánto se ha arrastrado: da la sensación física
  // de estar cogiéndola por el centro.
  const rotate = useTransform(x, [-300, 0, 300], [-14, 0, 14]);
  // Sellos de intención: se van revelando conforme el gesto se acerca al umbral.
  const dismissOpacity = useTransform(x, [-140, -40, 0], [1, 0, 0]);
  const watchlistOpacity = useTransform(x, [0, 40, 140], [0, 0, 1]);
  const favoriteOpacity = useTransform(y, [-140, -40, 0], [1, 0, 0]);

  const handleDragEnd = (_event, info) => {
    const action = resolveSwipeAction(info);
    if (!action) return; // vuelve solo a su sitio (dragSnapToOrigin)
    setExiting(action);
    onAction(action);
  };

  const exitTarget = exiting
    ? exitTargetFor(
        exiting,
        typeof window !== "undefined" ? window.innerWidth : 1024,
      )
    : { x: 0, y: 0 };

  const reason = reasonText(item);
  const year = item.year || null;
  const rating =
    typeof item.voteAverage === "number" && item.voteAverage > 0
      ? item.voteAverage.toFixed(1)
      : null;

  // Póster SIN idioma + logo, igual que el hero de la ficha móvil. Mientras se
  // resuelve se usa el póster que ya venía en la recomendación, para que la
  // carta nunca aparezca vacía.
  const artwork = useCardArtwork(item);
  const posterPath = artwork?.posterPath || item.posterPath || null;
  const logoPath = artwork?.logoPath || null;

  // TMDb sale del propio item (instantáneo); IMDb necesita red, así que aparece
  // en cuanto se resuelve sin retrasar el pintado de la carta.
  const imdb = useCardImdbRating(item);

  const tmdbRating =
    typeof item.voteAverage === "number" && item.voteAverage > 0
      ? {
          value: item.voteAverage.toFixed(1),
          sub: item.voteCount ? formatCountShort(item.voteCount) : undefined,
        }
      : null;

  const imdbRating = imdb
    ? {
        value: imdb.value,
        sub: imdb.votes ? formatCountShort(imdb.votes) : undefined,
      }
    : null;

  return (
    <motion.div
      // MÓVIL: sin marco ni fondo; la imagen se funde con la página (vista
      // inmersiva). ESCRITORIO: tarjeta redondeada con sombra.
      className="absolute inset-0 cursor-grab overflow-visible active:cursor-grabbing sm:overflow-hidden sm:rounded-[2rem] sm:bg-zinc-900 sm:shadow-2xl"
      style={{ x, y, rotate }}
      // El arrastre sigue activo con "reducir movimiento": es manipulación
      // directa (la carta sigue al dedo), no una animación que se pueda sufrir.
      // Lo que se reduce es el vuelo de salida, que sí es movimiento autónomo.
      drag
      dragSnapToOrigin
      dragElastic={0.6}
      dragMomentum={false}
      onDragEnd={handleDragEnd}
      initial={reduceMotion ? false : { scale: 0.94, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{
        ...exitTarget,
        opacity: 0,
        transition: { duration: reduceMotion ? 0 : 0.32, ease: "easeOut" },
      }}
      transition={{ duration: reduceMotion ? 0 : 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      {posterPath ? (
        <>
          {/* MÓVIL: la portada se funde por abajo con la máscara compartida de
              la ficha, así el logo y las puntuaciones quedan sobre el fondo de
              la página y no sobre un corte de imagen. */}
          <OptimizedImage
            src={`https://image.tmdb.org/t/p/w780${posterPath}`}
            alt=""
            className="poster-mobile-fade pointer-events-none h-full w-full select-none object-cover sm:[mask-image:none]"
            draggable={false}
          />
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-zinc-700">
          <Sparkles className="h-10 w-10" />
        </div>
      )}

      {/* Degradado inferior SOLO en escritorio: en móvil ese trabajo lo hace la
          máscara, y sumar ambos ensuciaba la parte baja de la imagen. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-2/3 bg-gradient-to-t from-black via-black/70 to-transparent sm:block" />

      {/* Sellos de intención */}
      <SwipeStamp action={SWIPE_ACTIONS.DISMISS} opacity={dismissOpacity} className="left-5 top-5 -rotate-12" />
      <SwipeStamp action={SWIPE_ACTIONS.WATCHLIST} opacity={watchlistOpacity} className="right-5 top-5 rotate-12" />
      <SwipeStamp action={SWIPE_ACTIONS.FAVORITE} opacity={favoriteOpacity} className="left-1/2 top-8 -translate-x-1/2" />

      {/* ---------- MÓVIL: logo + puntuaciones, nada más ---------- */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-6 pb-2 sm:hidden">
        <Link
          href={detailsHref(item)}
          prefetch
          onDragStart={(event) => event.preventDefault()}
          className="flex w-full justify-center"
          aria-label={item.title}
        >
          {logoPath ? (
            <OptimizedImage
              src={`https://image.tmdb.org/t/p/w500${logoPath}`}
              alt={item.title}
              draggable={false}
              className="max-h-24 w-auto max-w-[78%] select-none object-contain drop-shadow-[0_2px_16px_rgba(0,0,0,0.9)]"
            />
          ) : (
            // Sin logo disponible, el título hace su papel con el mismo peso.
            <h2 className="max-w-[90%] text-center text-2xl font-black leading-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)]">
              {item.title}
            </h2>
          )}
        </Link>

        {(tmdbRating || imdbRating) && (
          <div className="pointer-events-none">
            <DetailsRatingsBadges tmdb={tmdbRating} imdb={imdbRating} />
          </div>
        )}
      </div>

      {/* ---------- ESCRITORIO: ficha compacta sobre la tarjeta ---------- */}
      <div className="absolute inset-x-0 bottom-0 hidden p-5 sm:block">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span
            className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
              item.mediaType === "movie"
                ? "bg-sky-500/20 text-sky-300"
                : "bg-purple-500/20 text-purple-300"
            }`}
          >
            {item.mediaType === "movie" ? "Película" : "Serie"}
          </span>
          {year && (
            <span className="text-[11px] font-semibold text-zinc-300">
              {year}
            </span>
          )}
          {rating && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-300">
              <Star className="h-3 w-3 fill-current" /> {rating}
            </span>
          )}
        </div>
        <Link
          href={detailsHref(item)}
          prefetch
          // El arrastre no debe abrir la ficha: solo un toque limpio navega.
          onDragStart={(event) => event.preventDefault()}
          className="block text-2xl font-black leading-tight tracking-tight text-white transition-colors hover:text-emerald-300"
        >
          {item.title}
        </Link>
        {reason && (
          <p className="mt-1 truncate text-xs font-medium text-emerald-400/90">
            {reason}
          </p>
        )}
      </div>
    </motion.div>
  );
}

function SwipeStamp({ action, opacity, className = "" }) {
  const style = ACTION_STYLE[action];
  const Icon = style.icon;
  return (
    <motion.div
      aria-hidden="true"
      style={{ opacity }}
      className={`pointer-events-none absolute flex items-center gap-2 rounded-2xl px-4 py-2 ring-4 ${style.ring} ${style.text} ${style.glow} ${LIQUID_GLASS_PANEL} ${className}`}
    >
      <Icon className="h-5 w-5" />
      <span className="text-sm font-black uppercase tracking-wider">
        {style.label}
      </span>
    </motion.div>
  );
}

// Mismo botón de acción que la ficha: LiquidButton compartiendo `groupId`, para
// que el acabado y los estados sean idénticos a los de DetailsClient. La celda
// fija (aspect-square) evita que el botón cambie de tamaño según su contenido.
function RecommendationActionButton({
  label,
  onClick,
  disabled = false,
  activeColor = "blue",
  children,
}) {
  return (
    <div className="aspect-square min-w-[34px] flex-1 [&_[data-liquid-button]]:!h-auto [&_[data-liquid-button]]:!w-full [&_[data-liquid-button]]:aspect-square [&_[data-liquid-button]_svg]:!h-[46cqw] [&_[data-liquid-button]_svg]:!w-[46cqw] [&_[data-liquid-button]]:[container-type:inline-size] sm:max-w-[56px]">
      <LiquidButton
        onClick={onClick}
        disabled={disabled}
        activeColor={activeColor}
        groupId="details-actions"
        title={label}
        aria-label={label}
        className="!h-auto !w-full aspect-square"
      >
        {children}
      </LiquidButton>
    </div>
  );
}

function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
      <div className={`mb-4 rounded-2xl p-4 ${LIQUID_GLASS_PANEL}`}>
        <Icon className="h-8 w-8 text-emerald-400" />
      </div>
      <h2 className="mb-2 text-xl font-black tracking-tight text-white">
        {title}
      </h2>
      <p className="mb-6 max-w-sm text-sm text-zinc-400">{description}</p>
      {action}
    </div>
  );
}
