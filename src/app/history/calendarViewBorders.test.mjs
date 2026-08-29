import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("la vista de calendario del Historial no dibuja bordes en sus secciones", async () => {
  const source = await readFile(new URL("./HistoryClient.jsx", import.meta.url), "utf8");
  const calendarView = source.slice(
    source.indexOf("function CalendarWithPosters"),
    source.indexOf("// Lo usan tanto el drawer del calendario", source.indexOf("function CalendarWithPosters")),
  );
  const modal = source.slice(
    source.indexOf("{/* Modal de Vista de Calendario */}"),
    source.indexOf("{/* Móvil: overlay del calendario"),
  );

  assert.doesNotMatch(calendarView, /\bborder(?:-|["\s])/);
  assert.doesNotMatch(modal, /\bborder(?:-|["\s])/);
});

test("las portadas agrupadas dejan una parte visible de cada elemento", async () => {
  const source = await readFile(new URL("./HistoryClient.jsx", import.meta.url), "utf8");
  const calendarView = source.slice(
    source.indexOf("function CalendarWithPosters"),
    source.indexOf("// Lo usan tanto el drawer del calendario", source.indexOf("function CalendarWithPosters")),
  );

  assert.match(calendarView, /const stackCardWidth = visiblePosterCount > 1 \? "58%" : "100%"/);
  assert.match(calendarView, /const stackStepX =/);
  assert.match(calendarView, /left: `\$\{idx \* stackStepX\}%`/);
  assert.match(calendarView, /height: stackCardHeight/);
  assert.doesNotMatch(calendarView, /idx \* 1\.5px/);
});
