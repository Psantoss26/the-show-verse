// src/lib/assistant/conversations.js
//
// Conversaciones del asistente «Qué ver con IA» (/assistant) y la memoria de
// títulos ya recomendados. Todo vive en localStorage del dispositivo: el
// endpoint /api/ai/watch-next no guarda nada, así que la lista de la barra del
// asistente es una comodidad local y puede venir vacía (navegación privada,
// datos borrados). Cada lectura y escritura va en try/catch.

export const CONVERSATIONS_KEY = "watchNextConversations";
export const CONVERSATIONS_LIMIT = 20;
// Mensajes por conversación que se guardan: los más recientes.
export const CONVERSATION_MESSAGES_LIMIT = 60;

export const RECENT_RECOMMENDATIONS_KEY = "watchNextRecent";
const RECENT_RECOMMENDATIONS_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const RECENT_RECOMMENDATIONS_LIMIT = 40;

export const WELCOME_TEXT =
  "Dime qué te apetece ahora mismo y cruzaré tus pendientes, favoritos, historial y valoraciones para proponerte algo con sentido.";

export function newConversationId() {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// Título de la conversación en la lista: el primer mensaje del usuario,
// recortado. Sin mensajes propios, «Conversación nueva».
export function conversationTitle(messages) {
  const first = (Array.isArray(messages) ? messages : []).find(
    (m) => m?.role === "user" && String(m?.text || "").trim(),
  );
  if (!first) return "Conversación nueva";
  const text = String(first.text).trim().replace(/\s+/g, " ");
  return text.length > 48 ? `${text.slice(0, 46).trimEnd()}…` : text;
}

// Una conversación solo merece guardarse si el usuario llegó a escribir algo.
export function hasUserMessages(messages) {
  return (Array.isArray(messages) ? messages : []).some((m) => m?.role === "user");
}

function isConversation(value) {
  return (
    value &&
    typeof value.id === "string" &&
    Array.isArray(value.messages) &&
    Number.isFinite(Number(value.updatedAt))
  );
}

// Inserta o sustituye `conversation` y deja la lista ordenada por la más
// reciente y recortada al límite. Pura: no toca localStorage.
export function upsertConversation(list, conversation) {
  const rest = (Array.isArray(list) ? list : []).filter(
    (c) => isConversation(c) && c.id !== conversation.id,
  );
  const saved = {
    id: conversation.id,
    title: conversationTitle(conversation.messages),
    updatedAt: Number.isFinite(Number(conversation.updatedAt))
      ? Number(conversation.updatedAt)
      : Date.now(),
    messages: conversation.messages.slice(-CONVERSATION_MESSAGES_LIMIT),
  };
  return [saved, ...rest]
    .sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt))
    .slice(0, CONVERSATIONS_LIMIT);
}

export function readConversations() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CONVERSATIONS_KEY) || "[]");
    return Array.isArray(parsed)
      ? parsed
          .filter(isConversation)
          .sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt))
      : [];
  } catch {
    return [];
  }
}

export function writeConversations(list) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(list));
  } catch {
    // Sin almacenamiento (privado, cuota llena): la conversación sigue viva en
    // memoria mientras la página esté abierta.
  }
}

// ---------------------------------------------------------------------------
// Títulos recomendados en los últimos 14 días: se mandan al endpoint para que
// no repita siempre los mismos.

export function recommendationKey(item) {
  return item?.mediaType && item?.id ? `${item.mediaType}:${Number(item.id)}` : null;
}

function readRecentRecommendationEntries() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(RECENT_RECOMMENDATIONS_KEY) || "[]",
    );
    const now = Date.now();
    return Array.isArray(parsed)
      ? parsed.filter(
          (entry) =>
            entry?.key &&
            Number.isFinite(Number(entry?.recommendedAt)) &&
            now - Number(entry.recommendedAt) < RECENT_RECOMMENDATIONS_TTL_MS,
        )
      : [];
  } catch {
    return [];
  }
}

export function readRecentRecommendationKeys() {
  return readRecentRecommendationEntries()
    .map((entry) => entry.key)
    .filter(Boolean)
    .slice(0, RECENT_RECOMMENDATIONS_LIMIT);
}

export function saveRecentRecommendations(items) {
  if (typeof window === "undefined" || !Array.isArray(items) || !items.length) return;
  try {
    const now = Date.now();
    const next = new Map(readRecentRecommendationEntries().map((e) => [e.key, e]));
    for (const item of items) {
      const key = recommendationKey(item);
      if (!key) continue;
      next.set(key, {
        key,
        title: item?.title || "",
        mediaType: item?.mediaType || "",
        recommendedAt: now,
      });
    }
    const sorted = [...next.values()]
      .sort((a, b) => Number(b.recommendedAt) - Number(a.recommendedAt))
      .slice(0, RECENT_RECOMMENDATIONS_LIMIT);
    window.localStorage.setItem(RECENT_RECOMMENDATIONS_KEY, JSON.stringify(sorted));
  } catch {
    // localStorage puede no estar disponible.
  }
}
