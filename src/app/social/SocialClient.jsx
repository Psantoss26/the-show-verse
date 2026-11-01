"use client";

// src/app/social/SocialClient.jsx
//
// SECCIÓN SOCIAL: la barra con el selector Hoy / Siguiendo / Yo y lo que se ve
// debajo. «Siguiendo» y «Yo» son la actividad completa y paginada de las cuentas
// que sigo y la mía; «Hoy» es lo destacado del día (TodayClient). La barra es la
// misma en los tres: con «Hoy» sus desplegables pasan a ser Quién, Día y
// Agrupar. SocialHub pone el fondo, la cabecera y las cifras.
//
// Comparte la maqueta de las páginas de usuario (Favoritos, Pendientes,
// Historial…): fondo con manchas difuminadas del color de la sección, cabecera
// con rótulo + título + tarjetas de recuento, y una barra de filtros STICKY que
// toma el cristal del navbar al fijarse (`data-menu-pinned`, ver globals.css).
// El color propio de esta sección es el ROSA/FUCSIA; los demás ya estaban
// cogidos: rojo (Favoritos), azul (Pendientes), esmeralda (Historial y En
// progreso), ámbar (Biblioteca) y morado (Listas).

import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpDown,
  CalendarDays,
  Flame,
  Globe2,
  CheckCircle2,
  ChevronDown,
  Eye,
  Filter,
  Heart,
  ImageOff,
  Layers3,
  Image as ImageIcon,
  LayoutGrid,
  List,
  ListPlus,
  MessageSquare,
  Search,
  SlidersHorizontal,
  MonitorPlay,
  Star,
  ThumbsUp,
  User,
  UserPlus,
  Users,
  BookmarkPlus,
  X,
} from "lucide-react";

import OptimizedImage from "@/components/OptimizedImage";
import Avatar from "@/components/ui/Avatar";
import { useAuth } from "@/context/AuthContext";
import useStickyToolbarState from "@/hooks/useStickyToolbarState";
import usePageToolbarSearchFit from "@/hooks/usePageToolbarSearchFit";
import { useIsHistoryNavigation } from "@/lib/hooks/useIsHistoryNavigation";
import EntranceItem, { estimateVisibleRows } from "@/components/ui/EntranceItem";
import { useSlidingSectionIndicator } from "@/components/ui/useSlidingSectionIndicator";
import { useSearchParams } from "next/navigation";
import { defaultSocialLanding, todayHref } from "@/lib/today/params";
import { dayTabLabel } from "@/components/today/todayUi";
import TodayClient from "./TodayClient";
import {
  SOCIAL_GROUP_OPTIONS,
  SOCIAL_GROUP_SHORT_LABELS,
  groupSocialFeed,
} from "@/lib/social/feedGrouping";
import { episodeCode, relativeTime } from "@/lib/notifications/alerts";
import {
  formatActivityRatingTarget,
  getActivityDetailsHref,
} from "@/lib/profile/activityRatingTarget";
import {
  activityActionKey,
  hasTargetActivity,
  likeAuthor,
  likeTargetHref,
  likeTargetName,
  likeVerb,
} from "@/lib/profile/activityLikes";
import Stars from "@/components/social/Stars";
import MobileOptionsSheet, { SheetOption, SheetOptionGroup, useInOptionsSheet } from "@/components/ui/MobileOptionsSheet";
import ActivityBackdropImage from "@/components/social/ActivityBackdropImage";
import { activityBackdropTarget, hasActivityBackdropArtwork, isPortraitActivity, isUserActivity } from "@/lib/profile/activityBackdrops";
import useOwnCardPoster from "@/lib/hooks/useOwnCardPoster";

const PAGE_SIZE = 30;
const FEED_VACIO = { items: [], hasMore: false, offset: 0, loaded: false, error: "" };

// Icono y tono de cada acción: EXACTAMENTE los de la Actividad del perfil
// (`ActivityRow` en ProfileSection), para que una acción se vea igual en los
// dos sitios. Favoritos van rellenos; las puntuaciones no llevan
// icono en la fila, enseñan la nota.
const ACCIONES = {
  watched: { Icono: Eye, tono: "text-emerald-400" },
  watchlist: { Icono: BookmarkPlus, tono: "text-sky-400" },
  favorite: { Icono: Heart, tono: "text-red-500", relleno: true },
  rating: { Icono: Star, tono: "text-amber-400" },
  review: { Icono: MessageSquare, tono: "text-orange-400" },
  list: { Icono: ListPlus, tono: "text-violet-400" },
  list_item: { Icono: ListPlus, tono: "text-violet-400" },
  like_review: { Icono: ThumbsUp, tono: "text-pink-400", relleno: true },
  like_list: { Icono: Heart, tono: "text-pink-400", relleno: true },
  like_collection: { Icono: Heart, tono: "text-pink-400", relleno: true },
  like_actor: { Icono: Heart, tono: "text-pink-400", relleno: true },
  follow: { Icono: UserPlus, tono: "text-sky-400" },
  follower: { Icono: UserPlus, tono: "text-sky-400" },
};

// Conjugación: en "Siguiendo" habla el autor del evento ("Ana ha visto…"); en
// "Yo" se habla en primera persona, como tu propio perfil ("Has visto…").
const VERBOS = {
  tercera: {
    watched: "ha visto",
    completed: "ha completado",
    watchlist: "ha añadido a Pendientes",
    favorite: "ha añadido a Favoritos",
    rating: "ha puntuado",
    review: "ha escrito una reseña de",
    list: "ha creado la lista",
    list_item: "ha añadido a una lista",
  },
  primera: {
    watched: "Has visto",
    completed: "Has completado",
    watchlist: "Has añadido a Pendientes",
    favorite: "Has añadido a Favoritos",
    rating: "Has puntuado",
    review: "Has escrito una reseña de",
    list: "Has creado la lista",
    list_item: "Has añadido a una lista",
  },
};

const FILTROS = [
  ["all", "Todo"],
  ["watched", "Visionados"],
  ["rating", "Puntuaciones"],
  ["review", "Reseñas"],
  ["favorite", "Favoritos"],
  ["watchlist", "Pendientes"],
  ["list", "Listas"],
  ["like", "Likes"],
  ["follow", "Seguimientos"],
];

// Vista y agrupado se RECUERDAN entre visitas, como en las páginas de usuario:
// quien elige la lista con póster espera encontrársela la próxima vez.
const CLAVE_VISTA = "showverse:social:viewMode";
const CLAVE_AGRUPADO = "showverse:social:groupBy";
// Las TRES vistas de la Actividad del perfil: "list" (avatar de quien actúa),
// "poster-list" (cartel del título) y "backdrop-list" (backdrop del título, más
// grande). Un valor antiguo guardado ("compact", "grid") ya no existe y vuelve
// a la lista.
const VISTAS = new Set(["list", "poster-list", "backdrop-list"]);
// Vistas de Hoy: rejilla de carteles (la de Trakt) o lista, que aprovecha el
// alto. Por defecto, la lista. Se recuerda aparte de la vista de Siguiendo /
// Yo. La clave lleva versión: con la de antes (`…:todayLayout`), quien había
// pasado alguna vez por la cuadrícula se quedaba en ella y no veía el nuevo
// valor por defecto.
const CLAVE_VISTA_HOY = "showverse:social:todayLayout:v2";
const VISTA_HOY_POR_DEFECTO = "list";
const VISTAS_HOY = [
  ["grid", LayoutGrid, "Cuadrícula"],
  ["list", List, "Lista"],
];
const VISTAS_FEED = [
  ["list", List, "Lista"],
  ["poster-list", ImageIcon, "Lista con póster"],
  ["backdrop-list", MonitorPlay, "Lista con backdrop"],
];

