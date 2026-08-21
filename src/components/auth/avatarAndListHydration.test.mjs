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

test("el bootstrap del avatar usa el cargador de scripts de Next", async () => {
  const [avatarSource, layoutSource] = await Promise.all([
    readFile(files.avatar, "utf8"),
    readFile(files.layout, "utf8"),
  ]);

  assert.match(avatarSource, /export const AVATAR_BOOT_SCRIPT/);
  assert.doesNotMatch(avatarSource, /<script/);
  assert.match(layoutSource, /import Script from "next\/script"/);
  assert.match(layoutSource, /id="avatar-boot"/);
  assert.match(layoutSource, /strategy="beforeInteractive"/);
  assert.match(layoutSource, /__html: AVATAR_BOOT_SCRIPT/);
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
});
