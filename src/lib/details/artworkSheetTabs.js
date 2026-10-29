// Pestañas de la vista lateral «Portadas y fondos»: las MISMAS categorías que
// la galería de la ficha (DetailsClient → artworkSelection), con todas sus
// imágenes (sin el filtro de resolución de la galería; los logos, solo en
// español e inglés como en ella).
//
//   - Escritorio: Portada, Fondo y Logo. «Vista previa» (el backdrop de
//     DetailModal) se edita desde el propio DetailModal: ver
//     `buildDetailModalArtworkTabs`.
//   - Móvil: Portada, Con idioma, Tarjetas y Logo. La portada móvil va sin
//     idioma con el logo encima; elegir una «Con idioma» la sustituye y el logo
//     se oculta (ya trae el título impreso). Esas dos guardan la misma
//     preferencia (`mobilePoster`), que es SOLO de la ficha móvil. «Tarjetas»
//     es la portada de las tarjetas de páginas y dashboards: la misma
//     preferencia que «Portada» en escritorio (`poster`).
//
// En cada pestaña la imagen elegida va primero y se marca (`activePath`).

import { isLanguageNeutralImage } from "./tmdbImages.js";

const withPath = (list) => (Array.isArray(list) ? list : []).filter((img) => img?.file_path);

// Como en la galería: si el filtro de la categoría deja la lista vacía, se
// usa la lista completa.
const orAll = (subset, all) => (subset.length ? subset : all);

const SPANISH_OR_ENGLISH = new Set(["es", "es-es", "en", "en-us"]);
const isSpanishOrEnglishImage = (img) =>
  SPANISH_OR_ENGLISH.has(String(img?.iso_639_1 || "").trim().toLowerCase());

// Portadas CON IDIOMA de las pestañas «Con idioma» y «Tarjetas»: solo en
// español e inglés; si el título no tiene ninguna en esos idiomas, las de los
// idiomas que haya.
export const spanishOrEnglishFirst = (images) =>
  orAll(images.filter(isSpanishOrEnglishImage), images);

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

// Logos: como el filtro ES/EN de la galería, solo en español e inglés.
const languageLogosOf = (allLogos) => orAll(allLogos.filter(isSpanishOrEnglishImage), allLogos);

function finishTabs(tabs, sources) {
  return tabs
    .map((tab) => {
      const { injectActive = true, ...rest } = tab;
      const images = selectedFirst(tab.images, tab.activePath, sources[tab.kind], injectActive);
      return { ...rest, images, count: images.length };
    })
    .filter((tab) => tab.count > 0);
}

// Editor de imágenes de DetailModal (botón Editar de sus controles): las dos
// capas de su cabecera, el backdrop de «Vista previa» (sin idioma, con el logo
// encima; kind `backdrop`) y el logo.
export function buildDetailModalArtworkTabs({ backdrops, logos, active = {} }) {
  const allBackdrops = withPath(backdrops);
  const galleryBackdrops = orAll(
    allBackdrops.filter((img) => img.from !== "main"),
    allBackdrops,
  );
  const allLogos = withPath(logos);
  return finishTabs(
    [
      {
        id: "backdrops",
        label: "Vista previa",
        kind: "backdrop",
        aspect: "backdrop",
        images: orAll(galleryBackdrops.filter(isLanguageNeutralImage), galleryBackdrops),
        activePath: active.preview,
      },
      { id: "logos", label: "Logo", kind: "logo", aspect: "logo", images: languageLogosOf(allLogos), activePath: active.logo },
    ],
    { backdrop: allBackdrops, logo: allLogos },
  );
}

export function buildArtworkSheetTabs({ mobile = false, posters, backdrops, logos, active = {} }) {
  const allPosters = withPath(posters);
  const allBackdrops = withPath(backdrops);
  const neutralBackdrops = orAll(allBackdrops.filter(isLanguageNeutralImage), allBackdrops);

  const allLogos = withPath(logos);
  const languageLogos = languageLogosOf(allLogos);
  const sources = { poster: allPosters, mobilePoster: allPosters, background: allBackdrops, logo: allLogos };

  const localizedPosters = spanishOrEnglishFirst(
    allPosters.filter((img) => !isLanguageNeutralImage(img)),
  );

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
          images: localizedPosters,
          activePath: active.mobilePoster,
          injectActive: false,
        },
        {
          id: "cardPosters",
          label: "Tarjetas",
          kind: "poster",
          aspect: "poster",
          // Las mismas que «Con idioma»; sin ninguna con idioma, todas.
          images: orAll(localizedPosters, allPosters),
          // Solo la elegida a propósito: sin ella, cada página usa su portada
          // automática y no hay una que marcar.
          activePath: active.cardPoster ?? null,
        },
        { id: "logos", label: "Logo", kind: "logo", aspect: "logo", images: languageLogos, activePath: active.logo },
      ]
    : [
        { id: "posters", label: "Portada", kind: "poster", aspect: "poster", images: allPosters, activePath: active.poster },
        {
          id: "background",
          label: "Fondo",
          kind: "background",
          aspect: "backdrop",
          images: neutralBackdrops,
          activePath: active.background,
        },
        { id: "logos", label: "Logo", kind: "logo", aspect: "logo", images: languageLogos, activePath: active.logo },
      ];

  return finishTabs(tabs, sources);
}
