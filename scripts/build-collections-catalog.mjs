#!/usr/bin/env node
// Genera src/data/tmdbCollectionsCatalog.json: el catálogo de TODAS las
// colecciones de TMDb que merece la pena enseñar en /lists → Colecciones.
//
// TMDb no tiene un endpoint que liste colecciones. Sí publica cada día un
// volcado con todos sus ids (files.tmdb.org/p/exports), pero solo con id y
// nombre: sin popularidad ni número de películas. Este script recorre ese
// volcado, pide cada colección en español y se queda con las que:
//   - tienen al menos 2 películas y póster;
//   - no son solo para adultos.
// Para cada una guarda [id, nombre, nº de películas, votos], ordenadas por
// votos (suma de vote_count de sus películas, una medida estable de lo
// conocida que es; la popularidad de TMDb fluctúa a diario).
//
// Uso (≈ 1-2 min):  node scripts/build-collections-catalog.mjs
// Lee NEXT_PUBLIC_TMDB_API_KEY del entorno o de .env.local / .env.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(ROOT, "src/data/tmdbCollectionsCatalog.json");
const CONCURRENCY = 24;
const MIN_PARTS = 2;

async function readKey() {
  if (process.env.NEXT_PUBLIC_TMDB_API_KEY) return process.env.NEXT_PUBLIC_TMDB_API_KEY;
  for (const file of [".env.local", ".env"]) {
    try {
      const text = await readFile(path.join(ROOT, file), "utf8");
      const match = text.match(/^NEXT_PUBLIC_TMDB_API_KEY=(.*)$/m);
      if (match) return match[1].trim().replace(/^["']|["']$/g, "");
    } catch {
      // siguiente
    }
  }
  throw new Error("Falta NEXT_PUBLIC_TMDB_API_KEY");
}

async function downloadExport() {
  // El volcado del día se publica de madrugada (UTC): se prueba hoy y, si aún
  // no está, los días anteriores.
  for (let back = 0; back < 4; back += 1) {
    const date = new Date(Date.now() - back * 86_400_000);
    const stamp = `${String(date.getUTCMonth() + 1).padStart(2, "0")}_${String(date.getUTCDate()).padStart(2, "0")}_${date.getUTCFullYear()}`;
    const res = await fetch(`https://files.tmdb.org/p/exports/collection_ids_${stamp}.json.gz`);
    if (!res.ok) continue;
    const text = gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8");
    return text
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line).id)
      .filter(Number.isFinite);
  }
  throw new Error("No se pudo descargar el volcado de colecciones de TMDb");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchCollection(id, key) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const res = await fetch(`https://api.themoviedb.org/3/collection/${id}?api_key=${key}&language=es-ES`);
    if (res.ok) return res.json();
    if (res.status === 404) return null;
    await sleep(res.status === 429 ? 1000 * (attempt + 1) : 300 * (attempt + 1));
  }
  return null;
}

// Mismo nombre que enseña el índice (ver /api/tmdb/collections/featured).
export function cleanCollectionName(name) {
  return String(name || "")
    .replace(/ Collection$/i, "")
    .replace(/\s*-\s*Colecci[oó]n$/i, "")
    .trim();
}

async function main() {
  const key = await readKey();
  const ids = await downloadExport();
  console.log(`Volcado: ${ids.length} colecciones`);

  const catalog = [];
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const id = ids[next];
      next += 1;
      const c = await fetchCollection(id, key);
      done += 1;
      if (done % 500 === 0) console.log(`  ${done}/${ids.length}`);
      const parts = Array.isArray(c?.parts) ? c.parts : [];
      if (!c?.poster_path || parts.length < MIN_PARTS) continue;
      if (parts.every((part) => part?.adult)) continue;
      const votes = parts.reduce((sum, part) => sum + (Number(part?.vote_count) || 0), 0);
      catalog.push([c.id, cleanCollectionName(c.name) || `Colección ${c.id}`, parts.length, votes]);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  catalog.sort((a, b) => b[3] - a[3] || a[0] - b[0]);
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(
    OUT,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      // [id, nombre, nº de películas, votos], de más a menos votos.
      fields: ["id", "name", "items", "votes"],
      collections: catalog,
    }),
  );
  console.log(`Catálogo: ${catalog.length} colecciones → ${path.relative(ROOT, OUT)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
