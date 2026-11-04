import assert from "node:assert/strict";
import test from "node:test";

import {
  CONVERSATIONS_LIMIT,
  CONVERSATION_MESSAGES_LIMIT,
  conversationTitle,
  hasUserMessages,
  upsertConversation,
} from "./conversations.js";

test("el título es el primer mensaje del usuario, recortado", () => {
  assert.equal(conversationTitle([]), "Conversación nueva");
  assert.equal(
    conversationTitle([
      { role: "assistant", text: "Hola" },
      { role: "user", text: "  Algo   de terror " },
      { role: "user", text: "otra cosa" },
    ]),
    "Algo de terror",
  );
  const long = conversationTitle([{ role: "user", text: "a".repeat(80) }]);
  assert.ok(long.length <= 48);
  assert.ok(long.endsWith("…"));
});

test("solo cuenta como conversación si el usuario escribió", () => {
  assert.equal(hasUserMessages([{ role: "assistant", text: "Hola" }]), false);
  assert.equal(hasUserMessages([{ role: "user", text: "x" }]), true);
});

test("upsert sustituye, ordena por la más reciente y recorta", () => {
  const a = { id: "a", updatedAt: 1, messages: [{ role: "user", text: "A" }] };
  const b = { id: "b", updatedAt: 2, messages: [{ role: "user", text: "B" }] };
  let list = upsertConversation([], a);
  list = upsertConversation(list, b);
  assert.deepEqual(list.map((c) => c.id), ["b", "a"]);

  list = upsertConversation(list, { ...a, updatedAt: 3 });
  assert.deepEqual(list.map((c) => c.id), ["a", "b"]);
  assert.equal(list[0].title, "A");

  let many = [];
  for (let i = 0; i < CONVERSATIONS_LIMIT + 5; i += 1) {
    many = upsertConversation(many, { id: `c${i}`, updatedAt: i, messages: [] });
  }
  assert.equal(many.length, CONVERSATIONS_LIMIT);
  assert.equal(many[0].id, `c${CONVERSATIONS_LIMIT + 4}`);

  const huge = upsertConversation([], {
    id: "h",
    updatedAt: 1,
    messages: Array.from({ length: CONVERSATION_MESSAGES_LIMIT + 10 }, (_, i) => ({
      role: "user",
      text: String(i),
    })),
  });
  assert.equal(huge[0].messages.length, CONVERSATION_MESSAGES_LIMIT);
  assert.equal(huge[0].messages.at(-1).text, String(CONVERSATION_MESSAGES_LIMIT + 9));
});

test("ignora entradas corruptas de la lista guardada", () => {
  const list = upsertConversation([null, { id: 3 }, "x"], {
    id: "ok",
    updatedAt: 1,
    messages: [],
  });
  assert.deepEqual(list.map((c) => c.id), ["ok"]);
});
