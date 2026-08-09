"use client";

// src/app/social/SocialClient.jsx
//
// SECCIÓN SOCIAL: la actividad de las cuentas que sigo y la mía.
//
// Comparte la maqueta de las páginas de usuario (Favoritos, Pendientes,
// Historial…): fondo con manchas difuminadas del color de la sección, cabecera
// con rótulo + título + tarjetas de recuento, y una barra de filtros STICKY que
// toma el cristal del navbar al fijarse (`data-menu-pinned`, ver globals.css).
// El color propio de esta sección es el ROSA/FUCSIA; los demás ya estaban
// cogidos: rojo (Favoritos), azul (Pendientes), esmeralda (Historial y En
// progreso), ámbar (Biblioteca) y morado (Listas).

import {
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
  Activity,
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  Columns3,
  Eye,
  Filter,
  Heart,
  Layers3,
  LayoutGrid,
  LayoutList,
  ListVideo,
  MessageSquare,
  Search,
  SlidersHorizontal,
  Star,
  User,
  Users,
  UserRoundCheck,
  Bookmark,
  X,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import useStickyToolbarState from "@/hooks/useStickyToolbarState";
import { useIsHistoryNavigation } from "@/lib/hooks/useIsHistoryNavigation";
import {
  SOCIAL_GROUP_OPTIONS,
  SOCIAL_GROUP_SHORT_LABELS,
  groupSocialFeed,
} from "@/lib/social/feedGrouping";

const PAGE_SIZE = 30;

// Cada tipo de evento con su verbo, icono y color. El color solo tiñe el icono:
// el acento de la sección es el rosa y no compite con él.
const EVENTOS = {
  watched: { verbo: "ha visto", icon: Eye, color: "text-emerald-400" },
  watchlist: { verbo: "ha añadido a pendientes", icon: Bookmark, color: "text-blue-400" },
  favorite: { verbo: "ha marcado como favorito", icon: Heart, color: "text-red-400" },
  rating: { verbo: "ha puntuado", icon: Star, color: "text-yellow-400" },
  review: { verbo: "ha reseñado", icon: MessageSquare, color: "text-orange-400" },
  list: { verbo: "ha creado la lista", icon: ListVideo, color: "text-purple-400" },
  list_item: { verbo: "ha añadido a una lista", icon: ListVideo, color: "text-purple-400" },
};

const FILTROS = [
  ["all", "Todo"],
  ["watched", "Visionados"],
  ["rating", "Puntuaciones"],
  ["review", "Reseñas"],
  ["favorite", "Favoritos"],
  ["watchlist", "Pendientes"],
  ["list", "Listas"],
];

// Vista y agrupado se RECUERDAN entre visitas, como en las páginas de usuario:
// quien elige tarjetas espera encontrárselas la próxima vez.
const CLAVE_VISTA = "showverse:social:viewMode";
const CLAVE_AGRUPADO = "showverse:social:groupBy";
const VISTAS = new Set(["list", "compact", "grid"]);

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

function tiempoRelativo(fecha) {
  const ms = Date.now() - new Date(fecha).getTime();
  if (!Number.isFinite(ms)) return "";
  const min = Math.round(ms / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const horas = Math.round(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  if (dias < 30) return `hace ${dias} d`;
  const meses = Math.round(dias / 30);
  if (meses < 12) return `hace ${meses} mes${meses === 1 ? "" : "es"}`;
  return `hace ${Math.round(meses / 12)} a`;
}

function tipoDeFiltro(evento) {
  // "Listas" agrupa la creación y los elementos añadidos: para quien lee el
  // feed son la misma acción.
  if (evento.type === "list_item") return "list";
  return evento.type;
}

// Anillo de hover de la sección, con la receta de las páginas de usuario: nada
// en reposo y un aro de 2,5px del color de la página al pasar por encima. OJO:
// va con `hover:after`, no con `group-hover:after` —el pseudoelemento es del
// propio `.group`, y `group-hover:` apunta a sus DESCENDIENTES—.
const ANILLO_HOVER =
  "after:pointer-events-none after:absolute after:inset-0 after:z-30 after:rounded-[inherit] after:content-[''] after:transition-shadow after:duration-300 hover:after:shadow-[inset_0_0_0_2.5px_rgba(236,72,153,0.95)]";

function EventoTarjeta({ evento, mostrarAutor, vista }) {
  const soloCartel = vista === "grid";
  const compacta = vista === "compact";
  const meta = EVENTOS[evento.type] || {
    verbo: "ha actualizado",
    icon: ListVideo,
    color: "text-zinc-400",
  };
  const Icono = meta.icon;
  const titulo = evento.title || evento.name || "Sin título";
  // TAMAÑO DE LA PORTADA SEGÚN LA VISTA. En las filas el cartel mide 44-56px,
  // así que w185 sobra; en la vista de tarjetas ocupa el ancho de la columna
  // (~210px en escritorio) y con w185 se veía pastoso al ampliarlo, más aún en
  // pantallas de 2x y 3x. w500 cubre esos casos sin traerse el original, que
  // pesa varios megas por cartel.
  const poster = evento.posterPath
    ? `https://image.tmdb.org/t/p/${soloCartel ? "w500" : "w185"}${evento.posterPath}`
    : null;
  const href =
    evento.tmdbId && evento.mediaType
      ? `/details/${evento.mediaType === "tv" ? "tv" : "movie"}/${evento.tmdbId}`
      : null;

  // VISTA DE TARJETAS: solo la portada, con la acción sobreimpresa. Es la que
  // se corresponde con el "grid" de las páginas de usuario —mismo formato de
  // cartel, mismas esquinas y mismo anillo de hover—, y la que de verdad se
  // diferencia de las dos de lista.
  if (soloCartel) {
    const contenido = (
      <div
        className={`group relative aspect-[2/3] overflow-hidden rounded-xl bg-zinc-900 shadow-md transition-shadow duration-300 ${ANILLO_HOVER}`}
      >
        {poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster} alt={titulo} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Icono className={`h-6 w-6 ${meta.color}`} />
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-2">
          <div className="flex items-center gap-1.5">
            <Icono className={`h-3 w-3 shrink-0 ${meta.color}`} />
            <span className="truncate text-[10px] font-bold uppercase tracking-wider text-zinc-300">
              {mostrarAutor && evento.author ? evento.author.displayName : tiempoRelativo(evento.createdAt)}
            </span>
          </div>
          <p className="truncate text-xs font-bold text-white">{titulo}</p>
        </div>
      </div>
    );
    return href ? (
      <Link href={href} prefetch={false} className="block">
        {contenido}
      </Link>
    ) : (
      contenido
    );
  }

  // VISTAS DE LISTA: la misma fila para las dos. La única diferencia es el
  // tamaño —"compact" mete tres por fila— porque son la MISMA vista con más o
  // menos densidad, igual que en las páginas de usuario.
  const cuerpo = (
    <div
      className={`relative isolate flex items-center overflow-hidden rounded-xl bg-zinc-900/40 shadow-md transition-colors duration-300 hover:bg-zinc-900/65 ${ANILLO_HOVER} ${
        compacta ? "gap-2.5 p-2" : "gap-3.5 p-3"
      }`}
    >
      <div
        className={`relative shrink-0 overflow-hidden rounded-lg bg-zinc-900 ${
          compacta ? "h-16 w-11" : "h-20 w-14"
        }`}
      >
        {poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={poster}
            alt={titulo}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Icono className={`h-5 w-5 ${meta.color}`} />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
          <Icono className={`h-3.5 w-3.5 shrink-0 ${meta.color}`} />
          <span className="truncate">
            {mostrarAutor && evento.author ? (
              <>
                <span className="text-pink-300">
                  {evento.author.displayName}
                </span>{" "}
                {meta.verbo}
              </>
            ) : (
              meta.verbo
            )}
          </span>
        </div>

        <p
          className={`truncate font-bold leading-tight text-white ${
            compacta ? "text-sm" : "text-sm sm:text-base"
          }`}
        >
          {titulo}
        </p>

        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
          <span>{tiempoRelativo(evento.createdAt)}</span>
          {typeof evento.rating === "number" ? (
            <span className="flex items-center gap-1 text-yellow-400">
              <Star className="h-3 w-3 fill-current" />
              {evento.rating}
            </span>
          ) : null}
          {evento.season != null && evento.episode != null ? (
            <span>
              T{evento.season}·E{evento.episode}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );

  return href ? (
    <Link href={href} prefetch={false} className="block">
      {cuerpo}
    </Link>
  ) : (
    cuerpo
  );
}

// Tarjeta de cifra de la cabecera. Es el mismo componente que las de Perfil
// (allí `CountStat`): mismas proporciones, mismo cristal y mismo enlace a las
// listas de seguidores/seguidos, para que las dos páginas no diverjan.
function TarjetaCifra({ value, label, href, title, icon: Icon, iconClassName = "text-pink-400" }) {
  const className =
    "relative flex min-w-0 flex-1 flex-col items-center justify-center overflow-hidden rounded-[2rem] bg-gradient-to-br from-white/10 to-white/5 px-4 py-3 text-center shadow-lg backdrop-blur-lg transition duration-300 hover:-translate-y-0.5 hover:from-white/[0.16] hover:to-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400/70 sm:min-w-[120px] sm:px-5 sm:py-4";
  const cuerpo = (
    <>
      <span className={`relative z-10 mb-1 inline-flex h-7 w-7 items-center justify-center ${iconClassName}`}>
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <span className="relative z-10 block text-xl font-black tracking-tight text-white drop-shadow-md sm:text-2xl lg:text-3xl">
        {/* Mientras no ha llegado el resumen se muestra un guion, no un 0:
            un cero es una cifra real y sería mentira. */}
        {typeof value === "number" ? value : "—"}
      </span>
      <span className="relative z-10 mt-0.5 block text-[9px] font-bold uppercase tracking-wider text-zinc-300 sm:text-[10px]">
        {label}
      </span>
    </>
  );
  if (href) {
    return (
      <Link href={href} prefetch={false} className={className} title={title}>
        {cuerpo}
      </Link>
    );
  }
  return (
    <div className={className} title={title}>
      {cuerpo}
    </div>
  );
}

export default function SocialClient() {
  const { session, account, hydrated } = useAuth();
  const isBackNav = useIsHistoryNavigation();

  const [scope, setScope] = useState("following");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");

  // Cifras de la cabecera. Van aparte del feed: no cambian al paginar ni al
  // alternar entre "siguiendo" y "yo", así que se piden una sola vez.
  const [summary, setSummary] = useState(null);

  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState("all");
  const [orden, setOrden] = useState("recent");
  // Las MISMAS tres vistas que las páginas de usuario: una fila por evento,
  // tres por fila, y tarjetas de cartel.
  const [vista, setVistaState] = useState(leerVistaGuardada);
  // Agrupado, como en Historial/Favoritos/Pendientes. Por defecto sin agrupar:
  // un muro de actividad se lee en orden, y quien quiera cortarlo por días lo
  // pide.
  const [agrupar, setAgruparState] = useState(leerAgrupadoGuardado);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  // Buscador de escritorio enfocado: mientras lo está, los desplegables sueltan
  // su rótulo y su ancho mínimo para dejarle sitio (comportamiento de Historial).
  const [desktopSearchFocused, setDesktopSearchFocused] = useState(false);

  const filtersRef = useRef(null);
  const listaRef = useRef(null);
  const panelRef = useRef(null);
  const { isSticky: filtersSticky, isPinned: filtersPinned } =
    useStickyToolbarState(filtersRef);

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
      // En móvil el desplegable de filtros cuelga POR DEBAJO de la barra (va en
      // `absolute`, así que no cuenta en su rectángulo). Mientras está abierto
      // es él quien marca dónde puede empezar la lista.
      const panel = panelRef.current;
      const limite =
        Math.max(
          barra.getBoundingClientRect().bottom,
          panel ? panel.getBoundingClientRect().bottom : 0,
        ) + HUECO;
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

  const cargar = useCallback(
    async ({ scope: alcance, offset: desde = 0, append = false } = {}) => {
      if (!session || !account?.id) {
        setLoading(false);
        return;
      }
      if (!append) setLoading(true);
      try {
        const res = await fetch(
          `/api/users/feed?scope=${alcance}&limit=${PAGE_SIZE}&offset=${desde}`,
          { credentials: "include", cache: "no-store" },
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          // Un fallo NO vacía el feed: se conserva lo que hubiera (mismo
          // criterio que las listas de usuario).
          setError("No se pudo cargar la actividad.");
          return;
        }
        setError("");
        const nuevos = Array.isArray(json?.items) ? json.items : [];
        setItems((prev) => (append ? [...prev, ...nuevos] : nuevos));
        setHasMore(!!json?.hasMore);
        setOffset(Number(json?.offset) || desde + nuevos.length);
      } catch {
        setError("No se pudo cargar la actividad.");
      } finally {
        setLoading(false);
      }
    },
    [session, account?.id],
  );

  useEffect(() => {
    cargar({ scope, offset: 0 });
  }, [cargar, scope]);

  useEffect(() => {
    if (!session || !account?.id) return undefined;
    let vigente = true;
    (async () => {
      try {
        const res = await fetch("/api/users/feed/summary", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return; // Un fallo conserva las cifras previas, no las pone a cero.
        const json = await res.json().catch(() => null);
        if (vigente && json?.summary) setSummary(json.summary);
      } catch {
        /* la cabecera se queda con lo que ya tuviera */
      }
    })();
    return () => {
      vigente = false;
    };
  }, [session, account?.id]);

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
  }, [vista, agrupar, filtro, orden, scope]);

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

  const visibles = useMemo(() => {
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

  // `null` cuando no hay que agrupar: quien pinta decide entre una sola rejilla
  // y una cabecera por grupo sin mirar longitudes.
  const grupos = useMemo(
    () => groupSocialFeed(visibles, agrupar, { orden }),
    [visibles, agrupar, orden],
  );

  if (!hydrated) return <div className="min-h-screen bg-black" />;

  if (!session || !account?.id) {
    return (
      <div className="min-h-screen bg-black text-zinc-100 font-sans">
        <div className="relative z-10 mx-auto max-w-[1600px] px-4 py-24 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-black tracking-tighter text-white">
            Social<span className="text-pink-500">.</span>
          </h1>
          <p className="mt-3 text-zinc-400">
            Inicia sesión para ver la actividad de la gente a la que sigues.
          </p>
          <Link
            href="/login?next=/social"
            className="mt-6 inline-block rounded-2xl bg-gradient-to-br from-pink-500 to-fuchsia-600 px-6 py-3 text-sm font-bold text-white shadow-lg"
          >
            INICIAR SESIÓN
          </Link>
        </div>
      </div>
    );
  }

  const perfilHref = account?.username
    ? `/u/${encodeURIComponent(account.username)}`
    : null;
  const controlGlass =
    "bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg";
  const activo = "bg-gradient-to-br from-pink-500 to-fuchsia-600 text-white shadow-lg shadow-pink-500/20";

  return (
    <div className="min-h-screen bg-black font-sans text-zinc-100 selection:bg-pink-500/30">
      {/* Manchas de color de la sección, igual que en las demás páginas */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[5%] aspect-square w-[60vw] max-w-[800px] rounded-full bg-pink-600/15 blur-[120px] sm:blur-[150px]" />
        <div className="absolute top-[15%] -right-[5%] aspect-square w-[55vw] max-w-[700px] rounded-full bg-fuchsia-700/20 blur-[120px] sm:blur-[150px]" />
        <div className="absolute -bottom-[10%] left-[15%] aspect-square w-[65vw] max-w-[800px] rounded-full bg-pink-800/25 blur-[120px] sm:blur-[150px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <motion.header
          className="mb-8"
          initial={isBackNav ? false : { opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={isBackNav ? { duration: 0 } : { duration: 0.5, ease: "easeOut" }}
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-3">
                <div className="h-px w-12 bg-pink-500" />
                <span className="text-xs font-bold uppercase tracking-widest text-pink-400">
                  COMUNIDAD
                </span>
              </div>
              <h1 className="text-4xl font-black tracking-tighter text-white md:text-6xl">
                Social<span className="text-pink-500">.</span>
              </h1>
              <p className="mt-2 hidden max-w-lg text-lg text-zinc-400 md:block">
                La actividad de la gente a la que sigues, y la tuya.
              </p>
            </div>

            <div className="grid w-full grid-cols-3 gap-2 sm:gap-3 lg:w-auto">
              <TarjetaCifra
                value={summary?.following}
                label="Siguiendo"
                icon={UserRoundCheck}
                iconClassName="text-pink-400"
                href={perfilHref ? `${perfilHref}/following` : undefined}
              />
              <TarjetaCifra
                value={summary?.followers}
                label="Seguidores"
                icon={Users}
                iconClassName="text-fuchsia-400"
                href={perfilHref ? `${perfilHref}/followers` : undefined}
              />
              {/* Tercera cifra propia de esta página: de toda la gente a la que
                  sigues, cuánta se ha movido esta semana. Es lo que dice si el
                  feed va a tener algo nuevo que enseñar. */}
              <TarjetaCifra
                value={summary?.activeWeek}
                label="Activos"
                icon={Activity}
                iconClassName="text-rose-400"
                title={`Cuentas que sigues con actividad en los últimos ${summary?.windowDays || 7} días`}
              />
            </div>
          </div>
        </motion.header>

        {/* BARRA DE FILTROS (sticky, con el cristal del navbar al fijarse) */}
        <motion.div
          ref={filtersRef}
          data-menu-pinned={filtersPinned}
          className={`relative sticky top-14 z-[70] space-y-1 transition-all duration-300 sm:top-20 sm:mb-5 lg:mb-6 ${
            mobileFiltersOpen ? "mb-2" : "mb-6"
          }`}
          initial={isBackNav ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={isBackNav ? { duration: 0 } : { duration: 0.4, delay: 0.3 }}
        >
          {/* Móvil: buscador + desplegar filtros */}
          <div className="relative z-10 flex gap-2 lg:hidden">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-pink-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar en la actividad..."
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
              setScope={setScope}
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

          {/* MISMO DESPLEGABLE QUE LAS PÁGINAS DE USUARIO (Favoritos, Pendientes,
              Historial): despliegue por alto con la misma curva, y sin fondo
              propio —cada control lleva su cristal—. Antes de fijarse forma
              parte del flujo y empuja el contenido; al fijarse pasa a overlay
              para no desplazar nada. */}
          <AnimatePresence>
            {mobileFiltersOpen ? (
              <motion.div
                ref={panelRef}
                initial={{ height: 0 }}
                animate={{ height: "auto" }}
                exit={{ height: 0 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className={`z-[80] origin-top overflow-hidden lg:hidden ${
                  // Fijado, el panel arranca A RAS del buscador: el hueco de
                  // 8px dejaba ver por debajo la tarjeta que hubiera detrás. La
                  // separación se recupera dentro de la superficie.
                  filtersSticky
                    ? "absolute left-0 right-0 top-full"
                    : "relative mt-2"
                }`}
              >
                {/* SUPERFICIE PROPIA cuando el panel es overlay.
                    Cada control lleva su cristal, pero entre ellos quedaban
                    huecos por los que se veía —difuminada por el desenfoque de
                    los controles— la tarjeta que hubiera detrás: esa era la
                    "banda difuminada sobre el contenido" al abrir el menú. Con
                    una superficie única el menú tapa lo que cubre. Al principio
                    de la página el panel va en el flujo y no hay nada detrás,
                    así que ahí no hace falta. */}
                <div
                  className={`space-y-2 ${
                    filtersSticky
                      ? "rounded-b-3xl bg-black/90 px-2 pb-2 pt-2 shadow-2xl backdrop-blur-2xl"
                      : ""
                  }`}
                >
                  {/* Dos controles por fila, como en las páginas de usuario. */}
                  <div className="flex gap-2">
                    <div className="min-w-0 flex-1">
                      <SelectorSimple
                        icon={Filter}
                        label="Acción"
                        opciones={FILTROS}
                        valor={filtro}
                        onChange={setFiltro}
                        compactMobile
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <SelectorSimple
                        icon={Layers3}
                        label="Agrupar"
                        opciones={SOCIAL_GROUP_OPTIONS}
                        etiquetasCortas={SOCIAL_GROUP_SHORT_LABELS}
                        valor={agrupar}
                        onChange={setAgrupar}
                        compactMobile
                      />
                    </div>
                  </div>

                  {/* Segunda fila: orden y vistas, para que el menú quede en dos
                      filas de dos como en las demás páginas. */}
                  <div className="flex gap-2">
                    <div className="min-w-0 flex-1">
                      <SelectorSimple
                        icon={ArrowUpDown}
                        label="Orden"
                        opciones={[
                          ["recent", "Reciente"],
                          ["oldest", "Antiguo"],
                        ]}
                        valor={orden}
                        onChange={setOrden}
                        compactMobile
                      />
                    </div>
                    <SelectorVista
                      vista={vista}
                      setVista={setVista}
                      controlGlass={controlGlass}
                      activo={activo}
                      fill
                    />
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Escritorio: todo en una fila */}
          <div className="relative z-10 hidden gap-3 lg:flex">
            {/* El selector de alcance abre la barra: es el control que decide
                QUÉ se está viendo, así que va antes que los filtros. */}
            <SelectorAlcance
              scope={scope}
              setScope={setScope}
              controlGlass={controlGlass}
              activo={activo}
            />
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-pink-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onFocus={() => setDesktopSearchFocused(true)}
                onBlur={() => setDesktopSearchFocused(false)}
                placeholder="Buscar en la actividad..."
                className={`h-11 w-full rounded-2xl py-2.5 pl-10 pr-10 text-sm text-white transition-all placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-pink-500/50 ${controlGlass}`}
              />
            </div>
            <SelectorSimple
              icon={Filter}
              label="Acción"
              opciones={FILTROS}
              valor={filtro}
              onChange={setFiltro}
              compact={desktopSearchFocused}
            />
            <SelectorSimple
              icon={Layers3}
              label="Agrupar"
              opciones={SOCIAL_GROUP_OPTIONS}
              valor={agrupar}
              onChange={setAgrupar}
              compact={desktopSearchFocused}
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
              compact={desktopSearchFocused}
            />
            <SelectorVista
              vista={vista}
              setVista={setVista}
              controlGlass={controlGlass}
              activo={activo}
            />
          </div>
        </motion.div>

        {error ? (
          <p className="mb-4 text-sm text-pink-300">{error}</p>
        ) : null}

        {loading && items.length === 0 ? null : visibles.length === 0 ? (
          <motion.div
            className="rounded-3xl border border-dashed border-zinc-800 bg-zinc-900/20 py-24 text-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
          >
            <Users className="mx-auto mb-4 h-16 w-16 text-zinc-800" />
            <p className="font-medium text-zinc-500">
              {scope === "following"
                ? "Todavía no hay actividad de las cuentas que sigues."
                : "Todavía no tienes actividad."}
            </p>
            {scope === "following" ? (
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
            <div ref={listaRef}>
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
                      <div className={clasesDeRejilla(vista)}>
                        {grupo.items.map((evento) => (
                          <EventoTarjeta
                            key={evento.id}
                            evento={evento}
                            mostrarAutor={scope === "following"}
                            vista={vista}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={clasesDeRejilla(vista)}>
                  {visibles.map((evento) => (
                    <EventoTarjeta
                      key={evento.id}
                      evento={evento}
                      mostrarAutor={scope === "following"}
                      vista={vista}
                    />
                  ))}
                </div>
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
  );
}

// Botón Siguiendo / Yo: el control que pide la sección.
function SelectorAlcance({
  scope,
  setScope,
  controlGlass,
  activo,
  fill = false,
  soloIconos = false,
}) {
  return (
    <div
      className={`flex h-11 items-center rounded-2xl p-1 ${
        fill ? "min-w-0 flex-1" : "shrink-0"
      } ${controlGlass}`}
    >
      {[
        ["following", "Siguiendo", Users],
        ["me", "Yo", User],
      ].map(([valor, etiqueta, Icono]) => (
        <button
          key={valor}
          type="button"
          onClick={() => setScope(valor)}
          aria-pressed={scope === valor}
          // En la barra móvil va solo el icono: el rótulo se lo comería el
          // buscador. El nombre sigue estando para lectores de pantalla.
          aria-label={soloIconos ? etiqueta : undefined}
          title={soloIconos ? etiqueta : undefined}
          className={`flex h-full items-center justify-center rounded-xl text-sm font-bold transition-all ${
            soloIconos ? "w-9" : "flex-1 gap-2 px-3"
          } ${
            scope === valor
              ? activo
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
function InlineDropdown({
  label,
  valueLabel,
  mobileValueLabel = null,
  icon: Icon,
  children,
  compact = false,
  compactMobile = false,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState(null);

  const updateMenuPosition = useCallback(() => {
    if (!buttonRef.current || typeof window === "undefined") return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = Math.min(
      Math.max(rect.width, 180),
      window.innerWidth - 24,
    );
    const left = Math.min(
      Math.max(12, rect.left),
      Math.max(12, window.innerWidth - menuWidth - 12),
    );
    const availableBelow = window.innerHeight - rect.bottom - 12;
    setMenuStyle({
      position: "fixed",
      top: rect.bottom + 8,
      left,
      width: menuWidth,
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
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        // Al enfocar el buscador de escritorio, el rótulo se pliega y el botón
        // suelta su ancho mínimo: es lo que permite que la fila entera quepa en
        // 1024px sin desbordar (mismo mecanismo que Historial).
        aria-label={compact ? `${label}: ${valueLabel}` : undefined}
        className={`inline-flex h-11 w-full min-w-0 items-center justify-between gap-3 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 px-4 text-sm text-zinc-200 shadow-lg backdrop-blur-lg transition-[min-width,background-color,color] hover:from-white/15 hover:to-white/10 lg:w-auto lg:max-w-none ${
          compact ? "lg:min-w-0" : "lg:min-w-[140px]"
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          {Icon ? <Icon className="h-4 w-4 shrink-0 text-pink-500" /> : null}
          {/* En el móvil, con el botón a media fila, el rótulo se lleva el sitio
              que necesita el valor ("ORDEN: Re…"): ahí se esconde y manda el
              icono, igual que hacen las páginas de usuario. */}
          <span
            aria-hidden={compact}
            className={`shrink-0 overflow-hidden whitespace-nowrap text-xs font-bold uppercase tracking-wider text-zinc-500 transition-[max-width,opacity] duration-200 ${
              compact ? "max-w-0 opacity-0" : "max-w-24 opacity-100"
            } ${compactMobile ? "hidden sm:inline" : ""}`}
          >
            {label}:
          </span>
          <span className="min-w-0 truncate font-semibold text-white">
            {/* En móvil, donde el botón ocupa media fila, se usa la versión
                abreviada; a partir de `lg` cabe entera. */}
            {mobileValueLabel ? (
              <>
                <span className="lg:hidden">{mobileValueLabel}</span>
                <span className="hidden lg:inline">{valueLabel}</span>
              </>
            ) : (
              valueLabel
            )}
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
                className="overflow-y-auto overflow-x-hidden rounded-2xl bg-black/40 bg-gradient-to-br from-white/10 to-white/5 p-2 shadow-2xl backdrop-blur-2xl [scrollbar-color:#3f3f46_transparent]"
                style={{
                  ...menuStyle,
                  scrollbarWidth: "thin",
                  scrollbarGutter: "stable",
                  overscrollBehavior: "contain",
                }}
              >
                {children({ close: () => setOpen(false) })}
              </motion.div>
            ) : null}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}

function DropdownItem({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
        active
          ? "bg-white/10 font-bold text-white"
          : "text-zinc-300 hover:bg-white/5 hover:text-white"
      }`}
    >
      <span className="font-medium">{children}</span>
      {active ? <CheckCircle2 className="h-4 w-4 text-pink-500" /> : null}
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
  compact = false,
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
      compact={compact}
      compactMobile={compactMobile}
    >
      {({ close }) => (
        <>
          {opciones.map(([v, etiqueta]) => (
            <DropdownItem
              key={v}
              active={valor === v}
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

// Cómo se reparte cada vista. Fuera del componente porque la usan los dos
// caminos de pintado (con grupos y sin ellos) y así no pueden divergir.
function clasesDeRejilla(vista) {
  if (vista === "grid") {
    // Tarjetas de cartel, con el mismo escalado por ancho que las páginas de
    // usuario: más pequeñas en el móvil, sin llegar nunca al muro diminuto.
    return "grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6";
  }
  if (vista === "compact") {
    // TRES POR FILA en escritorio, que es lo que distingue esta vista de la de
    // una fila. En el móvil no caben tres filas con texto: van dos.
    return "grid grid-cols-2 gap-3 lg:grid-cols-3";
  }
  return "flex flex-col gap-3";
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

function SelectorVista({ vista, setVista, controlGlass, activo, fill = false }) {
  return (
    <div
      className={`flex h-11 items-center rounded-2xl p-1 ${fill ? "min-w-0 flex-1" : "shrink-0"} ${controlGlass}`}
    >
      {[
        ["list", LayoutList, "Lista"],
        ["compact", Columns3, "Tres por fila"],
        ["grid", LayoutGrid, "Tarjetas"],
      ].map(([valor, Icono, etiqueta]) => (
        <button
          key={valor}
          type="button"
          onClick={() => setVista(valor)}
          aria-label={`Vista ${etiqueta}`}
          title={etiqueta}
          className={`flex h-full flex-1 items-center justify-center rounded-lg px-2.5 text-sm font-bold transition-all ${
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
