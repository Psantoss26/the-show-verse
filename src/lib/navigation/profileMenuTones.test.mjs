import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const navbarPath = new URL("../../components/Navbar.jsx", import.meta.url);

// Color de cada sección. NO se elige aquí: es el que esas mismas secciones ya
// usan en el menú móvil y en la barra inferior. El test existe para que sigan
// atados: cambiar el color de una sección en un sitio y no en el otro es
// exactamente el tipo de deriva que nadie nota hasta que chirría.
const TONOS = {
  "/recommendations": "emerald",
  "/social": "pink",
  "/lists": "purple",
  "/calendar": "amber",
  "/in-progress": "emerald",
  "/history": "emerald",
  "/favorites": "red",
  "/watchlist": "sky",
};

function profileMenuGroupsBlock(navbar) {
  const start = navbar.indexOf("const PROFILE_MENU_GROUPS = [");
  const end = navbar.indexOf("\n];", start);
  assert.ok(start > -1 && end > start, "no se localiza PROFILE_MENU_GROUPS");
  return navbar.slice(start, end);
}

test("cada sección del desplegable lleva su color", async () => {
  const navbar = await readFile(navbarPath, "utf8");
  const grupos = profileMenuGroupsBlock(navbar);

  for (const [href, color] of Object.entries(TONOS)) {
    if (href === "/recommendations") {
      assert.match(
        navbar,
        /<ThumbsUp className="h-4 w-4 shrink-0 text-emerald-400" \/>/,
      );
      continue;
    }
    const entrada = grupos.match(
      new RegExp(`href: "${href}"[\\s\\S]{0,220}?tone: "([^"]+)"`),
    );
    assert.ok(entrada, `${href} no declara \`tone\``);
    assert.equal(entrada[1], `text-${color}-400`, `color inesperado en ${href}`);
  }
});

test("el icono se pinta con su color esté activa o no la sección", async () => {
  const navbar = await readFile(navbarPath, "utf8");

  // Igual que «Qué ver con IA», que va siempre en cian: la fila activa ya se
  // distingue por su fondo y su negrita, no por encender el icono.
  assert.match(navbar, /<Icon className=\{`h-4 w-4 shrink-0 \$\{tone\}`\} \/>/);
  assert.match(navbar, /<Sparkles className="h-4 w-4 shrink-0 text-cyan-400" \/>/);
});

test("el color coincide con el que usa esa sección en el menú móvil", async () => {
  const navbar = await readFile(navbarPath, "utf8");

  for (const [href, color] of Object.entries(TONOS)) {
    const enCajon = navbar.match(
      new RegExp(`isActive\\("${href}"\\) \\? "text-([a-z]+)-400"`),
    );
    // Alguna ruta puede no estar en el menú móvil; solo se comparan las que sí.
    if (!enCajon) continue;
    assert.equal(
      enCajon[1],
      color,
      `${href} usa ${enCajon[1]} en el menú móvil y ${color} en el desplegable`,
    );
  }
});
