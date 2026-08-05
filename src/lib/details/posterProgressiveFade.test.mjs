import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const detailsClient = readFileSync(
  new URL("../../components/DetailsClient.jsx", import.meta.url),
  "utf8",
);

test("el póster LOW permanece opaco mientras HIGH entra por encima", () => {
  const lowLayer = detailsClient.slice(
    detailsClient.indexOf("{/* LOW */}"),
    detailsClient.indexOf("{/* HIGH:"),
  );

  assert.match(
    lowLayer,
    /currentLowLoaded \? "opacity-100" : "opacity-0"/,
  );
  assert.doesNotMatch(lowLayer, /currentHighLoaded \? "opacity-0"/);
});

test("la versión HIGH conserva su fundido de entrada sobre LOW", () => {
  const highLayer = detailsClient.slice(
    detailsClient.indexOf("{/* HIGH:"),
    detailsClient.indexOf("{showNoPoster"),
  );

  assert.match(
    highLayer,
    /currentHighLoaded \? "opacity-100" : "opacity-0"/,
  );
  assert.match(highLayer, /duration-700/);
});
