import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const toolsPath = new URL(
  "../../components/lists/ListDetailsTools.jsx",
  import.meta.url,
);

test("los desplegables de detalles de listas usan la capa translúcida de las páginas de usuario", async () => {
  const source = await readFile(toolsPath, "utf8");

  assert.match(source, /import \{ createPortal \} from "react-dom"/);
  assert.match(source, /createPortal\(/);
  assert.match(source, /position: "fixed"/);
  assert.match(source, /backdrop-blur-2xl p-2 shadow-2xl \[scrollbar-color:#3f3f46_transparent\]/);
  assert.match(source, /rounded-xl px-3 py-2/);
  assert.match(source, /text-zinc-300 hover:bg-white\/5 hover:text-white/);
});
