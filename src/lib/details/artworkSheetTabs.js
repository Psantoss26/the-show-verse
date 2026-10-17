// Pestañas de la vista lateral «Portadas y fondos»: las MISMAS categorías que
// la galería de la ficha (DetailsClient → artworkSelection), con todas sus
// imágenes (sin los filtros de resolución/idioma de la galería).
//
//   - Escritorio: Portada, Vista previa, Fondo y Logo.
//   - Móvil: Portada, Con idioma y Logo. La portada móvil va sin idioma con el
//     logo encima; elegir una «Con idioma» la sustituye y el logo se oculta (ya
//     trae el título impreso). Las dos pestañas guardan la misma preferencia.
//
// En cada pestaña la imagen elegida va primero y se marca (`activePath`).

import { isLanguageNeutralImage } from "./tmdbImages.js";

const withPath = (list) => (Array.isArray(list) ? list : []).filter((img) => img?.file_path);

// Como en la galería: si el filtro de la categoría deja la lista vacía, se
// usa la lista completa.
const orAll = (subset, all) => (subset.length ? subset : all);

// La elegida va primero. Como en la galería, aparece aunque el filtro de la
// categoría la dejara fuera (p. ej. la vista previa por defecto con texto).
function selectedFirst(list, activePath, source, injectActive = true) {
  if (!activePath) return list;
  const index = list.findIndex((img) => img.file_path === activePath);
  if (index === 0) return list;
  if (index > 0) return [list[index], ...list.slice(0, index), ...list.slice(index + 1)];
  if (!injectActive) return list;
  const selected = source.find((img) => img.file_path === activePath);
  return selected ? [selected, ...list] : list;
}

export function buildArtworkSheetTabs({ mobile = false, posters, backdrops, logos, active = {} }) {
  const allPosters = withPath(posters);
  const allBackdrops = withPath(backdrops);
  const neutralBackdrops = orAll(allBackdrops.filter(isLanguageNeutralImage), allBackdrops);
  const galleryBackdrops = orAll(
    allBackdrops.filter((img) => img.from !== "main"),
    allBackdrops,
  );

  const allLogos = withPath(logos);
  const sources = { poster: allPosters, mobilePoster: allPosters, preview: allBackdrops, background: allBackdrops, logo: allLogos };

  const tabs = mobile
    ? [
        {
          id: "posters",
          label: "Portada",
          kind: "mobilePoster",
          aspect: "poster",
          // Solo sin idioma: las que lo tienen van en «Con idioma».
          images: allPosters.filter(isLanguageNeutralImage),
          activePath: active.mobilePoster,
          // La elegida solo se marca en la pestaña que le corresponde.
          injectActive: false,
        },
        {
          id: "localizedPosters",
          label: "Con idioma",
          kind: "mobilePoster",
          aspect: "poster",
          images: allPosters.filter((img) => !isLanguageNeutralImage(img)),
          activePath: active.mobilePoster,
          injectActive: false,
        },
        { id: "logos", label: "Logo", kind: "logo", aspect: "logo", images: allLogos, activePath: active.logo },
      ]
    : [
        { id: "posters", label: "Portada", kind: "poster", aspect: "poster", images: allPosters, activePath: active.poster },
        {
          id: "backdrops",
          label: "Vista previa",
          kind: "preview",
          aspect: "backdrop",
          images: orAll(galleryBackdrops.filter(isLanguageNeutralImage), galleryBackdrops),
          activePath: active.preview,
        },
        {
          id: "background",
          label: "Fondo",
          kind: "background",
          aspect: "backdrop",
          images: neutralBackdrops,
          activePath: active.background,
        },
        { id: "logos", label: "Logo", kind: "logo", aspect: "logo", images: allLogos, activePath: active.logo },
      ];

  return tabs
    .map((tab) => {
      const { injectActive = true, ...rest } = tab;
      const images = selectedFirst(tab.images, tab.activePath, sources[tab.kind], injectActive);
      return { ...rest, images, count: images.length };
    })
    .filter((tab) => tab.count > 0);
}
