import assert from "node:assert/strict";
import test from "node:test";

import { buildProfileShareCard, sanitizeProfileShareCard } from "./shareProfile.js";

const avatar = (avatarUrl) => sanitizeProfileShareCard({ username: "pablo", avatarUrl }).avatarUrl;

test("keeps the avatar uploaded from a file (base64 data URL)", () => {
  const webp = `data:image/webp;base64,${Buffer.alloc(300 * 1024, 7).toString("base64")}`;
  assert.equal(buildProfileShareCard({ user: { username: "pablo", avatarUrl: webp } }).avatarUrl, webp);
});

test("keeps https avatars and drops anything else", () => {
  assert.equal(avatar("https://example.com/a.png"), "https://example.com/a.png");
  assert.equal(avatar("http://example.com/a.png"), null);
  assert.equal(avatar("data:image/svg+xml;base64,AAAA"), null);
  assert.equal(avatar("data:text/html;base64,AAAA"), null);
  assert.equal(avatar(`data:image/png;base64,${"A".repeat(700_000)}`), null);
});
