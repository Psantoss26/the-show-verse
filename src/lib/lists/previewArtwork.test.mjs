import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  clearListPreviewArtworkCache,
  enrichListPreviewArtwork,
} from "./previewArtwork.js";

const listsPage = readFileSync(
  new URL("../../app/lists/page.jsx", import.meta.url),
  "utf8",
);
// El colage de portada ya no vive dentro de /lists: es un componente compartido
// con la sección Listas del perfil, que pinta la misma tarjeta.
const coverCollage = readFileSync(
  new URL("../../components/lists/ListCoverBackdropCollage.jsx", import.meta.url),
  "utf8",
);

test("las vistas de listas resuelven backdrop y poster en inglés", async () => {
  clearListPreviewArtworkCache();
  const calls = [];
  const items = await enrichListPreviewArtwork(
    [
      {
        id: 10,
        media_type: "movie",
        poster_path: "/poster-es-base.jpg",
        backdrop_path: "/backdrop-es-base.jpg",
      },
    ],
    {
      resolveImages: async (mediaType, id) => {
        calls.push([mediaType, id]);
        return {
          posters: [
            {
              file_path: "/poster-es.jpg",
              iso_639_1: "es",
              width: 2000,
              height: 3000,
            },
            {
              file_path: "/poster-en.jpg",
              iso_639_1: "en",
              width: 1000,
              height: 1500,
            },
          ],
          backdrops: [
            {
              file_path: "/backdrop-es.jpg",
              iso_639_1: "es",
              width: 3840,
              height: 2160,
            },
            {
              file_path: "/backdrop-en.jpg",
              iso_639_1: "en",
              width: 1920,
              height: 1080,
            },
          ],
        };
      },
    },
  );

  assert.deepEqual(calls, [["movie", 10]]);
  assert.equal(items[0]._listPreviewBackdrop, "/backdrop-en.jpg");
  assert.equal(items[0]._listPreviewPoster, "/poster-en.jpg");
  assert.equal(items[0].poster_path, "/poster-es-base.jpg");
  assert.equal(items[0].backdrop_path, "/backdrop-es-base.jpg");
});

test("el backdrop neutro es el respaldo cuando no existe uno inglés", async () => {
  clearListPreviewArtworkCache();
  const [item] = await enrichListPreviewArtwork(
    [{ id: 20, media_type: "tv", backdrop_path: "/backdrop-base.jpg" }],
    {
      resolveImages: async () => ({
        posters: [],
        backdrops: [
          {
            file_path: "/backdrop-es.jpg",
            iso_639_1: "es",
            width: 3840,
            height: 2160,
          },
          {
            file_path: "/backdrop-neutral.jpg",
            iso_639_1: null,
            width: 1920,
            height: 1080,
          },
        ],
      }),
    },
  );

  assert.equal(item._listPreviewBackdrop, "/backdrop-neutral.jpg");
});

test("solo se resuelve el artwork de los cinco primeros títulos", async () => {
  clearListPreviewArtworkCache();
  let calls = 0;
  const items = await enrichListPreviewArtwork(
    Array.from({ length: 7 }, (_, index) => ({
      id: index + 1,
      media_type: "movie",
    })),
    {
      limit: 5,
      resolveImages: async () => {
        calls += 1;
        return { posters: [], backdrops: [] };
      },
    },
  );

  assert.equal(calls, 5);
  assert.equal(items.length, 7);
  assert.equal("_listPreviewPoster" in items[4], true);
  assert.equal("_listPreviewPoster" in items[5], false);
});

test("grid usa backdrops sin recorte y lista muestra cinco posters completos", () => {
  const collage = coverCollage.slice(
    coverCollage.indexOf("function ListCoverBackdropCollage"),
  );
  const posterStrip = listsPage.slice(
    listsPage.indexOf("function ListPreviewPosterStrip"),
    listsPage.indexOf("function Dropdown"),
  );
  // La tarjeta de la cuadrícula tiene que seguir usando el colage compartido,
  // en /lists y en el perfil.
  const profileSection = readFileSync(
    new URL("../../app/u/[username]/ProfileSection.jsx", import.meta.url),
    "utf8",
  );
  const listMode = listsPage.slice(
    listsPage.indexOf("const ListModeRow"),
    listsPage.indexOf("export default function ListsPage"),
  );

  assert.match(collage, /_listPreviewBackdrop/);
  assert.doesNotMatch(collage, /poster_path/);
  assert.doesNotMatch(collage, /object-cover/);
  assert.match(collage, /object-contain/);

  assert.match(posterStrip, /items\.slice\(0, 5\)/);
  assert.match(posterStrip, /_listPreviewPoster/);
  assert.match(posterStrip, /object-contain/);
  assert.match(listMode, /<ListPreviewPosterStrip/);
  assert.match(listsPage, /<ListCoverBackdropCollage/);
  assert.match(profileSection, /<ListCoverBackdropCollage/);
});
