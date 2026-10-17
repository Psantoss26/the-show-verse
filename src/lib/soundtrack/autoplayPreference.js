// Preferencia de cuenta «Reproducción automática del soundtrack» (Ajustes y el
// interruptor del reproductor de la ficha). Decide si la banda sonora suena
// SOLA al abrir la ficha de un título (DetailsClient) o al mostrarse un título
// en el hero destacado (FeaturedHero). Desactivada por defecto.
//
// Clave nueva a propósito: la anterior (`soundtrackAutoplay`, activada por
// defecto) quedó guardada como `true` en casi todas las cuentas, porque cada
// cambio de ajustes envía `uiSettings` ya combinado con los valores por
// defecto. No se puede distinguir quién la eligió de quién solo la heredó, así
// que se ignora y todo el mundo arranca sin reproducción automática.
export const SOUNDTRACK_AUTOPLAY_KEY = "autoplaySoundtrack";

export function isSoundtrackAutoplayOn(preferences) {
  return preferences?.uiSettings?.[SOUNDTRACK_AUTOPLAY_KEY] === true;
}

export function withSoundtrackAutoplay(uiSettings, value) {
  return { ...(uiSettings || {}), [SOUNDTRACK_AUTOPLAY_KEY]: !!value };
}
