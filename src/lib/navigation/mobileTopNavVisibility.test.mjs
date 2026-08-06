import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const navbarPath = new URL("../../components/Navbar.jsx", import.meta.url);
const assistantPath = new URL(
  "../../components/WatchNextAssistant.jsx",
  import.meta.url,
);

test("el navbar móvil da acceso rápido a Recomendaciones y deja el asistente en el menú", async () => {
  const [navbar, assistant] = await Promise.all([
    readFile(navbarPath, "utf8"),
    readFile(assistantPath, "utf8"),
  ]);

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
  assert.match(
    mobileNavbar,
    /href="\/recommendations"[\s\S]*?aria-label=\{t\("nav_recommendations", "Recomendaciones"\)\}[\s\S]*?<ThumbsUp/,
  );
  assert.doesNotMatch(mobileNavbar, /<WatchNextAssistant isMobile heroNavMode/);
  assert.match(
    navbar,
    /<WatchNextAssistant isMobile triggerVariant="drawer" \/>/,
  );
  assert.match(assistant, /drawerTrigger \? <span>Qué ver con IA<\/span>/);
});
