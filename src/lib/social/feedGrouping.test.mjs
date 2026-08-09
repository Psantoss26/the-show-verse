import assert from "node:assert/strict";
import test from "node:test";

import { groupSocialFeed, accionDeEvento } from "./feedGrouping.js";

const AHORA = new Date("2026-08-09T12:00:00Z");

function evento(id, iso, extra = {}) {
  return { id, createdAt: iso, type: "watched", ...extra };
}

test("sin agrupar devuelve null, no un grupo con todo", () => {
  assert.equal(groupSocialFeed([evento(1, "2026-08-09T10:00:00Z")], "none"), null);
  assert.equal(groupSocialFeed([], "day"), null);
});

test("por día: hoy y ayer se dicen por su nombre", () => {
  const grupos = groupSocialFeed(
    [
      evento(1, "2026-08-09T10:00:00Z"),
      evento(2, "2026-08-08T10:00:00Z"),
      evento(3, "2026-06-02T10:00:00Z"),
    ],
    "day",
    { ahora: AHORA },
  );
  assert.deepEqual(
    grupos.map((g) => g.label),
    ["Hoy", "Ayer", "2 de junio"],
  );
  assert.deepEqual(grupos.map((g) => g.items.length), [1, 1, 1]);
});

test("por día: el orden de los grupos sigue al de la barra", () => {
  const eventos = [evento(1, "2026-08-09T10:00:00Z"), evento(2, "2026-08-01T10:00:00Z")];
  const reciente = groupSocialFeed(eventos, "day", { ahora: AHORA, orden: "recent" });
  const antiguo = groupSocialFeed(eventos, "day", { ahora: AHORA, orden: "oldest" });
  assert.deepEqual(reciente.map((g) => g.label), ["Hoy", "1 de agosto"]);
  assert.deepEqual(antiguo.map((g) => g.label), ["1 de agosto", "Hoy"]);
});

test("por mes: un solo grupo por mes, con el año escrito", () => {
  const grupos = groupSocialFeed(
    [
      evento(1, "2026-08-09T10:00:00Z"),
      evento(2, "2026-08-01T10:00:00Z"),
      evento(3, "2026-07-30T10:00:00Z"),
    ],
    "month",
    { ahora: AHORA },
  );
  assert.deepEqual(
    grupos.map((g) => [g.label, g.items.length]),
    [
      ["Agosto de 2026", 2],
      ["Julio de 2026", 1],
    ],
  );
});

test("por acción: list y list_item caen en el mismo grupo", () => {
  assert.equal(accionDeEvento({ type: "list_item" }), "list");
  const grupos = groupSocialFeed(
    [
      evento(1, "2026-08-09T10:00:00Z", { type: "list" }),
      evento(2, "2026-08-09T10:00:00Z", { type: "list_item" }),
      evento(3, "2026-08-09T10:00:00Z", { type: "review" }),
    ],
    "action",
    { ahora: AHORA },
  );
  // Ordenado por tamaño: Listas (2) antes que Reseñas (1).
  assert.deepEqual(
    grupos.map((g) => [g.label, g.items.length]),
    [
      ["Listas", 2],
      ["Reseñas", 1],
    ],
  );
});

test("por persona: agrupa por autor y cae en 'Tu actividad' sin autor", () => {
  const grupos = groupSocialFeed(
    [
      evento(1, "2026-08-09T10:00:00Z", { author: { username: "ana", displayName: "Ana" } }),
      evento(2, "2026-08-09T10:00:00Z", { author: { username: "ana", displayName: "Ana" } }),
      evento(3, "2026-08-09T10:00:00Z"),
    ],
    "person",
    { ahora: AHORA },
  );
  assert.deepEqual(
    grupos.map((g) => [g.label, g.items.length]),
    [
      ["Ana", 2],
      ["Tu actividad", 1],
    ],
  );
});

test("una fecha inválida no revienta ni desaparece: cae en 'Sin fecha'", () => {
  const grupos = groupSocialFeed(
    [evento(1, "no es una fecha"), evento(2, "2026-08-09T10:00:00Z")],
    "day",
    { ahora: AHORA },
  );
  const sinFecha = grupos.find((g) => g.label === "Sin fecha");
  assert.ok(sinFecha, "debe existir el grupo 'Sin fecha'");
  assert.equal(sinFecha.items.length, 1);
  assert.equal(grupos.reduce((n, g) => n + g.items.length, 0), 2);
});
