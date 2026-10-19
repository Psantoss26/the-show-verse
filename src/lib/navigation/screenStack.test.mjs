import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_SCREENS,
  createScreenStack,
  navigateScreens,
  screenKeyForPathname,
} from "./screenStack.js";

const keys = (state) => state.screens.map((screen) => screen.key);
const activeKey = (state) => state.screens[state.active].key;

test("avanzar conserva las pantallas anteriores y activa la nueva", () => {
  let state = createScreenStack("/", "page");
  state = navigateScreens(state, "/details/tv/1", "overlay", false);
  state = navigateScreens(state, "/details/tv/1/season/1", "overlay", false);
  assert.deepEqual(keys(state), ["/", "/details/tv/1", "/details/tv/1/season/1"]);
  assert.equal(activeKey(state), "/details/tv/1/season/1");
  assert.equal(state.revealed, false);
});

test("volver atrás recupera la MISMA pantalla (mismo id) y la deja hacia adelante", () => {
  let state = createScreenStack("/", "page");
  state = navigateScreens(state, "/details/tv/1", "overlay", false);
  const details = state.screens[1];
  state = navigateScreens(state, "/details/person/2", "overlay", false);
  state = navigateScreens(state, "/details/tv/1", "overlay", true);
  assert.equal(state.screens[state.active], details);
  assert.equal(state.revealed, true);
  assert.deepEqual(keys(state), ["/", "/details/tv/1", "/details/person/2"]);
  // Y adelante vuelve a la del actor sin montarla de nuevo.
  const actor = state.screens[2];
  state = navigateScreens(state, "/details/person/2", "overlay", true);
  assert.equal(state.screens[state.active], actor);
});

test("una navegación nueva descarta lo que había hacia adelante", () => {
  let state = createScreenStack("/", "page");
  state = navigateScreens(state, "/details/tv/1", "overlay", false);
  state = navigateScreens(state, "/details/tv/1/season/1", "overlay", false);
  state = navigateScreens(state, "/details/tv/1", "overlay", true);
  state = navigateScreens(state, "/lists/collection/10", "page", false);
  assert.deepEqual(keys(state), ["/", "/details/tv/1", "/lists/collection/10"]);
});

test("navegar de nuevo a una ruta que está en la pila la monta de cero", () => {
  let state = createScreenStack("/", "page");
  const home = state.screens[0];
  state = navigateScreens(state, "/details/tv/1", "overlay", false);
  state = navigateScreens(state, "/", "page", false);
  assert.deepEqual(keys(state), ["/details/tv/1", "/"]);
  assert.notEqual(state.screens[state.active].id, home.id);
});

test("si la ruta cambia de tipo (página ↔ ficha) no se reutiliza", () => {
  let state = createScreenStack("/details/tv/1", "page");
  state = navigateScreens(state, "/details/tv/1/season/1", "overlay", false);
  state = navigateScreens(state, "/details/tv/1", "overlay", true);
  assert.equal(state.revealed, false);
  assert.equal(state.screens[state.active].kind, "overlay");
  assert.equal(state.screens.filter((screen) => screen.key === "/details/tv/1").length, 1);
});

test("tope de pantallas: se descarta la más antigua salvo la página de partida", () => {
  let state = createScreenStack("/", "page");
  for (let i = 1; i <= MAX_SCREENS + 2; i += 1) {
    state = navigateScreens(state, `/details/movie/${i}`, "overlay", false);
  }
  assert.equal(state.screens.length, MAX_SCREENS);
  assert.equal(state.screens[0].key, "/");
  assert.equal(activeKey(state), `/details/movie/${MAX_SCREENS + 2}`);
  // Los ids siguen siendo únicos (son la `key` de React de cada pantalla).
  assert.equal(new Set(state.screens.map((screen) => screen.id)).size, state.screens.length);
});

test("las secciones del Perfil comparten pantalla; Ajustes y seguidores no", () => {
  assert.equal(screenKeyForPathname("/profile"), "/profile");
  assert.equal(screenKeyForPathname("/profile/level"), "/profile");
  assert.equal(screenKeyForPathname("/profile/statistics/"), "/profile");
  assert.equal(screenKeyForPathname("/profile/settings"), "/profile/settings");
  assert.equal(screenKeyForPathname("/u/ana/watchlist"), "/u/ana");
  assert.equal(screenKeyForPathname("/u/ana/followers"), "/u/ana/followers");
  assert.equal(screenKeyForPathname("/details/tv/1"), "/details/tv/1");
});

test("cambiar de sección del Perfil no monta otra pantalla", () => {
  let state = createScreenStack(screenKeyForPathname("/profile"), "page");
  const profile = state.screens[0];
  // OverlayRouteHost solo navega si la clave cambia: aquí no cambia.
  assert.equal(screenKeyForPathname("/profile/level"), profile.key);
  state = navigateScreens(state, "/details/tv/1", "overlay", false);
  state = navigateScreens(state, screenKeyForPathname("/profile/level"), "page", true);
  assert.equal(state.screens[state.active], profile);
  assert.equal(state.revealed, true);
});
