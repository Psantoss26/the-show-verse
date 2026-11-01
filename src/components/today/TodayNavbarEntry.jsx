"use client";

// src/components/today/TodayNavbarEntry.jsx
//
// Píldora «Hoy» del navbar, como la de Trakt (trakt-lite, TodayNavbarEntry):
//   - Escritorio: píldora de cristal líquido (la de la casa) con las caras de
//     hasta 3 personas con historias, «Hoy» y un contador con las sin ver. Mientras quede alguna, un brillo recorre el
//     borde de vez en cuando (sv-today-shine en globals.css).
//   - Móvil: un círculo con dos carteles inclinados y el contador en la esquina.
// Lleva a la vista «Hoy» de Social abriendo el reproductor en la primera
// historia sin ver (/social?story=…). Sin historias no se pinta.
//
// Los datos son los de la vista «Hoy» (Siguiendo, hoy), con la petición
// compartida de todayFeedClient: la barra está montada dos veces y la página
// también los usa.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import OptimizedImage from "@/components/OptimizedImage";
import LiquidGlassOpticalLayers from "@/components/ui/LiquidGlassOpticalLayers";
import Avatar from "@/components/ui/Avatar";
import { useAuth } from "@/context/AuthContext";
import { LIQUID_GLASS_BAR } from "@/lib/ui/liquidGlass";
import { SEEN_STORIES_EVENT, hasUnseenFrames, readSeenStories } from "@/lib/today/seenStories";
import { prepareActions, toStoryGroups, toTitleStories } from "@/lib/today/stories";
import { fetchTodayFeed, peekTodayFeed } from "@/lib/today/todayFeedClient";
import { displayName, tmdbImage } from "./todayUi";

const MAX_FACES = 3;
const MAX_POSTERS = 2;

function useTodayGroups(enabled) {
  const pathname = usePathname();
  const [data, setData] = useState(() => peekTodayFeed("following", "today"));
  const [seen, setSeen] = useState({});

  // Al entrar y al navegar, salvo que la copia compartida sea reciente.
  useEffect(() => {
    if (!enabled) return undefined;
    const fresh = peekTodayFeed("following", "today");
    if (fresh) {
      setData(fresh);
      return undefined;
    }
    let vigente = true;
    fetchTodayFeed("following", "today")
      .then((json) => {
        if (vigente) setData(json);
      })
      .catch(() => {
        /* sin datos la píldora no se pinta; la próxima navegación lo reintenta */
      });
    return () => {
      vigente = false;
    };
  }, [enabled, pathname]);

  useEffect(() => {
    if (!enabled) return undefined;
    const sync = () => setSeen(readSeenStories());
    sync();
    window.addEventListener(SEEN_STORIES_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SEEN_STORIES_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [enabled]);

  return useMemo(() => {
    if (!enabled || !data) return null;
    const stories = toTitleStories(prepareActions(data.actions));
    const groups = toStoryGroups(stories, data.forYou || []);
    if (!groups.length) return null;
    const unseen = groups.filter((group) => hasUnseenFrames(group, seen));
    const faces = [];
    for (const story of stories) {
      for (const user of story.users) {
        if (faces.length < MAX_FACES && !faces.some((f) => f.id === user.id)) faces.push(user);
      }
    }
    const posters = [];
    for (const group of groups) {
      const media = group.frames[0]?.media || group.media;
      if (posters.length < MAX_POSTERS && media?.posterPath && !posters.some((p) => p.posterPath === media.posterPath)) {
        posters.push(media);
      }
    }
    const target = unseen[0] || groups[0];
    return { unseen: unseen.length, faces, posters, href: `/social?story=${encodeURIComponent(target.key)}` };
  }, [enabled, data, seen]);
}

// Brillo del borde: un degradado cónico recortado al anillo de 1px de la
// píldora. Solo mientras queda algo sin ver; sin animación con reduced-motion.
function Shine() {
  return (
    <span
      aria-hidden="true"
      className="sv-today-shine pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] p-px"
    />
  );
}

// Brillo del hover: una capa con el color de fondo, sin `filter` ni opacidad
// sobre la píldora (ver `pillSurface`).
function HoverSheen() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 rounded-[inherit] bg-transparent transition-colors duration-200 group-hover:bg-white/[0.08]"
    />
  );
}

