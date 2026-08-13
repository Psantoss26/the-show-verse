import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const navbarPath = new URL("../../components/Navbar.jsx", import.meta.url);
const assistantPath = new URL(
  "../../components/WatchNextAssistant.jsx",
  import.meta.url,
);

// Recorta el JSX del panel desplegable de Perfil (lo que se monta y desmonta
// con `profileMenuOpen`).
function profileDropdownBlock(navbar) {
  const start = navbar.indexOf('aria-expanded={profileMenuOpen}');
  const end = navbar.indexOf("</AnimatePresence>", start);
  assert.ok(start > -1 && end > start, "no se localiza el desplegable de Perfil");
  return navbar.slice(start, end);
}

test("el desplegable de Perfil ofrece el asistente", async () => {
  const dropdown = profileDropdownBlock(await readFile(navbarPath, "utf8"));

  assert.match(dropdown, /<div className="my-2\.5 h-px bg-white\/5" \/>/);
  assert.match(dropdown, /setAssistantOpen\(true\)/);
  assert.match(dropdown, /Qué ver con IA/);
  // Cierra el menú al abrirlo: dejarlo abierto detrás del panel lo dejaría
  // colgando cuando el asistente se cierre.
  assert.match(dropdown, /setProfileMenuOpen\(false\)/);
});

test("el asistente NO se monta dentro del desplegable de Perfil", async () => {
  const navbar = await readFile(navbarPath, "utf8");
  const dropdown = profileDropdownBlock(navbar);

  // ESTA es la razón de ser del test. El panel del asistente se pinta con
  // `createPortal`, pero en el árbol de React sigue siendo hijo del componente:
  // montarlo dentro del desplegable haría que se desmontase justo al empezar a
  // usarlo, porque el menú se cierra al pulsar fuera y el panel ESTÁ fuera.
  // Debe vivir fuera y recibir el estado desde el Navbar.
  assert.doesNotMatch(dropdown, /<WatchNextAssistant/);

  const montaje = navbar.match(
    /<WatchNextAssistant\b(?![^>]*isMobile)[\s\S]*?\/>/,
  )?.[0];
  assert.ok(montaje, "no se localiza el montaje de escritorio del asistente");
  assert.match(montaje, /open=\{assistantOpen\}/);
  assert.match(montaje, /onOpenChange=\{setAssistantOpen\}/);
});

test("el asistente ya no ocupa un icono propio en la barra", async () => {
  const navbar = await readFile(navbarPath, "utf8");
  const assistant = await readFile(assistantPath, "utf8");

  // Se abre desde el desplegable, así que el montaje de escritorio no pinta
  // botón. Sigue montado sólo para sostener su panel.
  const montaje = navbar.match(
    /<WatchNextAssistant\b(?![^>]*isMobile)[\s\S]*?\/>/,
  )?.[0];
  assert.match(montaje, /hideTrigger/);
  assert.match(assistant, /\{hideTrigger \? null : \(/);

  // El menú móvil sí conserva su fila propia.
  assert.match(navbar, /<WatchNextAssistant isMobile triggerVariant="drawer" \/>/);
});

test("el asistente acepta estado controlado sin romper el uso suelto", async () => {
  const assistant = await readFile(assistantPath, "utf8");

  assert.match(assistant, /open:\s*openProp/);
  assert.match(assistant, /onOpenChange/);
  // Sin `open`, sigue gobernándose solo: es como lo usa el menú móvil.
  assert.match(assistant, /const isControlled = openProp !== undefined/);
  assert.match(assistant, /isControlled \? openProp : uncontrolledOpen/);

  const navbar = await readFile(navbarPath, "utf8");
  assert.match(navbar, /<WatchNextAssistant isMobile triggerVariant="drawer" \/>/);
});
