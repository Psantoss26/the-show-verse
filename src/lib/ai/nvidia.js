// Cliente de la API de modelos de NVIDIA (build.nvidia.com), en formato OpenAI.
//
// Copia en backend/src/lib/nvidia.js: si cambias una, cambia la otra.
//
// - La clave va en NVIDIA_API_KEY (`nvapi-…`). Sin clave, la IA queda apagada.
// - NVIDIA_MODEL admite una lista separada por comas que se prueba en orden:
//   NVIDIA retira modelos sin aviso, así que el segundo hace de reserva.
//   Con 404/410/429/5xx o tiempo agotado se pasa al siguiente; con 401/403 se
//   para, porque la clave no vale y otro modelo no lo arregla.
// - Sin `response_format`: con él, varios modelos gratuitos se cuelgan o dan
//   502. El JSON se pide en las instrucciones y se lee con extractJsonText.
// - Razonamiento al mínimo por defecto (`thinking: false`): nemotron gastaba
//   ~1800 tokens pensando (25 s y respuesta cortada); sin él, ~4 s. Se mandan
//   los dos controles porque cada modelo entiende uno y ambos aceptan los dos
//   (comprobado el 2026-11-10).

export const NVIDIA_DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";
// Los mismos que Jarvis (probados el 2026-11-07): el primero responde en
// segundos; el segundo es la reserva.
export const NVIDIA_DEFAULT_MODELS = [
  "nvidia/nemotron-3.5-lightning-30b-a3b",
  "mistralai/mistral-large-4-1t-a52b",
];

export class NvidiaError extends Error {
  constructor(message, { kind = "error", attempts = [] } = {}) {
    super(message);
    this.name = "NvidiaError";
    // not_configured | auth | all_failed
    this.kind = kind;
    this.attempts = attempts;
  }
}

export function nvidiaConfig(env = process.env) {
  const models = String(env.NVIDIA_MODEL || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return {
    apiKey: String(env.NVIDIA_API_KEY || "").trim(),
    baseUrl: String(env.NVIDIA_BASE_URL || NVIDIA_DEFAULT_BASE_URL).replace(/\/+$/, ""),
    models: models.length ? models : [...NVIDIA_DEFAULT_MODELS],
  };
}

export function nvidiaEnabled(env = process.env) {
  return Boolean(nvidiaConfig(env).apiKey);
}

// El texto JSON de una respuesta, aunque venga con el razonamiento
// (<think>…</think>), entre ``` o con texto alrededor. Devuelve "" si no hay.
export function extractJsonText(text) {
  let s = String(text || "").replace(/<think>[\s\S]*?(<\/think>|$)/gi, "").trim();
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) s = fenced[1].trim();
  if (!s) return "";
  try {
    JSON.parse(s);
    return s;
  } catch {
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    return start >= 0 && end > start ? s.slice(start, end + 1) : "";
  }
}

function messageText(json) {
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  // Algunos modelos devuelven el contenido por partes.
  if (Array.isArray(content)) {
    return content.map((p) => (typeof p?.text === "string" ? p.text : "")).join("");
  }
  return "";
}

/**
 * Una respuesta de chat, probando los modelos en orden hasta que uno conteste
 * con texto.
 *
 * @returns {Promise<{ content: string, model: string, usage: object|null }>}
 * @throws {NvidiaError} si no hay clave, la clave no vale o ningún modelo responde.
 */
export async function nvidiaChat({
  system,
  user,
  temperature = 0.3,
  maxTokens = 1024,
  thinking = false,
  timeoutMs = 20000,
  totalTimeoutMs = timeoutMs * 2,
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const { apiKey, baseUrl, models } = nvidiaConfig(env);
  if (!apiKey) throw new NvidiaError("NVIDIA_API_KEY no está configurada", { kind: "not_configured" });

  const deadline = Date.now() + totalTimeoutMs;
  const messages = [
    ...(system ? [{ role: "system", content: system }] : []),
    { role: "user", content: user },
  ];
  const attempts = [];

  for (const model of models) {
    const left = deadline - Date.now();
    if (left <= 0) {
      attempts.push({ model, error: "deadline" });
      break;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, left));
    try {
      const res = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          stream: false,
          ...(thinking
            ? {}
            : { reasoning_effort: "low", chat_template_kwargs: { enable_thinking: false } }),
        }),
        cache: "no-store",
        signal: controller.signal,
      });
      if (res.status === 401 || res.status === 403) {
        attempts.push({ model, status: res.status });
        throw new NvidiaError(`NVIDIA rechazó la clave (${res.status})`, { kind: "auth", attempts });
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        attempts.push({ model, status: res.status, detail: detail.slice(0, 120) });
        continue;
      }
      const json = await res.json().catch(() => null);
      const content = messageText(json);
      if (!content.trim()) {
        attempts.push({ model, error: "empty" });
        continue;
      }
      return { content, model, usage: json?.usage || null };
    } catch (err) {
      if (err instanceof NvidiaError) throw err;
      attempts.push({ model, error: err?.name === "AbortError" ? "timeout" : "network_error" });
    } finally {
      clearTimeout(timer);
    }
  }

  throw new NvidiaError("Ningún modelo de NVIDIA ha respondido", { kind: "all_failed", attempts });
}

/**
 * Comprueba la clave y qué modelos de la lista ofrece la cuenta, sin gastar
 * tokens (GET /models).
 */
export async function nvidiaHealth({ env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 6000 } = {}) {
  const { apiKey, baseUrl, models } = nvidiaConfig(env);
  if (!apiKey) return { ok: false, error: "key_missing", models };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, error: `http_${res.status}`, models };
    const json = await res.json().catch(() => ({}));
    const offered = new Set((json?.data || []).map((m) => m?.id));
    const available = models.filter((m) => offered.has(m));
    return {
      ok: available.length > 0,
      model: available[0] || null,
      models,
      ...(available.length === models.length ? {} : { missing: models.filter((m) => !offered.has(m)) }),
      ...(available.length ? {} : { error: "model_unavailable" }),
    };
  } catch (err) {
    return { ok: false, error: err?.name === "AbortError" ? "timeout" : "network_error", models };
  } finally {
    clearTimeout(timer);
  }
}
