"use client";

// Hook para que las tarjetas de las páginas de usuario abran la ficha rápida
// (DetailModal en placement "right", drawer desde la derecha) al hacer clic, en
// lugar de navegar a la página completa.
//
// Uso en una tarjeta que ya es un <Link href>:
//   const previewClick = usePreviewOpen();
//   <Link href={href} onClick={previewClick(item, { mediaType })}>…</Link>
//
// El <Link> se conserva intacto (SEO, foco, abrir-en-pestaña-nueva). El handler:
//   - respeta cmd/ctrl/shift/alt/click-central (deja pasar la navegación nativa),
//   - si NO hay DetailModalProvider por encima (openDetailModal == null) o el
//     item no tiene id, no hace nada → navegación normal del <Link>,
//   - en un clic normal, previene la navegación y abre el panel de vista previa.

import { getMediaTypeForItem } from "@/lib/dashboard/media";
import { useDetailModal } from "@/components/dashboard/DetailModalProvider";

export default function usePreviewOpen() {
  const { openDetailModal } = useDetailModal();

  // opts.episode = { showId, seasonNumber, episodeNumber, name?, still_path?, showName? }
  // Si se pasa (con temporada y episodio), se abre la preview del EPISODIO en vez
  // de la de la serie/película.
  return function previewClick(item, { mediaType, previewId, episode } = {}) {
    return (event) => {
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.button === 1
      ) {
        return;
      }
      if (!openDetailModal) return; // sin provider → navega el <Link>

      if (
        episode &&
        episode.seasonNumber != null &&
        episode.episodeNumber != null
      ) {
        const showId = episode.showId ?? previewId ?? item?.tmdbId ?? item?.id;
        if (showId == null) return;
        event.preventDefault();
        openDetailModal({
          media_type: "episode",
          id: showId,
          showId,
          seasonNumber: episode.seasonNumber,
          episodeNumber: episode.episodeNumber,
          name: episode.name ?? null,
          still_path: episode.still_path ?? null,
          showName: episode.showName ?? null,
        });
        return;
      }

      const id = previewId ?? item?.tmdbId ?? item?.id;
      if (id == null) return;

      event.preventDefault();
      openDetailModal({
        ...item,
        id,
        media_type: mediaType ?? getMediaTypeForItem(item),
      });
    };
  };
}
