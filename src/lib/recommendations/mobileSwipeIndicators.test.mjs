import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const recommendationsClient = readFileSync(
  new URL("../../app/recommendations/RecommendationsClient.jsx", import.meta.url),
  "utf8",
);

test("los indicadores móviles compensan el movimiento de la portada", () => {
  assert.match(recommendationsClient, /stampX = useTransform\(x, \(value\) => -value\)/);
  assert.match(recommendationsClient, /stampY = useTransform\(y, \(value\) => -value\)/);
  assert.match(
    recommendationsClient,
    /counterMotion={{ x: stampX, y: stampY, rotate: stampRotate }}/,
  );
});

test("cada gesto móvil revela su indicador en el lado contrario", () => {
  assert.match(
    recommendationsClient,
    /action={SWIPE_ACTIONS\.DISMISS}[\s\S]*?visibility="mobile"[\s\S]*?className="right-5/,
  );
  assert.match(
    recommendationsClient,
    /action={SWIPE_ACTIONS\.WATCHLIST}[\s\S]*?visibility="mobile"[\s\S]*?className="left-5/,
  );
  assert.match(
    recommendationsClient,
    /action={SWIPE_ACTIONS\.FAVORITE}[\s\S]*?visibility="mobile"[\s\S]*?className="bottom-6/,
  );
});

test("los indicadores anteriores permanecen reservados para escritorio", () => {
  assert.equal(
    (recommendationsClient.match(/visibility="desktop"/g) || []).length,
    3,
  );
});
