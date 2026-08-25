import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("consulta la pertenencia a listas con una sola petición autenticada", async () => {
  const [detailModal, detailsClient, listsRoute, backendListsRoute] = await Promise.all([
    readSource("../../components/dashboard/DetailModal.jsx"),
    readSource("../../components/DetailsClient.jsx"),
    readSource("../../app/api/lists/route.js"),
    readSource("../../../backend/src/routes/lists.js"),
  ]);

  assert.match(listsRoute, /\/v1\/lists\/membership/);
  assert.match(backendListsRoute, /fastify\.get\('\/membership'/);
  assert.ok(
    backendListsRoute.indexOf("fastify.get('/membership'") <
      backendListsRoute.indexOf("fastify.get('/:id'"),
    "la ruta estática debe resolverse antes que /:id",
  );

  assert.match(detailModal, /fetch\(`\/api\/lists\?\$\{membershipParams\.toString\(\)\}`/);
  assert.doesNotMatch(detailModal, /backendGetListDetails/);
  assert.doesNotMatch(detailModal, /Promise\.all\(\s*lists\.map/);

  assert.match(detailsClient, /fetch\(`\/api\/lists\?\$\{membershipParams\.toString\(\)\}`/);
  assert.doesNotMatch(detailsClient, /backendGetListDetails/);
  assert.doesNotMatch(detailsClient, /const concurrency = 5/);
});
