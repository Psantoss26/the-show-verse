"use client";

import Link from "next/link";
import { ListVideo } from "lucide-react";
import OptimizedImage from "@/components/OptimizedImage";
import Avatar from "@/components/ui/Avatar";
import LiquidGlassOpticalLayers from "@/components/ui/LiquidGlassOpticalLayers";
import PosterStack from "@/components/details/PosterStack";
import ListCountPills from "@/components/lists/ListCountPills";
import { LIQUID_GLASS_CARD } from "@/lib/ui/liquidGlass";
import { stripHtml } from "@/lib/details/formatters";
import { getOwnCardPoster } from "@/lib/artworkApi";

// Tarjeta de lista de la vista «Cuadrícula»: pósters en abanico (PosterStack,
// se abren al pasar el ratón) en escritorio y fila compacta de cinco pósters en
// móvil, nombre, descripción y pie con dueño + píldoras. La usan /lists y la
// sección Listas del Perfil; la sección Listas de la ficha (DetailsClient)
// lleva el mismo diseño.
//
// `breakpoint` decide dónde cambia de móvil a escritorio:
// - "viewport": ancho de la ventana (`sm:`), como en /lists.
// - "detail-page": ancho del contenedor `@container/detail-page` (`@[640px]`),
//   para páginas que también se pintan dentro del drawer lateral (Perfil).
// Las clases van escritas enteras para que Tailwind las genere.
const BREAKPOINT_CLASSES = {
  viewport: {
    mobileOnly: "sm:hidden",
    desktopOnly: "hidden sm:block",
    body: "px-4 pb-3 pt-3 sm:p-5",
    title: "text-base sm:text-lg",
    description: "line-clamp-1 sm:mt-2 sm:line-clamp-2",
    footer: "mt-3 pt-3 sm:mt-4 sm:pt-4",
  },
  "detail-page": {
    mobileOnly: "@[640px]/detail-page:hidden",
    desktopOnly: "hidden @[640px]/detail-page:block",
    body: "px-4 pb-3 pt-3 @[640px]/detail-page:p-5",
    title: "text-base @[640px]/detail-page:text-lg",
    description: "line-clamp-1 @[640px]/detail-page:mt-2 @[640px]/detail-page:line-clamp-2",
    footer: "mt-3 pt-3 @[640px]/detail-page:mt-4 @[640px]/detail-page:pt-4",
  },
};

// Brillo y anillo morado al pasar el ratón (`hoverEffects`).
const CARD_HOVER_CLASS =
  "hover:brightness-110 after:pointer-events-none after:absolute after:inset-0 after:z-30 after:rounded-[inherit] after:content-[''] after:transition-shadow after:duration-300 hover:after:shadow-[inset_0_0_0_2.5px_rgba(168,85,247,0.92)]";

// Pósters de la tarjeta en MÓVIL: en fila, todos del mismo tamaño y sin girar
// (el abanico de PosterStack ocupa el doble de alto), sin marco alrededor de
// cada póster. Cinco huecos fijos: la fila mide lo mismo tenga la lista los
// títulos que tenga.
const ROW_POSTER_SLOTS = 5;

function PosterRow({ posters, loading, pulse, alt }) {
  if (loading) {
    return (
      <div className="flex justify-center gap-1.5">
        {Array.from({ length: ROW_POSTER_SLOTS }, (_, index) => (
          <div
            key={index}
            className={`aspect-[2/3] w-[calc((100%-4*0.375rem)/5)] rounded-lg bg-white/[0.06] ${pulse ? "animate-pulse" : ""}`}
          />
        ))}
      </div>
    );
  }
  if (!posters.length) {
    return (
      <div className="flex aspect-[5/1.6] items-center justify-center opacity-10">
        <ListVideo className="h-12 w-12" />
      </div>
    );
  }
  return (
    <div className="flex justify-center gap-1.5">
      {posters.slice(0, ROW_POSTER_SLOTS).map((src, index) => (
        <div
          key={`${src}-${index}`}
          className="relative aspect-[2/3] w-[calc((100%-4*0.375rem)/5)] overflow-hidden rounded-lg"
        >
          {/* Solo la imagen: sin marco, fondo ni sombra que dibujen un borde. */}
          <OptimizedImage
            src={src}
            alt={`${alt}: título ${index + 1}`}
            loading="lazy"
            className="block h-full w-full object-cover"
          />
        </div>
      ))}
    </div>
  );
}

