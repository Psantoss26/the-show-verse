import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const clientSource = await readFile(
  new URL("../../components/DetailsClient.jsx", import.meta.url),
  "utf8",
);

test("cada pestaña de comentarios consulta y muestra su propia página", () => {
  assert.match(clientSource, /const COMMENTS_PAGE_SIZE = 5/);
  assert.match(
    clientSource,
    /tCommentsTab === "likes30"\s*\? "likes30"/,
    "Top 30 Días debe delegar el filtro temporal a la API paginada",
  );
  assert.match(
    clientSource,
    /page: tComments\.page,\s*limit: COMMENTS_PAGE_SIZE/,
    "la solicitud debe pedir la página activa con un tamaño estable",
  );
  assert.match(
    clientSource,
    /items,\s*page,\s*pageCount,\s*hasMore: page < pageCount/,
    "la respuesta debe reemplazar el contenido con la página recibida",
  );
  assert.doesNotMatch(clientSource, /COMMENTS_SECTION_LIMIT/);
});

test("los comentarios ofrecen navegación anterior y siguiente accesible", () => {
  assert.match(clientSource, /aria-label="Paginación de comentarios"/);
  assert.match(clientSource, /Página \{tComments\.page\} de \{tComments\.pageCount\}/);
  assert.match(clientSource, /selectCommentsPage\(tComments\.page - 1\)/);
  assert.match(clientSource, /selectCommentsPage\(tComments\.page \+ 1\)/);
  assert.match(clientSource, /aria-controls="comments-list"/);
});
