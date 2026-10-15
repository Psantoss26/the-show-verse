import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const socialClientPath = new URL(
  "../../app/social/SocialClient.jsx",
  import.meta.url,
);

const profileSectionPath = new URL(
  "../../app/u/[username]/ProfileSection.jsx",
  import.meta.url,
);

test("EventoResena en SocialClient no estira ni recorta el backdrop en pantallas pequeñas", async () => {
  const source = await readFile(socialClientPath, "utf8");
  const funcStart = source.indexOf("function EventoResena(");
  assert.ok(funcStart >= 0, "EventoResena debe existir en SocialClient.jsx");
  const funcEnd = source.indexOf("function ListaEventos(", funcStart);
  assert.ok(funcEnd > funcStart, "ListaEventos debe seguir a EventoResena");

  const snippet = source.slice(funcStart, funcEnd);
  // El contenedor debe alinear al inicio (items-start) para evitar align-items: stretch por defecto
  assert.match(snippet, /<div className="flex items-start gap-3">/);
  // El cartel con backdrop debe tener self-start para garantizar que aspect-video no se deforme
  assert.match(snippet, /\$\{BACKDROP_FILA\} self-start/);
});

test("ActivityReview en ProfileSection no estira ni recorta el backdrop con textos largos", async () => {
  const source = await readFile(profileSectionPath, "utf8");
  const funcStart = source.indexOf("function ActivityReview(");
  assert.ok(funcStart >= 0, "ActivityReview debe existir en ProfileSection.jsx");
  const funcEnd = source.indexOf("function ActivityRow(", funcStart);
  assert.ok(funcEnd > funcStart, "ActivityRow debe seguir a ActivityReview");

  const snippet = source.slice(funcStart, funcEnd);
  assert.match(snippet, /<div className="flex items-start gap-3">/);
  assert.match(snippet, /\$\{ACTIVITY_BACKDROP_CLASS\} self-start/);
});
