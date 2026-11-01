// Consulta de /api/streaming desde el navegador (ficha completa y ficha rápida).
//
// Dos respuestas parecen válidas sin serlo:
//   - `degraded: true` (503): JustWatch no respondió. No significa «sin
//     plataformas».
//   - Copia del service worker (`X-Showverse-Offline: 1`, estado 200): la sirve
//     cuando el servidor no responde, por ejemplo mientras se despliega. Puede
//     ser de antes de que existiera `cinema` o estar vacía.
// Guardarlas como resultado dejaba «No hay plataformas disponibles» hasta 24 h
// en esa pestaña. Aquí se reintenta una vez y se dice si el resultado se puede
// guardar (`fresh`).

const RETRY_DELAY_MS = 1500;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Devuelve { data, fresh }:
//   - data: el JSON de /api/streaming o null si no hubo nada utilizable.
//   - fresh: true solo si viene del servidor y JustWatch respondió.
// Una copia sin conexión se devuelve (sirve para pintar) pero con fresh=false.
export async function fetchStreamingAvailability(
  params,
  { retries = 1, retryDelayMs = RETRY_DELAY_MS, fetchImpl = fetch } = {},
) {
  let fallback = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) await wait(retryDelayMs);
    try {
      const response = await fetchImpl(`/api/streaming?${params.toString()}`);
      const offlineCopy = response.headers.get("X-Showverse-Offline") === "1";
      const json = response.ok ? await response.json().catch(() => null) : null;
      if (!json || json.degraded || json.offline) continue;
      if (!offlineCopy) return { data: json, fresh: true };
      fallback = { data: json, fresh: false };
    } catch {
      // Red caída: cuenta como intento fallido.
    }
  }

  return fallback || { data: null, fresh: false };
}
