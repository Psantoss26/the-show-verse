import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  avatar: new URL("./AvatarBootScript.jsx", import.meta.url),
  layout: new URL("../../app/layout.jsx", import.meta.url),
  community: new URL("../lists/TraktListDetailsClient.jsx", import.meta.url),
  collection: new URL("../lists/CollectionDetailsClient.jsx", import.meta.url),
  personal: new URL("../../app/lists/[listId]/page.jsx", import.meta.url),
};

test("el bootstrap del avatar va como <script> plano en el <head> del layout raíz", async () => {
  const [avatarSource, layoutSource] = await Promise.all([
    readFile(files.avatar, "utf8"),
    readFile(files.layout, "utf8"),
  ]);

  // El script es una cadena: ningún componente CLIENTE lo renderiza (React 19
  // avisa de que un <script> creado en el cliente nunca se ejecuta).
  assert.match(avatarSource, /export const AVATAR_BOOT_SCRIPT/);
  assert.doesNotMatch(avatarSource, /<script/);
  assert.doesNotMatch(avatarSource, /export default function AvatarBootScript/);

  // Lo emite el layout raíz, que es un componente de SERVIDOR, dentro de su
  // <head>: va en el HTML inicial y se ejecuta antes de hidratar. Con
  // `next/script` + `beforeInteractive` en el <body>, Next 16 + React 19
  // rompían la hidratación y React acababa creando el <script> en el cliente.
  assert.doesNotMatch(layoutSource, /["']use client["']/);
  assert.doesNotMatch(layoutSource, /from ["']next\/script["']/);
  assert.doesNotMatch(layoutSource, /strategy="beforeInteractive"/);
  assert.match(
    layoutSource,
    /<head>\s*<script\s+id="avatar-boot"\s+dangerouslySetInnerHTML=\{\{ __html: AVATAR_BOOT_SCRIPT \}\}/,
  );
});

test("las fichas de listas no leen sessionStorage durante el primer render", async () => {
  const [community, collection, personal] = await Promise.all([
    readFile(files.community, "utf8"),
    readFile(files.collection, "utf8"),
    readFile(files.personal, "utf8"),
  ]);

  assert.match(
    community,
    /useState\(\(\) =>\s*resolveCommunityListDetailsInitialState\(null\)/,
  );
  assert.match(
    collection,
    /useState\(\(\) =>\s*resolveCollectionDetailsInitialState\(null\)/,
  );
  assert.match(personal, /const \[data, setData\] = useState\(null\)/);
  assert.match(personal, /const \[loading, setLoading\] = useState\(true\)/);

  for (const source of [community, collection, personal]) {
    assert.match(source, /useClientLayoutEffect/);
    assert.match(source, /if \(!isBackNav\) return/);
  }
});
