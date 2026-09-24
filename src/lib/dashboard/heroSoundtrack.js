export const DEFAULT_SOUNDTRACK_VOLUME = 0.3;
export const DEFAULT_COMPACT_SOUNDTRACK_VOLUME = 0.5;

// Sin control de volumen visible, una preferencia de escritorio baja o a cero
// no debe dejar el soundtrack inaudible. El botón sigue controlando el silencio.
export function resolveHeroSoundtrackVolume(savedVolume, hasVolumeControl) {
  if (!hasVolumeControl) return DEFAULT_COMPACT_SOUNDTRACK_VOLUME;
  if (!Number.isFinite(savedVolume)) return DEFAULT_SOUNDTRACK_VOLUME;
  return Math.min(1, Math.max(0, savedVolume));
}