function leerVistaGuardada() {
  if (typeof window === "undefined") return "list";
  const guardada = window.localStorage.getItem(CLAVE_VISTA);
  return VISTAS.has(guardada) ? guardada : "list";
}

function leerAgrupadoGuardado() {
  if (typeof window === "undefined") return "none";
  const guardado = window.localStorage.getItem(CLAVE_AGRUPADO);
  return SOCIAL_GROUP_OPTIONS.some(([v]) => v === guardado) ? guardado : "none";
}

function tipoDeFiltro(evento) {
  // "Listas" agrupa la creación y los elementos añadidos, y "Likes" los tres me
  // gusta: para quien lee el feed son la misma acción.
  return activityActionKey(evento);
}

function accionDe(evento) {
  return ACCIONES[evento.type] || ACCIONES.watched;
}

function hrefDeEvento(evento) {
  const likeHref = likeTargetHref(evento);
  if (likeHref) return likeHref;
  if (evento.type === "list") {
    // En "Siguiendo" el id va prefijado con el autor ("<autor>:list:<id>").
    const id = String(evento.id || "").split("list:").pop();
    return id ? `/lists/${id}` : null;
  }
  return getActivityDetailsHref(evento);
}

// Título enlazado a su ficha, con el mismo peso que en el perfil y el hover en
// el rosa de la sección.
function TituloEvento({ evento }) {
  const titulo = hasTargetActivity(evento) ? likeTargetName(evento) || "Sin título" : evento.title || evento.name || "Sin título";
  const href = hrefDeEvento(evento);
  if (!href) return <span className="font-bold text-white">{titulo}</span>;
  return (
    <Link href={href} prefetch={false} className="font-bold text-white transition-colors hover:text-pink-300">
      {titulo}
    </Link>
  );
}

// Sujeto de la frase: el autor (enlazado a su perfil) o "Has…" en la tuya.
function SujetoEvento({ evento, mostrarAutor }) {
  const autor = mostrarAutor ? evento.author : null;
  if (!autor) return null;
  const nombre = autor.displayName || autor.username;
  return (
    <>
      {autor.username ? (
        <Link
          href={`/u/${encodeURIComponent(autor.username)}`}
          prefetch={false}
          className="font-semibold text-zinc-300 transition-colors hover:text-pink-300"
        >
          {nombre}
        </Link>
      ) : (
        <span className="font-semibold text-zinc-300">{nombre}</span>
      )}{" "}
    </>
  );
}

function verboDe(evento, mostrarAutor) {
  if (hasTargetActivity(evento)) return likeVerb(evento, { firstPerson: !(mostrarAutor && evento.author) });
  const v = mostrarAutor && evento.author ? VERBOS.tercera : VERBOS.primera;
  if (evento.type === "watched" && evento.completedShow) return v.completed;
  return v[evento.type] || v.watched;
}

function tiempoTitle(fecha) {
  const d = new Date(fecha);
  return Number.isNaN(d.getTime()) ? undefined : d.toLocaleString("es-ES");
}

// Cartel enlazado, como `ActivityPoster` del perfil. Con `backdrop`, el
// backdrop del título (vista «Lista con backdrop»).
function CartelEvento({ evento, className = "", backdrop = false, size = "w185" }) {
  const href = hrefDeEvento(evento);
  // Portada elegida en la ficha o, sin ella, la más votada (como en el
  // Perfil). Las temporadas conservan la suya.
  const target = evento.mediaType === "season" ? null : activityBackdropTarget(evento);
  const cardPoster = useOwnCardPoster(target?.mediaType, target?.tmdbId);
  const posterPath = cardPoster || evento.posterPath;
  const src = posterPath ? `https://image.tmdb.org/t/p/${size}${posterPath}` : null;
  // Me gusta a una persona con backdrop: solo su foto centrada, sin fondo.
  const fondo = backdrop && isPortraitActivity(evento) ? "" : "bg-zinc-900";
  const imagen = backdrop ? (
    <ActivityBackdropImage item={evento} alt={evento.title || ""} />
  ) : isUserActivity(evento) ? (
    <Avatar
      src={evento.targetUser?.avatarUrl}
      name={likeTargetName(evento)}
      alt=""
      loading="lazy"
      fallbackClassName="flex h-full w-full items-center justify-center text-lg font-black text-zinc-300"
    />
  ) : src ? (
    <OptimizedImage src={src} alt={evento.title || ""} className="h-full w-full object-cover" loading="lazy" />
  ) : (
    <span className="flex h-full w-full items-center justify-center text-zinc-700">
      <ImageOff className="h-4 w-4" aria-hidden="true" />
    </span>
  );
  if (!href) {
    return (
      <span aria-hidden="true" className={`${className} flex shrink-0 items-center justify-center overflow-hidden ${fondo}`}>
        {imagen}
      </span>
    );
  }
  return (
    <Link
      href={href}
      prefetch={false}
      aria-label={`Ver ${evento.title || evento.name || "ficha"}`}
      className={`${className} shrink-0 overflow-hidden ${fondo} sv-bar-lift transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400/70`}
    >
      {imagen}
    </Link>
  );
}

// Avatar de quien actúa, como `ActivityAvatar` del perfil.
function AvatarEvento({ actor }) {
  const nombre = actor?.displayName || actor?.username || "Usuario";
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-zinc-900 text-xs font-black text-zinc-300">
      <Avatar src={actor?.avatarUrl} name={nombre} alt="" loading="lazy" />
    </span>
  );
}

// Autor de la reseña o de la lista con me gusta (" · de Ana"), enlazado a su
// perfil si es de aquí.
function AutorDelMeGusta({ evento }) {
  const autor = likeAuthor(evento);
  if (!autor) return null;
  return (
    <span className="text-zinc-500">
      {" · de "}
      {autor.href ? (
        <Link href={autor.href} prefetch={false} className="text-zinc-400 transition-colors hover:text-pink-300">
          {autor.name}
        </Link>
      ) : (
        autor.name
      )}
    </span>
  );
}

