// backend/src/dashboard/rotation.js
export function dayNumber(date = new Date()) {
  return Math.floor(date.getTime() / 86400000);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle(array, seed) {
  const out = [...array];
  const rand = mulberry32((seed >>> 0) || 1);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function rotateWindow(array, seed, size) {
  return seededShuffle(array, seed).slice(0, size);
}

export function pickRotating(list, seed, count) {
  return seededShuffle(list, seed).slice(0, Math.min(count, list.length));
}
