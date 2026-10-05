// De qué cliente viene una detección de streaming.
//
// Las detecciones del móvil (app Android: The Show Verse o The Show Verse Sync)
// se ven y se corrigen en la app; la web solo enseña las de la extensión del
// navegador. El origen sale de la fila del token que la envía: al vincular, cada
// cliente guarda un `providerUid` con su prefijo (routes/auth.js).
//
// Las filas anteriores a este campo quedan con origen null y la web las sigue
// enseñando: no se puede saber de dónde vinieron.

export const ANDROID = 'android';
export const BROWSER = 'browser';

export function detectionOriginFromProviderUid(providerUid) {
  const uid = String(providerUid || '');
  if (uid.startsWith('mobile:')) return ANDROID;
  if (uid.startsWith('browser:')) return BROWSER;
  return null;
}
