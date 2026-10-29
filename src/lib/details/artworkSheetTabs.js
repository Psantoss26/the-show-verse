// Pestañas de la vista lateral «Portadas y fondos»: las MISMAS categorías que
// la galería de la ficha (DetailsClient → artworkSelection), con todas sus
// imágenes (sin el filtro de resolución de la galería; los logos, solo en
// español e inglés como en ella).
//
//   - Escritorio: Portada, Backdrop, Fondo y Logo. «Vista previa» (el backdrop de
//     DetailModal) se edita desde el propio DetailModal: ver
//     `buildDetailModalArtworkTabs`.
//   - Móvil: Portada, Tarjetas, Backdrop y Logo. «Portada» (`mobilePoster`,
//     SOLO de la ficha móvil) trae las portadas sin idioma y las que tienen
//     idioma en español e inglés (o, sin ninguna, las de otros idiomas), y
//     abre filtrada en «Sin idioma» (`defaultLanguage`): la portada móvil va
//     sin idioma con el logo encima; elegir una con idioma desde el filtro de
//     idioma la sustituye y el logo se oculta (ya trae el título impreso).
//     Antes esas iban en una pestaña aparte, «Con idioma». «Tarjetas» es la
//     portada de las tarjetas de páginas y dashboards: la misma preferencia
//     que «Portada» en escritorio (`poster`).
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

// Portadas CON IDIOMA de «Portada» (móvil) y «Tarjetas»: solo en
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
  const sources = { poster: allPosters, mobilePoster: allPosters, cardBackdrop: allBackdrops, background: allBackdrops, logo: allLogos };

  const neutralPosters = allPosters.filter(isLanguageNeutralImage);
  const localizedPosters = spanishOrEnglishFirst(
    allPosters.filter((img) => !isLanguageNeutralImage(img)),
  );
  // «Backdrop»: la portada backdrop de la ficha y las tarjetas backdrop de
  // páginas y dashboards (kind `cardBackdrop`). Con idioma, como «Tarjetas»:
  // español e inglés; si no hay, los idiomas que haya; sin ninguno con idioma,
  // todos.
  const cardBackdropTab = {
    id: "cardBackdrops",
    label: "Backdrop",
    kind: "cardBackdrop",
    aspect: "backdrop",
    images: orAll(
      spanishOrEnglishFirst(allBackdrops.filter((img) => !isLanguageNeutralImage(img))),
      allBackdrops,
    ),
    activePath: active.cardBackdrop ?? null,
  };

  const tabs = mobile
    ? [
        {
          id: "posters",
          label: "Portada",
          kind: "mobilePoster",
          aspect: "poster",
          // Primero las sin idioma y después las con idioma en español e
          // inglés (o las que haya). Se abre en «Sin idioma» si hay alguna;
          // la vista lateral abre en el idioma de la elegida si es otro.
          images: [...neutralPosters, ...localizedPosters],
          defaultLanguage: neutralPosters.length ? "none" : null,
          activePath: active.mobilePoster,
          injectActive: false,
        },
        {
          id: "cardPosters",
          label: "Tarjetas",
          kind: "poster",
          aspect: "poster",
          // Las con idioma de «Portada»; sin ninguna con idioma, todas.
          images: orAll(localizedPosters, allPosters),
          // La que usan las tarjetas: la elegida, la más votada o la
          // automática.
          activePath: active.cardPoster ?? null,
        },
        cardBackdropTab,
        { id: "logos", label: "Logo", kind: "logo", aspect: "logo", images: languageLogos, activePath: active.logo },
      ]
    : [
        { id: "posters", label: "Portada", kind: "poster", aspect: "poster", images: allPosters, activePath: active.poster },
        cardBackdropTab,
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
