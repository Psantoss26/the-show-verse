import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const navbarPath = new URL("../../components/Navbar.jsx", import.meta.url);

// Recorta el JSX del panel desplegable de Perfil.
function profileDropdownBlock(navbar) {
  const start = navbar.indexOf('aria-expanded={profileMenuOpen}');
  const end = navbar.indexOf("</AnimatePresence>", start);
  assert.ok(start > -1 && end > start, "no se localiza el desplegable de Perfil");
  return navbar.slice(start, end);
}

test("el desplegable de Perfil lleva a la página del asistente", async () => {
  const dropdown = profileDropdownBlock(await readFile(navbarPath, "utf8"));

  assert.match(dropdown, /<div className="my-2\.5 h-px bg-white\/5" \/>/);
  assert.match(dropdown, /href="\/assistant"[\s\S]*?<span className="truncate">Asistente<\/span>/);
  // Cierra el menú al navegar.
  assert.match(dropdown, /href="\/assistant"[\s\S]*?setProfileMenuOpen\(false\)/);
});

test("el navbar ya no monta el panel del asistente", async () => {
  const navbar = await readFile(navbarPath, "utf8");

  // Es una página (/assistant): el navbar no tiene que sostener ningún panel
  // ni su estado de apertura.
  assert.doesNotMatch(navbar, /WatchNextAssistant/);
  assert.doesNotMatch(navbar, /assistantOpen|setAssistantOpen/);
});

test("el menú lateral del móvil también enlaza a /assistant", async () => {
  const navbar = await readFile(navbarPath, "utf8");
  const drawer = navbar.slice(
    navbar.indexOf('href="/recap"', navbar.indexOf("{/* ---------------- Mobile ---------------- */}")),
  );
  assert.match(
    drawer,
    /href="\/assistant"[\s\S]*?setMobileMenuOpen\(false\)[\s\S]*?<span>Asistente<\/span>/,
  );
});
