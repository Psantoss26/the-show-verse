import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const navbar = readFileSync(
  new URL("../../components/Navbar.jsx", import.meta.url),
  "utf8",
);

test("Recomendaciones forma parte de la navegación principal de escritorio", () => {
  const desktopNav = navbar.slice(
    navbar.indexOf("{/* ---------------- Desktop ---------------- */}"),
    navbar.indexOf("{/* ---------------- Mobile ---------------- */}"),
  );

  assert.match(desktopNav, /href="\/recommendations"/);
  assert.match(desktopNav, /data-desktop-nav-href="\/recommendations"/);
  assert.match(desktopNav, /navPrefetchHandlers\("\/recommendations"\)/);
  assert.match(desktopNav, /nav_recommendations/);
});

test("la pestaña activa de Recomendaciones conserva su identidad verde", () => {
  assert.match(
    navbar,
    /href === "\/recommendations"[\s\S]*?text-emerald-300 font-bold/,
  );
  assert.match(
    navbar,
    /case "\/recommendations":[\s\S]*?from-emerald-500\/25/,
  );
});
