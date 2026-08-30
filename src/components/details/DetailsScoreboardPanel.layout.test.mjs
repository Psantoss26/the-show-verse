import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panelUrl = new URL("./DetailsScoreboardPanel.jsx", import.meta.url);
const shareUrl = new URL("./DetailHeaderBits.jsx", import.meta.url);

test("toolbar actions animate their size in both poster modes", async () => {
  const [panel, share] = await Promise.all([
    readFile(panelUrl, "utf8"),
    readFile(shareUrl, "utf8"),
  ]);

  assert.match(panel, /import \{ motion, useReducedMotion \} from "framer-motion"/);
  assert.match(panel, /<motion\.button[\s\S]*?layout=\{prefersReducedMotion \? false : "size"\}/);
  assert.match(share, /const prefersReducedMotion = useReducedMotion\(\);/);
  assert.match(share, /layout=\{prefersReducedMotion \? false : "size"\}/);
});
