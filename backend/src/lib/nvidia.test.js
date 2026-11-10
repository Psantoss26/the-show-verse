import assert from "node:assert/strict";
import test from "node:test";

import {
  NVIDIA_DEFAULT_MODELS,
  NvidiaError,
  extractJsonText,
  nvidiaChat,
  nvidiaConfig,
  nvidiaHealth,
} from "./nvidia.js";

const ENV = { NVIDIA_API_KEY: "nvapi-test" };

function reply(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

function okChat(content) {
  return reply(200, { choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
}

function fakeFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: init?.body ? JSON.parse(init.body) : null });
    const next = responses.shift();
    if (typeof next === "function") return next(url, init);
    return next;
  };
  fn.calls = calls;
  return fn;
}

test("configuración: modelos por defecto y lista propia", () => {
  assert.deepEqual(nvidiaConfig({}).models, NVIDIA_DEFAULT_MODELS);
  assert.equal(nvidiaConfig({}).apiKey, "");
  const cfg = nvidiaConfig({ NVIDIA_MODEL: " a/b , c/d ,", NVIDIA_BASE_URL: "https://x.test/v1/" });
  assert.deepEqual(cfg.models, ["a/b", "c/d"]);
  assert.equal(cfg.baseUrl, "https://x.test/v1");
});

test("extractJsonText limpia razonamiento, bloques y texto alrededor", () => {
  assert.equal(extractJsonText('{"a":1}'), '{"a":1}');
  assert.equal(extractJsonText('<think>pienso {"x":0}</think>\n{"a":1}'), '{"a":1}');
  assert.equal(extractJsonText('```json\n{"a":1}\n```'), '{"a":1}');
  assert.equal(extractJsonText('Aquí va: {"a":{"b":2}} ¡listo!'), '{"a":{"b":2}}');
  assert.equal(extractJsonText("sin json"), "");
  assert.equal(extractJsonText(""), "");
});

test("sin clave no llama a la API", async () => {
  const fetchImpl = fakeFetch([]);
  await assert.rejects(nvidiaChat({ user: "hola", env: {}, fetchImpl }), (err) => err instanceof NvidiaError && err.kind === "not_configured");
  assert.equal(fetchImpl.calls.length, 0);
});

test("responde el primer modelo con la petición en formato OpenAI", async () => {
  const fetchImpl = fakeFetch([okChat('{"ok":true}')]);
  const out = await nvidiaChat({ system: "sys", user: "hola", env: ENV, fetchImpl, maxTokens: 50 });
  assert.equal(out.content, '{"ok":true}');
  assert.equal(out.model, NVIDIA_DEFAULT_MODELS[0]);
  const [call] = fetchImpl.calls;
  assert.equal(call.url, "https://integrate.api.nvidia.com/v1/chat/completions");
  assert.equal(call.init.headers.Authorization, "Bearer nvapi-test");
  assert.equal(call.body.model, NVIDIA_DEFAULT_MODELS[0]);
  assert.equal(call.body.max_tokens, 50);
  assert.equal(call.body.response_format, undefined);
  assert.equal(call.body.reasoning_effort, "low");
  assert.deepEqual(call.body.chat_template_kwargs, { enable_thinking: false });
  assert.deepEqual(call.body.messages, [
    { role: "system", content: "sys" },
    { role: "user", content: "hola" },
  ]);
});

test("con thinking: true no limita el razonamiento", async () => {
  const fetchImpl = fakeFetch([okChat("x")]);
  await nvidiaChat({ user: "x", env: ENV, fetchImpl, thinking: true });
  assert.equal(fetchImpl.calls[0].body.reasoning_effort, undefined);
  assert.equal(fetchImpl.calls[0].body.chat_template_kwargs, undefined);
});

test("con 410, 5xx o respuesta vacía pasa al siguiente modelo", async () => {
  const env = { ...ENV, NVIDIA_MODEL: "m/uno,m/dos,m/tres" };
  const fetchImpl = fakeFetch([reply(410, "gone"), okChat("   "), okChat("vale")]);
  const out = await nvidiaChat({ user: "x", env, fetchImpl });
  assert.equal(out.model, "m/tres");
  assert.deepEqual(fetchImpl.calls.map((c) => c.body.model), ["m/uno", "m/dos", "m/tres"]);
});

test("con 401 para sin probar más modelos", async () => {
  const fetchImpl = fakeFetch([reply(401, "nope"), okChat("no debería")]);
  await assert.rejects(nvidiaChat({ user: "x", env: ENV, fetchImpl }), (err) => err.kind === "auth");
  assert.equal(fetchImpl.calls.length, 1);
});

test("tiempo agotado y error de red cuentan como fallo del modelo", async () => {
  const hang = (_url, init) =>
    new Promise((_, reject) => {
      init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    });
  const fetchImpl = fakeFetch([hang, () => Promise.reject(new TypeError("fetch failed"))]);
  await assert.rejects(nvidiaChat({ user: "x", env: ENV, fetchImpl, timeoutMs: 20 }), (err) => {
    assert.equal(err.kind, "all_failed");
    assert.deepEqual(err.attempts.map((a) => a.error), ["timeout", "network_error"]);
    return true;
  });
});

test("health: comprueba la clave y los modelos que ofrece la cuenta", async () => {
  assert.deepEqual((await nvidiaHealth({ env: {} })).error, "key_missing");

  const listed = reply(200, { data: [{ id: NVIDIA_DEFAULT_MODELS[1] }, { id: "otro/modelo" }] });
  const partial = await nvidiaHealth({ env: ENV, fetchImpl: fakeFetch([listed]) });
  assert.equal(partial.ok, true);
  assert.equal(partial.model, NVIDIA_DEFAULT_MODELS[1]);
  assert.deepEqual(partial.missing, [NVIDIA_DEFAULT_MODELS[0]]);

  const none = await nvidiaHealth({ env: ENV, fetchImpl: fakeFetch([reply(200, { data: [] })]) });
  assert.equal(none.ok, false);
  assert.equal(none.error, "model_unavailable");

  const denied = await nvidiaHealth({ env: ENV, fetchImpl: fakeFetch([reply(401, {})]) });
  assert.equal(denied.error, "http_401");
});