// Contador de historias sin ver: el rosa de la sección Social, con un aro fino
// para que se despegue del cristal sin dibujar un contorno.
function Badge({ count, className = "" }) {
  if (!count) return null;
  return (
    <span
      className={`flex h-5 min-w-5 items-center justify-center rounded-full bg-pink-500 px-1.5 text-xs font-bold leading-none tabular-nums text-white shadow-[0_2px_8px_-2px_rgba(236,72,153,0.7)] ${className}`}
    >
      {count}
    </span>
  );
}

// Caras «recortadas», como el AvatarStack «cutout» de Trakt: en vez de un aro
// del color del fondo (que sobre el cristal se ve como un círculo oscuro), cada
// cara recorta con una máscara el hueco donde se monta la siguiente.
const FACE_PX = 30;
const FACE_OVERLAP_PX = 10;
const FACE_GAP_PX = 2;
const FACE_CUTOUT_MASK = `radial-gradient(circle ${FACE_PX / 2 + FACE_GAP_PX}px at calc(100% + ${FACE_PX / 2 - FACE_OVERLAP_PX}px) 50%, transparent 98%, #000 100%)`;

function Faces({ users }) {
  return (
    <span className="flex items-center" style={{ gap: 0 }}>
      {users.map((user, index) => {
        const last = index === users.length - 1;
        return (
          <span
            key={user.id}
            className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 text-xs font-bold text-white"
            style={{
              width: FACE_PX,
              height: FACE_PX,
              marginLeft: index ? -FACE_OVERLAP_PX : 0,
              WebkitMaskImage: last ? undefined : FACE_CUTOUT_MASK,
              maskImage: last ? undefined : FACE_CUTOUT_MASK,
            }}
          >
            <Avatar src={user.avatarUrl} name={displayName(user)} alt="" />
          </span>
        );
      })}
    </span>
  );
}

export default function TodayNavbarEntry({ variant = "desktop" }) {
  const { account } = useAuth();
  const entry = useTodayGroups(Boolean(account?.id));
  if (!entry) return null;

  const label = entry.unseen
    ? `Actividad: ${entry.unseen} ${entry.unseen === 1 ? "historia sin ver" : "historias sin ver"}`
    : "Actividad: historias de la gente que sigues";
  // El cristal de la casa (LIQUID_GLASS_BAR + capas ópticas), el mismo de las
  // flechas y los menús de cristal: relieve sin contorno dibujado.
  //
  // HOVER SIN `filter`. Antes era `hover:brightness-110`: un filtro sobre un
  // elemento con cristal dentro del navbar obligaba a recomponer sus capas, y
  // en algunos equipos el borde difuminado que el cristal del navbar deja
  // debajo de la barra (`.sv-topbar-glass-soft`) pasaba a desenfocar la parte
  // de arriba de la barra fijada de Social. Ahora se ilumina con una capa
  // propia (`HoverSheen`) que solo cambia su color de fondo.
  const pillSurface = `group ${LIQUID_GLASS_BAR}`;

  if (variant === "mobile") {
    return (
      <Link
        href={entry.href}
        prefetch={false}
        aria-label={label}
        className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-full text-white ${pillSurface}`}
      >
        <LiquidGlassOpticalLayers />
        <HoverSheen />
        {entry.unseen ? <Shine /> : null}
        {entry.posters.map((media, index) => (
          <span
            key={media.posterPath}
            className={`absolute h-5 w-3.5 overflow-hidden rounded-[3px] shadow-md ${
              entry.posters.length === 1
                ? ""
                : index === 0
                  ? "-translate-x-1.5 -rotate-[10deg]"
                  : "translate-x-1.5 rotate-[10deg]"
            }`}
          >
            <OptimizedImage src={tmdbImage(media.posterPath, "w92")} alt="" className="h-full w-full object-cover" />
          </span>
        ))}
        <Badge count={entry.unseen} className="absolute -right-1.5 -top-1.5 h-[18px] min-w-[18px] px-1" />
      </Link>
    );
  }

  return (
    <Link
      href={entry.href}
      prefetch={false}
      aria-label={label}
      className={`relative inline-flex h-10 shrink-0 items-center gap-2 rounded-full text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400/70 ${
        entry.faces.length ? "pl-[5px]" : "pl-3.5"
      } ${entry.unseen ? "pr-2.5" : "pr-3.5"} ${pillSurface}`}
    >
      <LiquidGlassOpticalLayers />
      <HoverSheen />
      {entry.unseen ? <Shine /> : null}
      {entry.faces.length ? (
        <span className="relative">
          <Faces users={entry.faces} />
        </span>
      ) : null}
      <span className="relative font-bold [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">Actividad</span>
      <Badge count={entry.unseen} className="relative" />
    </Link>
  );
}