/** Link interno si hay `href`; anchor externo si hay `externalHref`; si no, div. */
function CardWrapper({ href, externalHref, className, children }) {
  if (href) {
    return (
      <Link href={href} scroll className={className}>
        {children}
      </Link>
    );
  }
  if (externalHref) {
    return (
      <a href={externalHref} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return <div className={className}>{children}</div>;
}

export default function ListShowcaseCard({
  cardRef,
  href = null,
  externalHref = null,
  name = "Lista",
  description = "",
  posters = [],
  // `loading`: aún sin pósters (hueco). `pending`: la petición está EN CURSO;
  // solo entonces late el hueco (cientos de animate-pulse fuera de pantalla
  // recalculan estilo en cada fotograma de cualquier animación).
  loading = false,
  pending = false,
  itemCount = 0,
  likes = 0,
  ownerLabel = "",
  ownerAvatar = null,
  // Con `ownerIcon` el pie pinta el icono en vez del avatar.
  ownerIcon: OwnerIcon = null,
  source = "unknown",
  breakpoint = "viewport",
  // false: sin efectos al pasar el ratón (ni anillo morado, ni brillo, ni
  // título de color, ni abanico de pósters). Sección Listas del Perfil.
  hoverEffects = true,
}) {
  const bp = BREAKPOINT_CLASSES[breakpoint] || BREAKPOINT_CLASSES.viewport;
  const cleanDescription = stripHtml(description || "");
  const alt = name || "Lista";

  return (
    <div ref={cardRef} className="group/card relative h-full">
      <CardWrapper
        href={href}
        externalHref={externalHref}
        className="group block h-full rounded-3xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-400"
      >
        <article
          data-list-showcase-card={source}
          className={`relative isolate flex h-full flex-col overflow-hidden rounded-3xl transform-gpu transition-all duration-500 ${LIQUID_GLASS_CARD} ${hoverEffects ? CARD_HOVER_CLASS : ""}`}
        >
          <LiquidGlassOpticalLayers />

          {/* Móvil: fila compacta. */}
          <div className={`relative z-10 w-full bg-gradient-to-b from-white/5 to-transparent px-3 pb-2 pt-3 ${bp.mobileOnly}`}>
            <PosterRow posters={posters} loading={loading} pulse={pending} alt={alt} />
          </div>

          <div className={`relative z-10 h-52 w-full overflow-visible bg-gradient-to-b from-white/5 to-transparent p-6 ${bp.desktopOnly}`}>
            {loading ? (
              <div className="flex h-full w-full items-center justify-center">
                <div className={`h-40 w-56 rounded-2xl bg-white/[0.06] ${pending ? "animate-pulse" : ""}`} />
              </div>
            ) : posters.length > 0 ? (
              <div className="flex h-full w-full items-center justify-center overflow-visible">
                <PosterStack posters={posters} alt={alt} preventNavigation={false} interactive={hoverEffects} />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center opacity-10">
                <ListVideo className="h-20 w-20" />
              </div>
            )}
          </div>

          <div className={`relative z-10 flex flex-1 flex-col justify-between bg-black/25 ${bp.body}`}>
            <div>
              <h3 className={`line-clamp-1 font-bold leading-tight text-white transition-colors ${hoverEffects ? "group-hover:text-indigo-400" : ""} ${bp.title}`}>
                {alt}
              </h3>
              {cleanDescription && (
                <p className={`mt-1 text-xs leading-relaxed text-zinc-400 ${bp.description}`}>
                  {cleanDescription}
                </p>
              )}
            </div>

            {/* `@container`: en tarjetas estrechas (rejilla de 4 columnas) las
                píldoras de items y me gusta no dejan sitio al nombre, que se
                quedaba en «T…»; entonces solo va el avatar (nombre en `title`). */}
            <footer className={`@container flex items-center justify-between gap-3 border-t border-white/5 ${bp.footer}`}>
              <div className="flex min-w-0 items-center gap-2" title={ownerLabel || undefined}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 text-[10px] font-black text-white ring-1 ring-white/20">
                  {OwnerIcon ? (
                    <OwnerIcon aria-hidden="true" className="h-3.5 w-3.5" />
                  ) : (
                    <Avatar src={ownerAvatar} name={ownerLabel || "user"} />
                  )}
                </span>
                <span className={`hidden max-w-[120px] truncate text-xs font-medium text-zinc-300 transition-colors @[17.5rem]:inline ${hoverEffects ? "group-hover:text-white" : ""}`}>
                  {ownerLabel}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <ListCountPills itemCount={itemCount} likes={likes} />
              </div>
            </footer>
          </div>
        </article>
      </CardWrapper>
    </div>
  );
}

// URLs de los pósters de la tarjeta (hasta cinco): portada elegida en la ficha
// o más votada y, sin ellas, la de la vista previa (`enrichListPreviewArtwork`)
// o la guardada en la lista. Quien la llame se suscribe con
// `useOwnCardPostersVersion` para recalcular al cambiar una elegida.
export function listShowcasePosterUrls(items = []) {
  return (Array.isArray(items) ? items : [])
    .slice(0, 5)
    .map((item) => {
      const mediaType = item?.media_type || (item?.title ? "movie" : "tv");
      return getOwnCardPoster(mediaType, item?.id) || item?._listPreviewPoster || item?.poster_path || null;
    })
    .filter(Boolean)
    .map((filePath) =>
      /^https?:\/\//i.test(filePath) ? filePath : `https://image.tmdb.org/t/p/w342${filePath}`,
    );
}
