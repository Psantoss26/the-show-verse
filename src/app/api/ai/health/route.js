import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";
const GEMINI_MODEL =
  process.env.GEMINI_WATCH_NEXT_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OLLAMA_BASE_URL = (
  process.env.OLLAMA_BASE_URL || "http://ollama:11434"
).replace(/\/+$/, "");
const OLLAMA_MODEL =
  process.env.OLLAMA_WATCH_NEXT_MODEL ||
  process.env.OLLAMA_MODEL ||
  "qwen2.5:1.5b";
const WATCH_NEXT_AI_PROVIDER =
  process.env.WATCH_NEXT_AI_PROVIDER ||
  (GEMINI_API_KEY ? "gemini" : OPENAI_API_KEY ? "openai" : "ollama");
const OLLAMA_ENABLED = String(WATCH_NEXT_AI_PROVIDER)
  .toLowerCase()
  .split(",")
  .some((p) => p.trim() === "ollama");

// Comprueba que Ollama responde y que el modelo configurado está descargado.
async function testOllama() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      cache: "no-store",
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    const json = await res.json().catch(() => ({}));
    const names = (json?.models || []).map((m) => m.name);
    const hasModel = names.some(
      (n) => n === OLLAMA_MODEL || n === `${OLLAMA_MODEL}:latest`,
    );
    return {
      ok: hasModel,
      model: OLLAMA_MODEL,
      ...(hasModel ? {} : { error: "model_not_pulled", available: names.slice(0, 6) }),
    };
  } catch (err) {
    return {
      ok: false,
      error: err?.name === "AbortError" ? "timeout" : "network_error",
    };
  }
}

async function testGeminiKey(apiKey) {
  if (!apiKey) return { ok: false, error: "key_missing" };
  try {
    const model = encodeURIComponent(GEMINI_MODEL);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Responde solo: OK" }] }],
          generationConfig: { maxOutputTokens: 8, temperature: 0 },
        }),
        cache: "no-store",
        signal: controller.signal,
      },
    ).finally(() => clearTimeout(timeout));

    if (res.status === 200) return { ok: true, model: GEMINI_MODEL };
    const json = await res.json().catch(() => ({}));
    return {
      ok: false,
      error: json?.error?.status || json?.error?.code || `http_${res.status}`,
      detail: json?.error?.message?.slice(0, 80) || null,
    };
  } catch (err) {
    return { ok: false, error: err?.name === "AbortError" ? "timeout" : "network_error" };
  }
}

export async function GET() {
  const providers = String(WATCH_NEXT_AI_PROVIDER)
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(
      (provider) =>
        provider === "openai" ||
        provider === "gemini" ||
        provider === "ollama",
    );

  const [geminiStatus, ollamaStatus] = await Promise.all([
    providers.includes("gemini") && GEMINI_API_KEY
      ? testGeminiKey(GEMINI_API_KEY)
      : Promise.resolve(null),
    providers.includes("ollama") ? testOllama() : Promise.resolve(null),
  ]);

  const status = {
    aiEnabled: !!(GEMINI_API_KEY || OPENAI_API_KEY || OLLAMA_ENABLED),
    activeProvider: providers[0] || "none",
    providers: {
      gemini: {
        configured: !!GEMINI_API_KEY,
        model: GEMINI_MODEL,
        ...(geminiStatus ?? { ok: false, error: "not_configured" }),
      },
      openai: {
        configured: !!OPENAI_API_KEY,
        model: process.env.OPENAI_WATCH_NEXT_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini",
      },
      ollama: {
        configured: OLLAMA_ENABLED,
        baseUrl: OLLAMA_BASE_URL,
        model: OLLAMA_MODEL,
        ...(ollamaStatus ?? { ok: false, error: "not_configured" }),
      },
    },
    activeProviders: providers,
    mode:
      GEMINI_API_KEY || OPENAI_API_KEY || OLLAMA_ENABLED
        ? "ai"
        : "ranking_only",
  };

  return NextResponse.json(status);
}
