"use client";

import { useEffect, useMemo, useState } from "react";
import { ImageOff } from "lucide-react";
import OptimizedImage from "@/components/OptimizedImage";
import { PosterShelf, useCoverArtImages } from "@/components/lists/listCoverArt";
import { useAuth } from "@/context/AuthContext";
import { activityBackdropSrc, activityBackdropTarget } from "@/lib/profile/activityBackdrops";
import { applyCollectionCustomization, readCollectionArtworkOverride } from "@/lib/lists/collectionCustomization";
import { pickCollectionCoverBackdrop } from "@/lib/lists/coverBackdrop";
import { buildPosterCollageTargets } from "@/lib/lists/posterCollage";
import { peekListArtwork, requestListArtwork } from "@/lib/tmdb/artworkBatch";
import { fetchTmdbImages } from "@/lib/tmdb/imageRequests";

// Tamaños de TMDb para la miniatura 16:9 de la vista «Lista con backdrop»
// (≈136-224 px de ancho según la pantalla, a 2-3× de densidad).
const SRC_SET_SIZES = ["w300", "w780"];
const DEFAULT_SIZES = "(min-width: 640px) 224px, 136px";
// Marco de la estantería en miniatura: el de la página lleva cristal, sombra
// y esquinas propias, que aquí pone la fila.
const SHELF_FRAME = "overflow-hidden bg-zinc-950";

function backdropSrcSet(path) {
  return SRC_SET_SIZES.map((size) => `${activityBackdropSrc(path, size)} ${size.slice(1)}w`).join(", ");
}

function BackdropImage({ path, alt, sizes }) {
  return (
    <OptimizedImage
      src={activityBackdropSrc(path, "w780")}
      srcSet={backdropSrcSet(path)}
      sizes={sizes}
      alt={alt}
      className="h-full w-full object-cover"
      loading="lazy"
    />
  );
}

const Pending = () => <span aria-hidden="true" className="block h-full w-full bg-white/[0.04]" />;

// Sin backdrop: el póster de la acción centrado sobre una versión desenfocada
// de sí mismo, para no dejar la caja vacía ni recortar el póster a lo ancho.
function PosterFallback({ item, alt }) {
  const poster = item?.posterPath ? `https://image.tmdb.org/t/p/w185${item.posterPath}` : null;
  if (!poster) {
    return (
      <span className="flex h-full w-full items-center justify-center text-zinc-700">
        <ImageOff className="h-5 w-5" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="relative block h-full w-full overflow-hidden">
      <OptimizedImage
        src={poster}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full scale-125 object-cover opacity-50 blur-lg"
        loading="lazy"
      />
      <OptimizedImage src={poster} alt={alt} className="relative h-full w-full object-contain" loading="lazy" />
    </span>
  );
}

// Título: su backdrop de la escalera de idioma, pedido en lote con las demás
// filas que montan a la vez (lib/tmdb/artworkBatch).
function TitleBackdrop({ item, alt, sizes }) {
  const target = activityBackdropTarget(item);
  const peeked = target ? peekListArtwork(target.mediaType, target.tmdbId) : undefined;
  // undefined = aún no se sabe; null = resuelto sin backdrop.
  const [backdropPath, setBackdropPath] = useState(() =>
    !target ? null : peeked ? peeked.previewBackdrop || null : undefined,
  );

  const mediaType = target?.mediaType;
  const tmdbId = target?.tmdbId;
  useEffect(() => {
    if (!mediaType || !tmdbId) return undefined;
    let cancelled = false;
    requestListArtwork(mediaType, tmdbId).then((picks) => {
      if (!cancelled) setBackdropPath(picks?.previewBackdrop || null);
    });
    return () => {
      cancelled = true;
    };
  }, [mediaType, tmdbId]);

  if (backdropPath === undefined) return <Pending />;
  if (backdropPath) return <BackdropImage path={backdropPath} alt={alt} sizes={sizes} />;
  return <PosterFallback item={item} alt={alt} />;
}

// Galería /images de cada colección ya resuelta en esta sesión.
const collectionGalleryCache = new Map();

// Colección: el MISMO backdrop que el modo backdrop de su página de detalles
// (CollectionDetailsClient): el elegido en «Editar colección» o, si no, uno
// CON IDIOMA de su galería (inglés → español). Sin ninguno, su póster.
function CollectionBackdrop({ item, alt, sizes }) {
  const { preferences } = useAuth();
  const collectionId = Number(item?.collectionId) || null;
  const customPath = collectionId
    ? applyCollectionCustomization({}, readCollectionArtworkOverride(preferences, collectionId)).cover_backdrop_path || null
    : null;
  const [gallery, setGallery] = useState(() => ({
    id: collectionId,
    images: collectionGalleryCache.get(collectionId),
  }));

  useEffect(() => {
    if (!collectionId || customPath || collectionGalleryCache.has(collectionId)) return undefined;
    let cancelled = false;
    fetchTmdbImages("collection", collectionId).then((images) => {
      // Solo se recuerda lo que TMDb contestó: un fallo se reintenta luego.
      if (images) collectionGalleryCache.set(collectionId, images);
      if (!cancelled) setGallery({ id: collectionId, images: images || null });
    });
    return () => {
      cancelled = true;
    };
  }, [collectionId, customPath]);

  if (customPath) return <BackdropImage path={customPath} alt={alt} sizes={sizes} />;
  const images = gallery.id === collectionId ? gallery.images : collectionGalleryCache.get(collectionId);
  if (images === undefined && collectionId) return <Pending />;
  const path = pickCollectionCoverBackdrop(images?.backdrops);
  if (path) return <BackdropImage path={path} alt={alt} sizes={sizes} />;
  return <PosterFallback item={item} alt={alt} />;
}

// Lista: la MISMA «estantería» de pósters sin texto de sus primeros títulos
// que el modo backdrop de su página de detalles (las listas no tienen imagen
// horizontal propia). Los títulos los manda la API (`previewItems`).
function ListShelf({ item, alt }) {
  const items = useMemo(
    () => (Array.isArray(item?.previewItems) ? item.previewItems : []),
    [item?.previewItems],
  );
  const art = useCoverArtImages(items);
  const count = useMemo(() => buildPosterCollageTargets(items).length, [items]);
  if (!count) return <PosterFallback item={item} alt={alt} />;
  return (
    <span role={alt ? "img" : undefined} aria-label={alt || undefined} className="relative block h-full w-full">
      <PosterShelf images={art.images} pending={art.pending} count={count} frameClassName={SHELF_FRAME} />
    </span>
  );
}

/**
 * Imagen 16:9 de una acción de la Actividad (Perfil y Social) en la vista
 * «Lista con backdrop», a toda la caja de su contenedor: la de la ficha de su
 * título, colección o lista, como en su página de detalles.
 */
export default function ActivityBackdropImage({ item, alt = "", sizes = DEFAULT_SIZES }) {
  if (item?.type === "list" || item?.type === "like_list") return <ListShelf item={item} alt={alt} />;
  if (item?.type === "like_collection") return <CollectionBackdrop item={item} alt={alt} sizes={sizes} />;
  return <TitleBackdrop item={item} alt={alt} sizes={sizes} />;
}
