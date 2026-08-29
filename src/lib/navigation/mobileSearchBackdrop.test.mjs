import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("el buscador móvil aplica el mismo velo difuminado que los modales de ficha", async () => {
  const navbar = await readFile(
    new URL("../../components/Navbar.jsx", import.meta.url),
    "utf8",
  );
  const mobileSearch = navbar.slice(
    navbar.indexOf("OVERLAY BÚSQUEDA (MÓVIL)"),
    navbar.indexOf("<NetflixSyncListener"),
  );

  assert.match(mobileSearch, /fixed inset-0 z-50[\s\S]*?bg-black\/60[\s\S]*?backdrop-blur-lg/);
  assert.match(mobileSearch, /onClick=\{\(\) => setShowMobileSearch\(false\)\}/);
});