// La MISMA fila que la Actividad del perfil (`ActivityRow`): sin fondo propio,
// cartel o backdrop según la vista, el avatar de quien actúa (en las tres),
// icono (o la nota) de 32px, la frase y la hora a la derecha.
function EventoFila({ evento, actor, mostrarAutor, conPoster, conBackdrop }) {
  const { Icono, tono, relleno } = accionDe(evento);
  const objetivo =
    evento.type === "rating"
      ? `${formatActivityRatingTarget(evento)} `
      : evento.type === "watched"
        ? episodeCode(evento)
        : "";

  return (
    <article className="flex min-w-0 items-center gap-3 px-3 py-3 sm:px-4">
      {conBackdrop ? (
        <CartelEvento evento={evento} backdrop className={BACKDROP_FILA} />
      ) : conPoster ? (
        <CartelEvento evento={evento} className={POSTER_FILA} />
      ) : null}
      {/* El avatar de quien actúa va en las tres vistas: con cartel o backdrop
          también hay que ver de quién es cada evento. */}
      <AvatarEvento actor={actor} />
      {evento.type === "rating" ? (
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center text-xl font-black leading-none tabular-nums [filter:drop-shadow(0_1px_1px_rgba(0,0,0,0.65))] ${tono}`}
          aria-hidden="true"
        >
          {evento.rating}
        </span>
      ) : (
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center [filter:drop-shadow(0_1px_1px_rgba(0,0,0,0.65))] ${tono}`} aria-hidden="true">
          <Icono strokeWidth={2.5} className={`h-5 w-5 ${relleno ? "fill-current" : ""}`} />
        </span>
      )}
      <p className="min-w-0 flex-1 text-sm leading-5 text-zinc-400">
        <SujetoEvento evento={evento} mostrarAutor={mostrarAutor} />
        {verboDe(evento, mostrarAutor)} {objetivo}
        <TituloEvento evento={evento} />
        {evento.type === "list_item" && evento.listName ? (
          <span className="text-zinc-500"> · {evento.listName}</span>
        ) : null}
        <AutorDelMeGusta evento={evento} />
        {evento.type === "like_review" && evento.excerpt ? (
          <span className="mt-0.5 line-clamp-2 block text-xs leading-4 text-zinc-500">“{evento.excerpt}”</span>
        ) : null}
        {/* Con el backdrop, en móvil la hora va bajo la frase: a la derecha le
            quitaba a la frase el ancho que ya ocupa la miniatura. */}
        {conBackdrop ? (
          <time
            dateTime={evento.createdAt}
            title={tiempoTitle(evento.createdAt)}
            className="mt-1 block text-xs font-medium text-zinc-600 sm:hidden"
          >
            {relativeTime(evento.createdAt)}
          </time>
        ) : null}
      </p>
      <time
        dateTime={evento.createdAt}
        title={tiempoTitle(evento.createdAt)}
        className={`shrink-0 text-xs font-medium text-zinc-600 ${conBackdrop ? "hidden sm:block" : ""}`}
      >
        {relativeTime(evento.createdAt)}
      </time>
    </article>
  );
}

