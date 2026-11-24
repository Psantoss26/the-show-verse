import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

// Cada modal que abre un botón de acción de la ficha lleva junto al título el
// icono de ese botón, con el mismo componente que favoritos y pendientes.
const MODALS = [
  ["./ListToggleConfirmModal.jsx", /<ModalTitleIcon icon=\{Icon\} tone=\{config\.iconTone\}/],
  ["./EpisodeRatingsModal.jsx", /<ModalTitleIcon icon=\{BarChart3\} tone="neutral"/],
  ["./ExternalLinksModal.jsx", /<ModalTitleIcon icon=\{isPlatformsMode \? MonitorPlay : Link2\} tone="neutral"/],
  ["./FollowingActivity.jsx", /<ModalTitleIcon icon=\{UsersRound\} tone="neutral"/],
  ["./DetailsShareSheet.jsx", /<ModalTitleIcon icon=\{Share2\} tone="neutral"/],
  ["./TraktCommentModal.jsx", /<ModalTitleIcon icon=\{MessageSquare\} tone="orange"/],
  ["./AddToListModal.jsx", /<ModalTitleIcon icon=\{ListVideo\} tone="purple"/],
  ["../StarRating.jsx", /<ModalTitleIcon icon=\{Star\} tone="yellow"/],
  ["../trakt/TraktWatchedModal.jsx", /<ModalTitleIcon icon=\{Eye\} tone="green"/],
  ["../trakt/TraktEpisodesWatchedModal.jsx", /<ModalTitleIcon icon=\{Eye\} tone="green"/],
];

for (const [path, pattern] of MODALS) {
  test(`${path} muestra el icono de su botón junto al título`, async () => {
    const source = await read(path);
    assert.match(source, /import ModalTitleIcon from "@\/components\/details\/ModalTitleIcon"/);
    assert.match(source, pattern);
  });
}

test("el icono del título es decorativo y tiene un tamaño fijo que no encoge", async () => {
  const source = await read("./ModalTitleIcon.jsx");
  assert.match(source, /aria-hidden="true"/);
  assert.match(source, /h-11 w-11 shrink-0/);
  assert.match(source, /<Icon className="h-5 w-5"/);
});
