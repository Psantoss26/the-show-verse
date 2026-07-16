// src/lib/tmdb/imageLanguages.js
//
// Única fuente de verdad para el parámetro `include_image_language` de TMDb.
//
// POR QUÉ EXISTE ESTE MÓDULO
// Los selectores de imagen (pickBestBackdropByLangResVotes en dashboard/media.js
// y pickDashboardBackdrop en DashboardSectionClient) aplican esta escalera:
//
//     idioma preferido (en) → otro idioma (es) → sin idioma (textless)  ← último recurso
//
// Esa escalera solo funciona si el fetch pide TODOS esos idiomas. Pedir
// `en,en-US` (o `en,en-US,null`) deja el escalón intermedio sin candidatos:
// TMDb no devuelve `es`, así que un título sin arte en inglés devuelve cero
// imágenes con idioma y acaba cayendo al textless o al backdrop_path por
// defecto, que es justo lo contrario de lo que la escalera pretende.
//
// Verificado contra la API real (Berlín: 4 logos con `en,en-US` frente a 8 con
// esta lista; La casa de papel: 9 backdrops frente a 70+). `null` va incluido a
// propósito: es el último recurso legítimo de la escalera y las superficies
// textless (pósters neutros del hero) dependen de él.
export const TMDB_IMAGE_LANGS = "en,en-US,es,es-ES,null";

// Azúcar para construir la query, para que ningún sitio vuelva a escribir la
// lista a mano y se desincronice.
export const TMDB_IMAGE_LANGS_PARAM = `include_image_language=${TMDB_IMAGE_LANGS}`;
