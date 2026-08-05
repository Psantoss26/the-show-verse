import test from "node:test";
import assert from "node:assert/strict";

import { createRefreshCoalescer } from "./refreshCoalescer.js";

const nuevoReloj = () => {
  let t = 0;
  return { ahora: () => t, avanzar: (ms) => { t += ms; } };
};

test("una ráfaga concurrente del mismo token refresca UNA sola vez", async () => {
  const coalesce = createRefreshCoalescer();
  let llamadas = 0;
  const perform = async () => {
    llamadas += 1;
    return { accessToken: "a" + llamadas, refreshToken: "r" + llamadas };
  };

  const resultados = await Promise.all(
    Array.from({ length: 24 }, () => coalesce("T", perform)),
  );

  assert.equal(llamadas, 1, "solo debe refrescar una vez");
  // Todas reciben el MISMO token: es lo que hace que da igual el orden en que
  // lleguen los Set-Cookie.
  assert.equal(new Set(resultados.map((r) => r.refreshToken)).size, 1);
});

test("una rezagada dentro de la ventana reutiliza el resultado", async () => {
  const reloj = nuevoReloj();
  const coalesce = createRefreshCoalescer({ now: reloj.ahora, ttlMs: 15_000 });
  let llamadas = 0;
  const perform = async () => ({ refreshToken: "r" + ++llamadas });

  const primera = await coalesce("T", perform);
  reloj.avanzar(14_000);
  const rezagada = await coalesce("T", perform);

  assert.equal(llamadas, 1);
  assert.equal(rezagada.refreshToken, primera.refreshToken);
});

test("pasada la ventana vuelve a refrescar de verdad", async () => {
  const reloj = nuevoReloj();
  const coalesce = createRefreshCoalescer({ now: reloj.ahora, ttlMs: 15_000 });
  let llamadas = 0;
  const perform = async () => ({ refreshToken: "r" + ++llamadas });

  await coalesce("T", perform);
  reloj.avanzar(15_001);
  const despues = await coalesce("T", perform);

  assert.equal(llamadas, 2, "la rotación debe seguir ocurriendo");
  assert.equal(despues.refreshToken, "r2");
});

test("tokens distintos no se mezclan", async () => {
  const coalesce = createRefreshCoalescer();
  const perform = (id) => async () => ({ refreshToken: "nuevo-" + id });

  const [a, b] = await Promise.all([
    coalesce("T1", perform("1")),
    coalesce("T2", perform("2")),
  ]);

  assert.equal(a.refreshToken, "nuevo-1");
  assert.equal(b.refreshToken, "nuevo-2");
});

test("un refresco fallido no se memoriza", async () => {
  const coalesce = createRefreshCoalescer();
  let llamadas = 0;
  const perform = async () => {
    llamadas += 1;
    return llamadas === 1 ? null : { refreshToken: "bueno" };
  };

  assert.equal(await coalesce("T", perform), null);
  const segunda = await coalesce("T", perform);

  assert.equal(llamadas, 2, "debe reintentar en vez de heredar el fallo");
  assert.equal(segunda.refreshToken, "bueno");
});

test("una excepción tampoco se memoriza", async () => {
  const coalesce = createRefreshCoalescer();
  let llamadas = 0;
  const perform = async () => {
    llamadas += 1;
    if (llamadas === 1) throw new Error("caída puntual");
    return { refreshToken: "bueno" };
  };

  await assert.rejects(() => coalesce("T", perform));
  const segunda = await coalesce("T", perform);

  assert.equal(llamadas, 2);
  assert.equal(segunda.refreshToken, "bueno");
});

test("un objeto de error tampoco se memoriza si el predicado lo dice", async () => {
  const coalesce = createRefreshCoalescer();
  let llamadas = 0;
  const perform = async () => {
    llamadas += 1;
    return llamadas === 1
      ? { accessToken: null, status: 503 }
      : { accessToken: "bueno", status: 200 };
  };
  const esExito = (v) => Boolean(v?.accessToken);

  const fallo = await coalesce("T", perform, esExito);
  assert.equal(fallo.status, 503, "el status del fallo debe llegar al llamante");

  const segunda = await coalesce("T", perform, esExito);
  assert.equal(llamadas, 2, "debe reintentar en vez de heredar el 503");
  assert.equal(segunda.accessToken, "bueno");
});
