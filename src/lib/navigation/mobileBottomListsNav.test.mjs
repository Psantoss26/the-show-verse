import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const navbarPath = new URL("../../components/Navbar.jsx", import.meta.url);

test("la barra inferior móvil muestra Listas en lugar de Recomendaciones", async () => {
  const navbar = await readFile(navbarPath, "utf8");
  const mobileBottomBar = navbar.slice(
    navbar.indexOf("{/* ===================== BOTTOM BAR (MÓVIL)"),
    navbar.indexOf("{/* ===================== DRAWER MENÚ (MÓVIL)"),
  );

  assert.match(
    mobileBottomBar,
    /href="\/lists"[\s\S]*?navLinkClassMobileBottom\("\/lists", "purple"\)[\s\S]*?aria-label=\{t\("nav_lists", "Listas"\)\}[\s\S]*?<ListVideo/,
  );
  assert.doesNotMatch(mobileBottomBar, /href="\/recommendations"/);
});
