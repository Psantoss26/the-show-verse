import assert from "node:assert/strict";
import test from "node:test";
import { canonicalDetailsHref, sendEmbeddedDetailsAction } from "./embeddedDetails.js";

test("compartir y login usan la ficha pública, conservando parámetros y fragmentos", () => {
  const origin = "https://showverse.example";
  assert.equal(
    canonicalDetailsHref("/embed/details/movie/550?tab=cast#reviews", origin).href,
    origin + "/details/movie/550?tab=cast#reviews",
  );
  assert.equal(
    canonicalDetailsHref("/login?next=%2Fembed%2Fdetails%2Ftv%2F1399", origin).searchParams.get("next"),
    "/details/tv/1399",
  );
  assert.equal(
    canonicalDetailsHref("https://external.example/test", origin).origin,
    "https://external.example",
  );
});

test("el router normal y el render de servidor no emiten mensajes al padre", () => {
  assert.equal(sendEmbeddedDetailsAction("close"), false);
});