// Reseña: la tarjeta de `ActivityReview` del perfil, con el texto (tapado si
// tiene spoilers) y la nota en estrellas. En la lista lleva el avatar y, con
// sitio, el cartel; en la lista con póster o backdrop, la imagen grande y el
// avatar.
function EventoResena({ evento, actor, mostrarAutor, conPoster, conBackdrop }) {
  const [verSpoiler, setVerSpoiler] = useState(false);
  return (
    <article className="rounded-xl bg-white/[0.04] px-3 py-4 sm:px-4">
      <div className="flex items-start gap-3">
        {conBackdrop ? (
          <>
            <CartelEvento evento={evento} backdrop className={`${BACKDROP_FILA} self-start`} />
            <AvatarEvento actor={actor} />
          </>
        ) : conPoster ? (
          <>
            <CartelEvento evento={evento} size="w342" className={`${POSTER_RESENA} self-start`} />
            <AvatarEvento actor={actor} />
          </>
        ) : (
          <>
            <AvatarEvento actor={actor} />
            <CartelEvento evento={evento} className="hidden h-28 w-[76px] self-start rounded-lg sm:block" />
          </>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-400">
            <span>
              <SujetoEvento evento={evento} mostrarAutor={mostrarAutor} />
              {verboDe(evento, mostrarAutor)}
            </span>
            <TituloEvento evento={evento} />
            {typeof evento.rating === "number" ? <Stars rating={evento.rating} /> : null}
          </div>
          {evento.spoiler && !verSpoiler ? (
            <button
              type="button"
              onClick={() => setVerSpoiler(true)}
              className="mt-3 text-xs font-bold uppercase tracking-widest text-amber-300 transition-colors hover:text-amber-200"
            >
              Contiene spoilers — mostrar reseña
            </button>
          ) : evento.body ? (
            <p className="mt-3 whitespace-pre-line text-sm leading-6 text-zinc-200 sm:text-[15px] sm:leading-7">
              {evento.body}
            </p>
          ) : null}
          <time
            dateTime={evento.createdAt}
            title={tiempoTitle(evento.createdAt)}
            className="mt-3 block text-xs font-medium text-zinc-500"
          >
            {relativeTime(evento.createdAt)}
          </time>
        </div>
      </div>
    </article>
  );
}

// Vistas «Lista con backdrop» y «Lista con póster»: el mismo criterio y tamaño
// que la Actividad y las listas de las secciones del perfil. Crecen con la
// pantalla (en monitores 2K, con tamaño de móvil, se quedaban diminutos) hasta
// un tamaño intermedio. Cartel 2:3: 57×80 px, 64×96 desde `xl` y 75×112 desde
// `2xl`; la miniatura 16:9 tiene su alto (142×80, 171×96 y 199×112).
const BACKDROP_FILA = "aspect-video w-[8.9rem] rounded-lg xl:w-[10.67rem] 2xl:w-[12.45rem]";
const POSTER_FILA = "h-20 w-[3.55rem] rounded-lg xl:h-24 xl:w-16 2xl:h-28 2xl:w-[4.67rem]";
// Cartel de una reseña en esa vista (el de Reseñas del perfil): de 64×96 a
// 85×128 px.
const POSTER_RESENA = "h-24 w-16 rounded-lg xl:h-28 xl:w-[4.67rem] 2xl:h-32 2xl:w-[5.33rem]";

// Un bloque de eventos con la vista elegida, como `ActivityFeed` del perfil.
// Lo usan los dos caminos de pintado (con grupos y sin ellos) para que no
// puedan divergir. `yo` es el actor de los eventos propios (pestaña "Yo").
// Cada fila entra con la cascada de las páginas de usuario; `inicio` es el
// índice global de la primera (con grupos, la cascada sigue de uno a otro).
function ListaEventos({ eventos, vista, mostrarAutor, yo, inicio = 0, total = eventos.length }) {
  const conPoster = vista === "poster-list";
  const conBackdrop = vista === "backdrop-list";
  const animarHasta = estimateVisibleRows(conBackdrop ? 110 : conPoster ? 90 : 72);
  return (
    <ol role="list" className="space-y-3">
      {eventos.map((evento, indice) => {
        const actor = mostrarAutor && evento.author ? evento.author : yo;
        const props = { evento, actor, mostrarAutor, conPoster, conBackdrop };
        return (
          <EntranceItem
            as="li"
            key={evento.id}
            className="min-w-0"
            index={inicio + indice}
            total={total}
            animateWithin={animarHasta}
          >
            {evento.type === "review" ? <EventoResena {...props} /> : <EventoFila {...props} />}
          </EntranceItem>
        );
      })}
    </ol>
  );
}

// Valor de ?view= de cada opción del selector (la de «Hoy» no lo lleva).
const VISTA_DE_ALCANCE = { following: "activity", me: "mine" };
const ALCANCE_DE_VISTA = { activity: "following", mine: "me" };
// Orden de los botones del selector (Actividad · Siguiendo · Yo).
const ORDEN_ALCANCES = ["today", "following", "me"];

export default function SocialClient({ initialView = "today", initialToday = {}, onTodaySummary }) {
  const { session, account, hydrated } = useAuth();
  const isBackNav = useIsHistoryNavigation();

  // «today» | «following» | «me». Con «today» la barra lleva los controles de
  // Hoy y debajo se pinta TodayClient.
  const [scope, setScope] = useState(ALCANCE_DE_VISTA[initialView] || "today");
  const esHoy = scope === "today";
  // CAMBIO DE SECCIÓN DESDE EL SELECTOR: la sección nueva se pinta en una
  // transición (ver SelectorAlcance, que mueve su pastilla antes).
  const elegirScope = useCallback((valor) => {
    startTransition(() => setScope(valor));
  }, []);
  // Dirección de la entrada del contenido: llega desde el lado en que está su
  // botón en el selector, como las pestañas de las fichas (`.sv-tab-panel`).
  // Se calcula en el render; la sección inicial no se desliza.
  const [seccionMotion, setSeccionMotion] = useState({ scope, dir: null });
  if (seccionMotion.scope !== scope) {
    const desde = ORDEN_ALCANCES.indexOf(seccionMotion.scope);
    const hasta = ORDEN_ALCANCES.indexOf(scope);
    setSeccionMotion({ scope, dir: hasta > desde ? "forward" : "back" });
  }
  // Controles de Hoy, en la misma barra (Quién · Día · Agrupar).
  const [hoyQuien, setHoyQuien] = useState(initialToday.scope || "following");
  const [hoyDia, setHoyDia] = useState(initialToday.day || "today");
  const [hoyAgrupar, setHoyAgrupar] = useState(initialToday.group || "title");
  const [hoyDias, setHoyDias] = useState(initialToday.data?.days || null);
  // Entrada sin elegir nada y sin datos del servidor: con los primeros
  // recuentos, un «Hoy» vacío pasa a la Semana y una semana vacía a Siguiendo
  // (lo mismo que decide page.jsx cuando sí los tiene). Solo una vez y solo si
  // no se ha tocado nada todavía.
  const autoLandingRef = useRef(initialToday.autoLanding || null);
  useEffect(() => {
    const auto = autoLandingRef.current;
    if (!auto || !hoyDias) return;
    autoLandingRef.current = null;
    if (scope !== "today" || hoyDia !== "today") return;
    const landing = defaultSocialLanding(hoyDias);
    if (landing === "activity" && auto.view) setScope("following");
    else if (landing !== "today") setHoyDia("week");
    // Solo reacciona a la llegada de los recuentos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoyDias]);
  // Se lee tras montar (no en el estado inicial) para que el HTML del servidor y
  // el primer render del cliente coincidan.
  const [hoyVista, setHoyVistaState] = useState(VISTA_HOY_POR_DEFECTO);
  useEffect(() => {
    try {
      const guardada = window.localStorage.getItem(CLAVE_VISTA_HOY);
      if (VISTAS_HOY.some(([v]) => v === guardada)) setHoyVistaState(guardada);
    } catch {
      // Sin almacenamiento: la lista.
    }
  }, []);
  const setHoyVista = useCallback((modo) => {
    setHoyVistaState(modo);
    try {
      window.localStorage.setItem(CLAVE_VISTA_HOY, modo);
    } catch {
      // Se queda solo para esta visita.
    }
  }, []);

  // La píldora «Hoy» del navbar enlaza a /social?story=…: estando en Siguiendo
  // o Yo, vuelve a Hoy para que el reproductor se abra.
  const searchParams = useSearchParams();
  const storyParam = searchParams.get("story");
  useEffect(() => {
    if (storyParam) setScope("today");
  }, [storyParam]);

  // URL compartible sin volver a pedir el RSC. Con ?story= pendiente se espera
  // a que TodayClient la consuma.
  useEffect(() => {
    if (storyParam) return;
    const href = esHoy
      ? todayHref({ scope: hoyQuien, day: hoyDia, group: hoyAgrupar })
      : `/social?view=${VISTA_DE_ALCANCE[scope]}`;
    if (`${window.location.pathname}${window.location.search}` !== href) {
      window.history.replaceState(window.history.state, "", href);
    }
  }, [esHoy, scope, hoyQuien, hoyDia, hoyAgrupar, storyParam]);
  // Un feed POR ALCANCE ("siguiendo" y "yo"). Antes había uno solo que se
  // vaciaba y se volvía a pedir en cada cambio: hasta que respondía la red se
  // seguía viendo la lista del otro alcance (y ya redactada como la nueva, con
  // o sin autor), y luego se sustituía de golpe. Con uno por alcance, volver a
  // una pestaña ya cargada es instantáneo y el otro se precarga en segundo
  // plano, así que el primer cambio tampoco espera.
  const [feeds, setFeeds] = useState({});
  const feedActual = feeds[scope] || FEED_VACIO;
  const { items, hasMore, offset, error } = feedActual;
  const loading = !feedActual.loaded;


  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState("all");
  const [orden, setOrden] = useState("recent");
  // Las MISMAS dos vistas que la Actividad del perfil: lista con avatar y
  // lista con póster.
  const [vista, setVistaState] = useState(leerVistaGuardada);
  // Agrupado, como en Historial/Favoritos/Pendientes. Por defecto sin agrupar:
  // un muro de actividad se lee en orden, y quien quiera cortarlo por días lo
  // pide.
  const [agrupar, setAgruparState] = useState(leerAgrupadoGuardado);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  // Compactado de la barra de escritorio midiendo lo que cabe (Favoritos).
  const toolbarSearchFitRef = usePageToolbarSearchFit();

  const filtersRef = useRef(null);
  const listaRef = useRef(null);
  const { isPinned: filtersPinned } = useStickyToolbarState(filtersRef);

  // Tarjetas que se elevan al pasar el cursor (`.sv-bar-lift`) y quedan en
  // parte DETRÁS de la barra fijada: su movimiento se ve a través del cristal,
  // que lo desenfoca y lo satura, y al barrer con el cursor las tarjetas de
  // justo debajo encendían y apagaban manchas de color sobre los controles.
  // Al entrar en una de ellas se mira si la tapa la barra y, si es así, se
  // marca con `data-sv-under-bar` para que no se mueva (regla en globals.css).
  const liftBajoBarraRef = useRef(null);
  const marcarLiftBajoBarra = useCallback((e) => {
    const target = e.target instanceof Element ? e.target : null;
    const lift = target?.closest(".sv-bar-lift") || target?.closest(".group")?.querySelector(".sv-bar-lift") || null;
    if (liftBajoBarraRef.current && liftBajoBarraRef.current !== lift) {
      liftBajoBarraRef.current.removeAttribute("data-sv-under-bar");
      liftBajoBarraRef.current = null;
    }
    const barra = filtersRef.current;
    if (!lift || !barra || barra.getAttribute("data-menu-pinned") !== "true") {
      lift?.removeAttribute("data-sv-under-bar");
      return;
    }
    if (lift.getBoundingClientRect().top < barra.getBoundingClientRect().bottom) {
      lift.setAttribute("data-sv-under-bar", "");
      liftBajoBarraRef.current = lift;
    } else {
      lift.removeAttribute("data-sv-under-bar");
    }
  }, []);

  const setVista = useCallback((modo) => {
    setVistaState(modo);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CLAVE_VISTA, modo);
    }
  }, []);

  const setAgrupar = useCallback((modo) => {
    setAgruparState(modo);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CLAVE_AGRUPADO, modo);
    }
  }, []);

  // REANCLAJE DE LA LISTA AL USAR EL MENÚ.
  //
  // La barra de filtros es sticky y sus controles son de cristal: lo que queda
  // DETRÁS de ellos se ve difuminado, que es justo el efecto que se busca al
  // desplazarse. El problema aparece al cambiar de vista (o de filtro) estando
  // desplazado: la lista cambia de alto, el navegador recorta el scroll y las
  // PRIMERAS tarjetas acaban debajo del cristal, así que el contenido empieza
  // con una banda difuminada.
  //
  // Al pulsar el menú se devuelve la lista a su inicio, justo por debajo de la
  // barra. Si ya se veía entera no se toca el scroll: solo corrige el caso en
  // que el principio del contenido ha quedado tapado.
  const reanclarLista = useCallback(() => {
    if (typeof window === "undefined") return;
    const ajustar = () => {
      const lista = listaRef.current;
      const barra = filtersRef.current;
      if (!lista || !barra) return;
      const HUECO = 12;
      const limite = barra.getBoundingClientRect().bottom + HUECO;
      const arriba = lista.getBoundingClientRect().top;
      if (arriba >= limite - 1) return;
      window.scrollTo({ top: Math.max(0, window.scrollY + arriba - limite) });
    };
    ajustar();
    // Segunda pasada al fotograma siguiente: al acortarse mucho la página (por
    // ejemplo lista -> carteles) el navegador reajusta el scroll DESPUÉS de
    // este efecto, y sin corregirlo la lista vuelve a quedarse bajo el cristal.
    window.requestAnimationFrame(ajustar);
  }, []);

  // Última petición lanzada por alcance: una respuesta que llega tarde (por
  // alternar rápido o por una revalidación solapada) no pisa a una más nueva.
  const peticionRef = useRef({});
  const feedsRef = useRef(feeds);
  useLayoutEffect(() => {
    feedsRef.current = feeds;
  }, [feeds]);

  const cargar = useCallback(
    async ({ scope: alcance, offset: desde = 0, append = false } = {}) => {
      if (!session || !account?.id) return;
      const peticion = (peticionRef.current[alcance] || 0) + 1;
      peticionRef.current[alcance] = peticion;
      const marcar = (cambios) =>
        setFeeds((prev) => ({
          ...prev,
          [alcance]: { ...(prev[alcance] || FEED_VACIO), ...cambios },
        }));
      try {
        const res = await fetch(
          `/api/users/feed?scope=${alcance}&limit=${PAGE_SIZE}&offset=${desde}`,
          { credentials: "include", cache: "no-store" },
        );
        const json = await res.json().catch(() => ({}));
        if (peticionRef.current[alcance] !== peticion) return;
        if (!res.ok) {
          // Un fallo NO vacía el feed: se conserva lo que hubiera (mismo
          // criterio que las listas de usuario).
          marcar({ loaded: true, error: "No se pudo cargar la actividad." });
          return;
        }
        const nuevos = Array.isArray(json?.items) ? json.items : [];
        setFeeds((prev) => {
          const previo = prev[alcance] || FEED_VACIO;
          return {
            ...prev,
            [alcance]: {
              items: append ? [...previo.items, ...nuevos] : nuevos,
              hasMore: !!json?.hasMore,
              offset: Number(json?.offset) || desde + nuevos.length,
              loaded: true,
              error: "",
            },
          };
        });
      } catch {
        if (peticionRef.current[alcance] !== peticion) return;
        marcar({ loaded: true, error: "No se pudo cargar la actividad." });
      }
    },
    [session, account?.id],
  );

  // Otra cuenta (cerrar sesión y entrar con otra sin salir de la página): las
  // listas guardadas son del usuario anterior y no deben verse ni revalidarse.
  const cuentaId = account?.id ?? null;
  const cuentaPreviaRef = useRef(cuentaId);
  useEffect(() => {
    if (cuentaPreviaRef.current === cuentaId) return;
    cuentaPreviaRef.current = cuentaId;
    peticionRef.current = {};
    feedsRef.current = {};
    setFeeds({});
  }, [cuentaId]);

  // Al entrar en un alcance: si ya estaba cargado se enseña TAL CUAL y se
  // revalida en segundo plano (solo si no se ha paginado: sustituir por la
  // primera página tiraría lo que el usuario ya cargó con "Cargar más"). Si no
  // estaba, se pide.
  useEffect(() => {
    if (scope === "today") return;
    const previo = feedsRef.current[scope];
    if (!previo?.loaded || previo.offset <= PAGE_SIZE) {
      cargar({ scope, offset: 0 });
    }
  }, [cargar, scope]);

  // Precarga del OTRO alcance en cuanto el actual ha llegado, para que el
  // primer cambio de pestaña ya encuentre su lista.
  const actualCargado = feedActual.loaded;
  useEffect(() => {
    if (!actualCargado || scope === "today") return;
    const otro = scope === "following" ? "me" : "following";
    if (!feedsRef.current[otro] && !peticionRef.current[otro]) {
      cargar({ scope: otro, offset: 0 });
    }
  }, [actualCargado, scope, cargar]);

  // Desde Actividad se precargan las dos listas en un hueco libre: si no,
  // el primer cambio a Siguiendo o Yo entraba vacío y la lista aparecía de
  // golpe al llegar la respuesta, sin la entrada de la sección.
  useEffect(() => {
    if (scope !== "today" || !session || !account?.id) return undefined;
    const precargar = () => {
      for (const alcance of ["following", "me"]) {
        if (!feedsRef.current[alcance] && !peticionRef.current[alcance]) {
          cargar({ scope: alcance, offset: 0 });
        }
      }
    };
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(precargar, { timeout: 2500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(precargar, 1200);
    return () => window.clearTimeout(id);
  }, [scope, session, account?.id, cargar]);


  // Los cuatro valores del menú solo cambian pulsándolo, así que basta con
  // observarlos para saber que hay que reanclar.
  const primerRender = useRef(true);
  const reanclajePendiente = useRef(false);
  useLayoutEffect(() => {
    if (primerRender.current) {
      primerRender.current = false;
      return;
    }
    reanclajePendiente.current = true;
  }, [vista, agrupar, filtro, orden, scope, hoyQuien, hoyDia, hoyAgrupar]);

  // Se reancla en cuanto hay lista que reanclar. Sin lista de dependencias a
  // propósito: al cambiar de alcance el feed se recarga y en ese commit todavía
  // no hay lista, así que hay que reintentarlo en el siguiente. El trabajo real
  // lo protege la bandera. Va en useLayoutEffect porque con useEffect el
  // navegador llega a pintar un fotograma con la lista bajo el cristal.
  useLayoutEffect(() => {
    if (!reanclajePendiente.current || !listaRef.current) return;
    reanclajePendiente.current = false;
    reanclarLista();
  });

  const filtrados = useMemo(() => {
    const texto = q.trim().toLowerCase();
    let lista = items.filter((evento) => {
      if (filtro !== "all" && tipoDeFiltro(evento) !== filtro) return false;
      if (!texto) return true;
      const titulo = (evento.title || evento.name || "").toLowerCase();
      const autor = (evento.author?.displayName || "").toLowerCase();
      return titulo.includes(texto) || autor.includes(texto);
    });
    if (orden === "oldest") {
      lista = [...lista].sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
      );
    }
    return lista;
  }, [items, q, filtro, orden]);

  // Lista con póster: como en el perfil, fuera las acciones sin portada (una
  // lista creada, por ejemplo), que dejarían un hueco vacío en lugar del cartel.
  // Con backdrop entran también las que tienen backdrop de título, colección o
  // estantería de lista.
  const visibles = useMemo(() => {
    const conCartel = (evento) => typeof evento.posterPath === "string" && evento.posterPath.trim();
    if (vista === "poster-list") return filtrados.filter(conCartel);
    if (vista === "backdrop-list") return filtrados.filter(hasActivityBackdropArtwork);
    return filtrados;
  }, [filtrados, vista]);

  // `null` cuando no hay que agrupar: quien pinta decide entre una sola rejilla
  // y una cabecera por grupo sin mirar longitudes.
  const grupos = useMemo(
    () => groupSocialFeed(visibles, agrupar, { orden }),
    [visibles, agrupar, orden],
  );
  // Índice global de la primera fila de cada grupo, para la cascada continua.
  const inicioDeGrupo = useMemo(() => {
    const inicios = [];
    let acumulado = 0;
    for (const grupo of grupos || []) {
      inicios.push(acumulado);
      acumulado += grupo.items.length;
    }
    return inicios;
  }, [grupos]);

  // Sin sesión lo resuelve SocialHub.
  if (!hydrated || !session || !account?.id) return null;

  const controlGlass =
    "bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg";
  const activo = "bg-gradient-to-br from-pink-500 to-fuchsia-600 text-white shadow-lg shadow-pink-500/20";

  // Desplegables de Hoy. Cada día lleva el recuento de su pestaña en una
  // insignia (como Portadas y fondos); el botón muestra solo el día. «Ayer» es
  // el primer día anterior y el resto de la semana va por su nombre.
  const cuenta = (key) => hoyDias?.find((d) => d.key === key)?.count;
  const diaValor = hoyDia === "yesterday" ? hoyDias?.[1]?.key || "yesterday" : hoyDia;
  const opcionesDia = [
    ["today", "Hoy", cuenta("today")],
    ...(hoyDias || [])
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.key))
      .map((d, i) => [d.key, dayTabLabel(d.key, i + 1), d.count]),
    ["week", "Semana", cuenta("week")],
  ];
  if (!opcionesDia.some(([v]) => v === diaValor)) {
    opcionesDia.splice(1, 0, [diaValor, diaValor === "yesterday" ? "Ayer" : diaValor]);
  }
  const OPCIONES_QUIEN = [
    ["following", "Siguiendo"],
    ["community", "Comunidad"],
  ];
  const OPCIONES_AGRUPAR_HOY = [
    ["title", "Por título"],
    ["person", "Por persona"],
    ["time", "Por hora"],
  ];
  const selectorQuien = (props = {}) => (
    <SelectorSimple icon={Globe2} label="Quién" opciones={OPCIONES_QUIEN} valor={hoyQuien} onChange={setHoyQuien} {...props} />
  );
  const selectorDia = (props = {}) => (
    <SelectorSimple icon={CalendarDays} label="Día" opciones={opcionesDia} valor={diaValor} onChange={setHoyDia} {...props} />
  );
  const selectorAgruparHoy = (props = {}) => (
    <SelectorSimple icon={Layers3} label="Agrupar" opciones={OPCIONES_AGRUPAR_HOY} valor={hoyAgrupar} onChange={setHoyAgrupar} {...props} />
  );
  const placeholder = esHoy ? "Buscar en Hoy..." : "Buscar en la actividad...";

  return (
    <div onPointerOver={marcarLiftBajoBarra}>
      <div className="relative">

        {/* BARRA DE FILTROS (sticky, con el cristal del navbar al fijarse) */}
        <motion.div
          ref={filtersRef}
          data-menu-pinned={filtersPinned}
          // Como la de Favoritos e Historial: framer solo funde y la subida va
          // en CSS (`.sv-toolbar-rise`, con `translate`). Animar `y` con framer
          // bajo `transition-all` hacía que CSS persiguiera cada fotograma.
          className={`${isBackNav ? "" : "sv-toolbar-rise "}relative sticky top-[calc(3.5rem+var(--sv-safe-top,0px))] z-[70] mb-6 space-y-1 ${isBackNav ? "transition-none" : "transition-all duration-300"} sm:top-[calc(5rem+var(--sv-safe-top,0px))] sm:mb-5 lg:mb-6`}
          initial={isBackNav ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={isBackNav ? { duration: 0 } : { duration: 0.4, delay: 0.3 }}
        >
          {/* Móvil: buscador + desplegar filtros */}
          <div className="relative z-10 flex gap-2 lg:hidden">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-pink-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={placeholder}
                className={`h-11 w-full rounded-2xl py-2.5 pl-10 pr-10 text-sm text-white transition-all placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-pink-500/50 ${controlGlass}`}
              />
              {q ? (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 transition-colors hover:bg-white/10"
                >
                  <X className="h-3.5 w-3.5 text-zinc-400" />
                </button>
              ) : null}
            </div>
            {/* Alcance entre el buscador y el botón de filtros, SOLO iconos: es
                el control que más se usa —decide qué feed estás viendo— y así
                está a un toque sin desplegar nada ni gastar ancho en rótulos. */}
            <SelectorAlcance
              scope={scope}
              setScope={elegirScope}
              controlGlass={controlGlass}
              activo={activo}
              soloIconos
            />
            <button
              type="button"
              onClick={() => setMobileFiltersOpen((v) => !v)}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-all ${controlGlass} ${
                mobileFiltersOpen
                  ? "text-pink-400 shadow-[0_0_15px_rgba(236,72,153,0.3)]"
                  : "text-zinc-200 hover:bg-black/30"
              }`}
              aria-label="Filtros"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          </div>

          {/* La MISMA hoja de filtros que las páginas de usuario. */}
          <MobileOptionsSheet
            open={mobileFiltersOpen}
            onClose={() => setMobileFiltersOpen(false)}
            accent="pink"
          >
            {esHoy ? (
              <>
                {selectorQuien()}
                {selectorDia()}
                {selectorAgruparHoy()}
                <SelectorVista
                  vista={hoyVista}
                  setVista={setHoyVista}
                  opciones={VISTAS_HOY}
                  controlGlass={controlGlass}
                  activo={activo}
                />
              </>
            ) : (
              <>
                <SelectorSimple
                  icon={Filter}
                  label="Acción"
                  opciones={FILTROS}
                  valor={filtro}
                  onChange={setFiltro}
                />
                <SelectorSimple
                  icon={ArrowUpDown}
                  label="Orden"
                  opciones={[
                    ["recent", "Reciente"],
                    ["oldest", "Antiguo"],
                  ]}
                  valor={orden}
                  onChange={setOrden}
                />
                <SelectorSimple
                  icon={Layers3}
                  label="Agrupar"
                  opciones={SOCIAL_GROUP_OPTIONS}
                  valor={agrupar}
                  onChange={setAgrupar}
                />
                <SelectorVista
                  vista={vista}
                  setVista={setVista}
                  controlGlass={controlGlass}
                  activo={activo}
                />
              </>
            )}
          </MobileOptionsSheet>

          {/* Escritorio: todo en una fila, la MISMA barra que Favoritos e
              Historial (`.sv-page-toolbar`): al estrecharse, los desplegables
              pierden rótulo y luego valor, y el buscador pasa a lupa midiendo
              lo que cabe (usePageToolbarSearchFit). */}
          <div ref={toolbarSearchFitRef} className="sv-page-toolbar relative z-10 hidden gap-3 lg:flex">
            {/* El selector de alcance abre la barra: es el control que decide
                QUÉ se está viendo, así que va antes que los filtros. */}
            <SelectorAlcance
              scope={scope}
              setScope={elegirScope}
              controlGlass={controlGlass}
              activo={activo}
            />
            <div className="sv-page-toolbar-search relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-pink-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={placeholder}
                className={`h-11 w-full rounded-2xl py-2.5 pl-10 pr-10 text-sm text-white transition-all placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-pink-500/50 ${controlGlass}`}
              />
              {q ? (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 transition-colors hover:bg-white/10"
                >
                  <X className="h-3.5 w-3.5 text-zinc-400" />
                </button>
              ) : null}
            </div>
            {esHoy ? (
              <>
                {selectorQuien()}
                {selectorDia()}
                {selectorAgruparHoy()}
                <SelectorVista
                  vista={hoyVista}
                  setVista={setHoyVista}
                  opciones={VISTAS_HOY}
                  controlGlass={controlGlass}
                  activo={activo}
                />
              </>
            ) : (
              <>
                <SelectorSimple
                  icon={Filter}
                  label="Acción"
                  opciones={FILTROS}
                  valor={filtro}
                  onChange={setFiltro}
                />
                <SelectorSimple
                  icon={Layers3}
                  label="Agrupar"
                  opciones={SOCIAL_GROUP_OPTIONS}
                  valor={agrupar}
                  onChange={setAgrupar}
                />
                <SelectorSimple
                  icon={ArrowUpDown}
                  label="Orden"
                  opciones={[
                    ["recent", "Reciente"],
                    ["oldest", "Antiguo"],
                  ]}
                  valor={orden}
                  onChange={setOrden}
                />
                <SelectorVista
                  vista={vista}
                  setVista={setVista}
                  controlGlass={controlGlass}
                  activo={activo}
                />
              </>
            )}
          </div>
        </motion.div>

        {/* La `key` remonta la sección en cada cambio y su entrada CSS
            (`.sv-section-switch`) vuelve a correr. */}
        <div
          key={scope}
          className={seccionMotion.dir ? "sv-section-switch" : undefined}
          data-tab-dir={seccionMotion.dir ?? undefined}
        >
        {esHoy ? (
          <div ref={listaRef}>
            <TodayClient
              scope={hoyQuien}
              day={hoyDia}
              group={hoyAgrupar}
              layout={hoyVista}
              query={q}
              onScopeChange={setHoyQuien}
              onDayChange={setHoyDia}
              onDaysChange={setHoyDias}
              onSummaryChange={onTodaySummary}
              initialScope={initialToday.scope}
              initialDay={initialToday.day}
              initialData={initialToday.data}
            />
          </div>
        ) : null}

        {!esHoy && error ? (
          <p className="mb-4 text-sm text-pink-300">{error}</p>
        ) : null}

        {esHoy ? null : loading && items.length === 0 ? null : visibles.length === 0 ? (
          <motion.div
            className="rounded-3xl border border-dashed border-zinc-800 bg-zinc-900/20 py-24 text-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
          >
            <Users className="mx-auto mb-4 h-16 w-16 text-zinc-800" />
            <p className="font-medium text-zinc-500">
              {filtrados.length > 0
                ? "No hay acciones con portada para mostrar."
                : scope === "following"
                  ? "Todavía no hay actividad de las cuentas que sigues."
                  : "Todavía no tienes actividad."}
            </p>
            {scope === "following" && filtrados.length === 0 ? (
              <Link
                href="/members"
                className="mt-4 inline-block text-sm font-bold text-pink-400 hover:underline"
              >
                Descubrir miembros
              </Link>
            ) : null}
          </motion.div>
        ) : (
          <>
            {/* Con agrupado, una cabecera por grupo y su propia rejilla debajo,
                igual que en las páginas de usuario. Sin agrupado, una sola. */}
            {/* La `key` remonta la lista al cambiar de sección o de vista para
                que vuelva a entrar en cascada, como en las páginas de usuario. */}
            <div ref={listaRef} key={`${scope}:${vista}:${agrupar}`}>
              {grupos ? (
                <div className="space-y-8">
                  {grupos.map((grupo, indice) => (
                    <div key={grupo.key}>
                      <GrupoDivisor
                        titulo={grupo.label}
                        cuenta={grupo.items.length}
                        total={visibles.length}
                        primero={indice === 0}
                        isBackNav={isBackNav}
                      />
                      <ListaEventos
                        eventos={grupo.items}
                        vista={vista}
                        mostrarAutor={scope === "following"}
                        yo={account}
                        inicio={inicioDeGrupo[indice]}
                        total={visibles.length}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <ListaEventos
                  eventos={visibles}
                  vista={vista}
                  mostrarAutor={scope === "following"}
                  yo={account}
                />
              )}
            </div>

            {hasMore ? (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={() => cargar({ scope, offset, append: true })}
                  className={`rounded-2xl px-6 py-3 text-sm font-bold text-white transition-all ${controlGlass} hover:bg-white/10`}
                >
                  Cargar más
                </button>
              </div>
            ) : null}
          </>
        )}
        </div>
      </div>
    </div>
  );
}

// Botón Hoy / Siguiendo / Yo: el control que pide la sección.
function SelectorAlcance({
  scope,
  setScope,
  controlGlass,
  activo,
  fill = false,
  soloIconos = false,
}) {
  // La pastilla de la activa se desliza de un botón a otro, como en En
  // progreso · Completadas (WatchingSectionNav).
  //
  // El botón pulsado se marca AQUÍ, en un estado del selector, y la sección
  // llega después en una transición (`setScope`): montar Actividad o una
  // lista larga cuesta, y si el clic tuviera que volver a pintar toda la
  // página antes de mover la pastilla, esta saldría con retraso o a tirones.
  const [elegido, setElegido] = useState(null);
  const activa = elegido ?? scope;
  useEffect(() => {
    setElegido(null);
  }, [scope]);
  const navRef = useRef(null);
  const { ready, indicator } = useSlidingSectionIndicator({
    navRef,
    activeKey: activa,
    groupId: soloIconos ? "social-scope-mobile" : "social-scope",
    className: activo,
  });
  return (
    <div
      ref={navRef}
      className={`relative flex h-11 items-center rounded-2xl p-1 ${
        fill ? "min-w-0 flex-1" : "shrink-0"
      } ${controlGlass}`}
    >
      {indicator}
      {[
        ["today", "Actividad", Flame],
        ["following", "Siguiendo", Users],
        ["me", "Yo", User],
      ].map(([valor, etiqueta, Icono]) => (
        <button
          key={valor}
          type="button"
          data-section-key={valor}
          onClick={() => {
            setElegido(valor);
            setScope(valor);
          }}
          aria-pressed={activa === valor}
          // En la barra móvil va solo el icono: el rótulo se lo comería el
          // buscador. El nombre sigue estando para lectores de pantalla.
          aria-label={soloIconos ? etiqueta : undefined}
          title={soloIconos ? etiqueta : undefined}
          className={`relative z-10 flex h-full items-center justify-center rounded-xl text-sm font-bold transition-colors ${
            soloIconos ? "w-9" : "flex-1 gap-2 px-3"
          } ${
            activa === valor
              ? `text-white ${ready ? "" : activo}`
              : "text-zinc-400 hover:bg-white/10 hover:text-white"
          }`}
        >
          <Icono className="h-4 w-4 shrink-0" />
          {soloIconos ? null : <span className="truncate">{etiqueta}</span>}
        </button>
      ))}
    </div>
  );
}

// Desplegable con el MISMO comportamiento que el de Historial.
//
// El menú se renderiza POR PORTAL en <body> con `position: fixed` calculado
// desde el botón: el panel de filtros tiene `backdrop-filter`, que crea un
// contexto de apilamiento, y un menú `absolute` dentro quedaría recortado por
// él. Con el portal siempre se ve por encima de todo.
// Dentro de la hoja de filtros móvil (MobileOptionsSheet) el desplegable se
// pinta como un grupo con todas sus opciones a la vista.
function InlineDropdown(props) {
  if (useInOptionsSheet()) {
    return <SheetOptionGroup label={props.label} icon={props.icon}>{props.children}</SheetOptionGroup>;
  }
  return <InlineDropdownMenu {...props} />;
}

function InlineDropdownMenu({
  label,
  valueLabel,
  mobileValueLabel = null,
  icon: Icon,
  children,
  compactMobile = false,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState(null);

  // Igual que en Favoritos: el menú mide lo que su CONTENIDO, nunca menos que
  // su botón (que en la barra estrecha se queda en un icono) ni más que la
  // ventana.
  const updateMenuPosition = useCallback(() => {
    if (!buttonRef.current || typeof window === "undefined") return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuMaxWidth = window.innerWidth - 24;
    const measured = menuRef.current?.offsetWidth || rect.width;
    const left = Math.min(
      Math.max(12, rect.left),
      Math.max(12, window.innerWidth - Math.min(measured, menuMaxWidth) - 12),
    );
    const availableBelow = window.innerHeight - rect.bottom - 12;
    setMenuStyle({
      position: "fixed",
      top: rect.bottom + 8,
      left,
      width: "max-content",
      minWidth: rect.width,
      maxWidth: menuMaxWidth,
      maxHeight: Math.max(64, Math.min(448, availableBelow)),
      zIndex: 1000,
    });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    updateMenuPosition();
    const frame = window.requestAnimationFrame(updateMenuPosition);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  return (
    <div ref={ref} className="relative w-full min-w-0 lg:w-auto lg:shrink">
      {/* El botón de la barra de Favoritos: las clases `sv-page-toolbar-*`
          dejan que la barra lo compacte (sin rótulo, luego solo icono). */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`${label}: ${valueLabel}`}
        className="sv-page-toolbar-trigger inline-flex h-11 w-full min-w-0 items-center justify-between gap-3 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 px-4 text-sm text-zinc-200 shadow-lg backdrop-blur-lg transition hover:from-white/15 hover:to-white/10 lg:w-auto lg:min-w-[140px] lg:max-w-none"
      >
        <div className="flex min-w-0 items-center gap-2">
          {Icon ? <Icon className="h-4 w-4 shrink-0 text-pink-500" /> : null}
          <span
            className={`sv-page-toolbar-label text-xs font-bold uppercase tracking-wider text-zinc-500 ${
              compactMobile ? "hidden sm:inline" : ""
            }`}
          >
            {label}:
          </span>
          <span className="sv-page-toolbar-value hidden min-w-0 truncate font-semibold text-white sm:inline lg:overflow-visible lg:whitespace-nowrap">
            {valueLabel}
          </span>
          <span className="sv-page-toolbar-value min-w-0 truncate font-semibold text-white sm:hidden">
            {mobileValueLabel || valueLabel}
          </span>
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && menuStyle ? (
              <motion.div
                ref={menuRef}
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
                className="flex flex-col overflow-hidden rounded-2xl bg-black/40 bg-gradient-to-br from-white/10 to-white/5 p-2 shadow-2xl backdrop-blur-2xl"
                style={menuStyle}
              >
                <div
                  className="min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-color:#3f3f46_transparent]"
                  style={{ scrollbarWidth: "thin" }}
                >
                  {children({ close: () => setOpen(false) })}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}

// Dentro de la hoja de filtros móvil, cada opción es una píldora.
function DropdownItem(props) {
  if (useInOptionsSheet()) {
    return <SheetOption active={props.active} onClick={props.onClick} count={props.count}>{props.children}</SheetOption>;
  }
  return <DropdownMenuItem {...props} />;
}

// `count`: insignia con el número de elementos de la opción, la misma de
// CreditFilterControls (Portadas y fondos).
function DropdownMenuItem({ active, onClick, children, count = null }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-6 rounded-xl px-3 py-2 text-left text-sm transition ${
        active
          ? "bg-white/10 font-bold text-white"
          : "text-zinc-300 hover:bg-white/5 hover:text-white"
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="whitespace-nowrap font-medium">{children}</span>
        {count != null ? (
          // `pt-px`: centra las cifras de PT Sans (ver SheetOption).
          <span className="inline-flex min-h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.08] px-1.5 pt-px text-[11px] font-bold tabular-nums leading-none text-zinc-400">
            {count}
          </span>
        ) : null}
      </span>
      {active ? <CheckCircle2 className="h-4 w-4 shrink-0 text-pink-500" /> : null}
    </button>
  );
}

// Envoltorio: mismo desplegable con una lista simple de opciones.
//
// `etiquetasCortas` da una versión abreviada del valor para cuando el botón va
// a media fila en el móvil ("Sin agr." en vez de "Sin agrupar"), igual que hace
// el desplegable de agrupar de las páginas de usuario.
function SelectorSimple({
  icon,
  label,
  opciones,
  valor,
  onChange,
  compactMobile = false,
  etiquetasCortas = null,
}) {
  const actual = opciones.find(([v]) => v === valor)?.[1] || opciones[0][1];
  const corta = etiquetasCortas?.[valor];
  return (
    <InlineDropdown
      label={label}
      valueLabel={actual}
      mobileValueLabel={corta}
      icon={icon}
      compactMobile={compactMobile}
    >
      {({ close }) => (
        <>
          {opciones.map(([v, etiqueta, count]) => (
            <DropdownItem
              key={v}
              active={valor === v}
              count={typeof count === "number" ? count : null}
              onClick={() => {
                onChange(v);
                close();
              }}
            >
              {etiqueta}
            </DropdownItem>
          ))}
        </>
      )}
    </InlineDropdown>
  );
}

// Cabecera de grupo con la misma forma que la de las páginas de usuario:
// pastilla de cristal, barra de color de la sección, título y recuento.
function GrupoDivisor({ titulo, cuenta, total, primero, isBackNav }) {
  const porcentaje = total > 0 ? Math.round((cuenta / total) * 100) : 0;
  return (
    <motion.div
      className={primero ? "mb-4 mt-0 sm:mb-6" : "mb-4 sm:mb-6"}
      initial={isBackNav ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={isBackNav ? { duration: 0 } : { duration: 0.4, ease: "easeOut" }}
    >
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-white/10 to-white/5 shadow-xl backdrop-blur-lg">
        <div className="relative flex items-center gap-2 px-3 py-2.5 sm:gap-4 sm:px-6 sm:py-5">
          <div className="h-8 w-1 shrink-0 rounded-full bg-gradient-to-b from-pink-500 to-fuchsia-600 shadow-[0_0_15px_rgba(236,72,153,0.4)] sm:h-12 sm:w-1.5" />
          <div className="min-w-0 flex-1">
            <h2 className="line-clamp-1 text-base font-black leading-tight tracking-tight text-white sm:text-2xl">
              {titulo}
            </h2>
            <div className="mt-0.5 flex items-center gap-x-1.5 text-[10px] font-medium text-zinc-500 sm:mt-1 sm:gap-x-2 sm:text-sm">
              <span className="font-bold text-zinc-300">{cuenta}</span>
              <span>{cuenta === 1 ? "actividad" : "actividades"}</span>
              <span className="h-0.5 w-0.5 rounded-full bg-zinc-700 sm:h-1 sm:w-1" />
              <span className="opacity-90">{porcentaje}%</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function SelectorVista({ vista, setVista, controlGlass, activo, fill = false, opciones = VISTAS_FEED }) {
  // En la hoja de filtros móvil, las vistas como píldoras con su nombre.
  if (useInOptionsSheet()) {
    return (
      <SheetOptionGroup label="Vista" icon={LayoutGrid}>
        {opciones.map(([valor, Icono, etiqueta]) => (
          <SheetOption key={valor} icon={Icono} active={vista === valor} onClick={() => setVista(valor)}>
            {etiqueta}
          </SheetOption>
        ))}
      </SheetOptionGroup>
    );
  }
  return (
    <div
      className={`flex h-11 items-center rounded-2xl p-1 ${fill ? "min-w-0 flex-1" : "shrink-0"} ${controlGlass}`}
    >
      {opciones.map(([valor, Icono, etiqueta]) => (
        <button
          key={valor}
          type="button"
          onClick={() => setVista(valor)}
          aria-label={`Vista ${etiqueta}`}
          title={etiqueta}
          className={`flex h-full flex-1 items-center justify-center rounded-xl px-2.5 text-sm font-bold transition-all ${
            vista === valor
              ? activo
              : "text-zinc-400 hover:bg-white/10 hover:text-white"
          }`}
        >
          <Icono className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}
