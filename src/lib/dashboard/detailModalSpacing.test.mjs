import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const DETAIL_MODAL = new URL(
  "../../components/dashboard/DetailModal.jsx",
  import.meta.url,
);

test("las secciones de DetailModal conservan una separación vertical legible", async () => {
  const modal = await readFile(DETAIL_MODAL, "utf8");

  // El relleno de escritorio (`sm:p-7`) se retira en la ficha de TELÉFONO del
  // drawer: ahí el ancho de móvil lo pone el panel, no la ventana, así que ese
  // `sm:` casaría siempre y ensancharía los márgenes justo donde no toca.
  assert.match(
    modal,
    /<div className=\{`space-y-8 p-5 \$\{mobileDetails \? "" : "sm:p-7"\}`\}>/,
  );
  // Esas tres secciones llevan además `sv-drawer-section`, que las CONTIENE
  // para que al redimensionar el panel un cambio dentro de una no obligue a
  // recalcular las demás. Lo que vigila este test es la separación, así que se
  // busca la utilidad, no la cadena de clases completa.
  assert.equal(
    (modal.match(/className="sv-drawer-section space-y-4"/g) || []).length,
    3,
    "Reparto, títulos similares y sentimientos deben separar su encabezado del contenido",
  );
  assert.match(modal, /className="space-y-5 pb-4"/);
});
