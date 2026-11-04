import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const navbarPath = new URL("../../components/Navbar.jsx", import.meta.url);

test("el navbar móvil deja el asistente en el menú y ya no enlaza Recomendaciones", async () => {
  const navbar = await readFile(navbarPath, "utf8");

  const mobileNavbar = navbar.slice(
    navbar.indexOf("{/* ---------------- Mobile ---------------- */}"),
    navbar.indexOf("{/* ===================== BOTTOM BAR (MÓVIL)"),
  );

  assert.match(
    mobileNavbar,
    /aria-label="Abrir menú"[\s\S]*?<MenuIcon className="w-6 h-6"/,
  );
  assert.match(
    mobileNavbar,
    /className="p-2 rounded-full text-white hover:bg-white\/10 transition-colors"[\s\S]*?aria-label="Abrir menú"/,
  );
  assert.doesNotMatch(navbar, /href="\/recommendations"/);
  assert.doesNotMatch(mobileNavbar, /WatchNextAssistant/);
  // El asistente es una página: el menú lateral la enlaza.
  assert.match(navbar, /href="\/assistant"[\s\S]*?<span>Asistente<\/span>/);
});
