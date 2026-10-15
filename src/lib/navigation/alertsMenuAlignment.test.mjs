import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const NAVBAR = new URL("../../components/Navbar.jsx", import.meta.url);
const ALERTS_MENU = new URL("../../components/notifications/AlertsMenu.jsx", import.meta.url);

test("Navbar pasa el ancla del menú de perfil al desplegable de alertas en escritorio", async () => {
  const navbar = await readFile(NAVBAR, "utf8");

  // El desplegable de alertas se alinea al ancla de perfil (profileMenuRef)
  // para coincidir con la posición del menú desplegable a la derecha.
  assert.match(
    navbar,
    /<AlertsMenu[\s\S]*?alignRef=\{profileMenuRef\}/,
    "AlertsMenu en escritorio debe recibir alignRef={profileMenuRef}",
  );
});

test("Navbar pasa el ancla derecha de controles al desplegable de alertas en móvil", async () => {
  const navbar = await readFile(NAVBAR, "utf8");

  assert.match(
    navbar,
    /<AlertsMenu[\s\S]*?variant="mobile"[\s\S]*?alignRef=\{mobileRightRef\}/,
    "AlertsMenu en móvil debe recibir alignRef={mobileRightRef}",
  );
});

test("AlertsMenu usa el borde derecho del ancla para posicionar el panel", async () => {
  const alertsMenu = await readFile(ALERTS_MENU, "utf8");

  // Acepta alignRef como prop
  assert.match(
    alertsMenu,
    /alignRef\s*=\s*null/,
    "AlertsMenu debe aceptar la prop alignRef con valor por defecto null",
  );

  // Calcula rightAnchor basándose en alignEl
  assert.match(
    alertsMenu,
    /alignRef\?\.current\s*\|\|\s*wrapperRef\.current/,
    "AlertsMenu debe consultar alignRef.current o wrapperRef.current",
  );
  assert.match(
    alertsMenu,
    /rightAnchor\s*-\s*width/,
    "AlertsMenu debe alinear a la derecha usando el ancla",
  );
});
