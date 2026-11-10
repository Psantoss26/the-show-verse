import { NextResponse } from "next/server";
import { nvidiaConfig, nvidiaEnabled, nvidiaHealth } from "@/lib/ai/nvidia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";
const GEMINI_MODEL =
  process.env.GEMINI_WATCH_NEXT_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const NVIDIA_ENABLED = nvidiaEnabled();
const WATCH_NEXT_AI_PROVIDER =
  process.env.WATCH_NEXT_AI_PROVIDER ||
  (NVIDIA_ENABLED ? "nvidia" : GEMINI_API_KEY ? "gemini" : OPENAI_API_KEY ? "openai" : "");
const AI_ENABLED = !!(NVIDIA_ENABLED || GEMINI_API_KEY || OPENAI_API_KEY);

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
    .filter((provider) => ["nvidia", "gemini", "openai"].includes(provider));

  const [geminiStatus, nvidiaStatus] = await Promise.all([
    providers.includes("gemini") && GEMINI_API_KEY
      ? testGeminiKey(GEMINI_API_KEY)
      : Promise.resolve(null),
    providers.includes("nvidia") && NVIDIA_ENABLED ? nvidiaHealth() : Promise.resolve(null),
  ]);

  const status = {
    aiEnabled: AI_ENABLED,
    activeProvider: providers[0] || "none",
    providers: {
      nvidia: {
        configured: NVIDIA_ENABLED,
        models: nvidiaConfig().models,
        ...(nvidiaStatus ?? { ok: false, error: "not_configured" }),
      },
      gemini: {
        configured: !!GEMINI_API_KEY,
        model: GEMINI_MODEL,
        ...(geminiStatus ?? { ok: false, error: "not_configured" }),
      },
      openai: {
        configured: !!OPENAI_API_KEY,
        model: process.env.OPENAI_WATCH_NEXT_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini",
      },
    },
    activeProviders: providers,
    mode: AI_ENABLED ? "ai" : "ranking_only",
  };

  return NextResponse.json(status);
}
