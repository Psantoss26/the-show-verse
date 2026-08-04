import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const navbar = readFileSync(
  new URL("../../components/Navbar.jsx", import.meta.url),
  "utf8",
);

test("Recomendaciones se muestra como acceso de icono en el lado derecho", () => {
  const desktopLeft = navbar.slice(
    navbar.indexOf("{/* Izquierda */}"),
    navbar.indexOf("{/* Centro:"),
  );
  const desktopRight = navbar.slice(
    navbar.indexOf("{/* Derecha */}"),
    navbar.indexOf("{/* ---------------- Mobile ---------------- */}"),
  );

  assert.doesNotMatch(desktopLeft, /href="\/recommendations"/);
  assert.match(desktopRight, /href="\/recommendations"/);
  assert.match(desktopRight, /iconLinkClass\("\/recommendations", "green"\)/);
  assert.match(desktopRight, /aria-label={t\("nav_recommendations", "Recomendaciones"\)}/);
  assert.match(desktopRight, /<ThumbsUp/);
});

test("el acceso activo de Recomendaciones conserva su identidad verde", () => {
  assert.match(
    navbar,
    /isActive\("\/recommendations"\)[\s\S]*?bg-emerald-500\/20/,
  );
});
