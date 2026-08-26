import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const paths = {
  client: new URL("../../components/DetailsClient.jsx", import.meta.url),
  loader: new URL("../../components/DetailsPageLoader.jsx", import.meta.url),
  detailPage: new URL("../../app/details/[type]/[id]/page.jsx", import.meta.url),
  tvPage: new URL("../../app/details/tv/[id]/page.jsx", import.meta.url),
};

test("la ficha muestra una única sección de comentarios comunitarios", async () => {
  const source = await readFile(paths.client, "utf8");

  assert.doesNotMatch(source, /Críticas de Usuarios/);
  assert.doesNotMatch(source, /\breviews\b/);
  assert.match(source, /const commentsCount = Number\(tComments\?\.total \|\| 0\) \|\| 0/);
  assert.match(source, /traktAddComment/);
});

test("las rutas de detalle dejan de solicitar las críticas de TMDb", async () => {
  const [loader, detailPage, tvPage] = await Promise.all([
    readFile(paths.loader, "utf8"),
    readFile(paths.detailPage, "utf8"),
    readFile(paths.tvPage, "utf8"),
  ]);

  assert.doesNotMatch(loader, /getReviews|initialReviews|\breviews\b/);
  assert.doesNotMatch(detailPage, /\breviews\b/);
  assert.doesNotMatch(tvPage, /\breviews\b/);
});
