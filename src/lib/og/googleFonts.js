// Tipografías para las imágenes generadas con `next/og` (Satori).
//
// El proyecto solo tiene las fuentes en woff2, que Satori no lee: se piden una
// vez en TTF a Google Fonts y se guardan en memoria por proceso. Si falla, se
// devuelve null y la imagen sale con la fuente por defecto en vez de no salir;
// el siguiente intento vuelve a probar.

async function fetchTtf(query) {
  const css = await fetch(`https://fonts.googleapis.com/css2?family=${query}`, {
    signal: AbortSignal.timeout(4000),
  }).then((res) => (res.ok ? res.text() : ""));
  const url = css.match(/url\((https:[^)]+\.ttf)\)/)?.[1];
  if (!url) throw new Error(`no ttf for ${query}`);
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`font ${res.status}`);
  return res.arrayBuffer();
}

const cache = new Map();

/**
 * `specs`: [{ name, query, weight }] — `query` es el parámetro `family` de la
 * API css2 (p. ej. "PT+Sans:wght@700"). Devuelve el array `fonts` que espera
 * ImageResponse, o null si no se pudo cargar alguna.
 */
export function loadGoogleFonts(specs) {
  const key = specs.map((spec) => `${spec.name}|${spec.query}|${spec.weight}`).join(",");
  if (!cache.has(key)) {
    const promise = Promise.all(specs.map((spec) => fetchTtf(spec.query)))
      .then((buffers) =>
        buffers.map((data, index) => ({
          name: specs[index].name,
          data,
          weight: specs[index].weight,
          style: "normal",
        })),
      )
      .catch(() => {
        cache.delete(key); // se reintenta en la siguiente imagen
        return null;
      });
    cache.set(key, promise);
  }
  return cache.get(key);
}
