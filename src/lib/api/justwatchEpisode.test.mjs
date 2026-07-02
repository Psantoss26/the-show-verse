import test from "node:test";
import assert from "node:assert/strict";

import {
  mapEpisodeOffersToProviders,
  selectJustWatchTitle,
  selectNumberedJustWatchItem,
} from "./justwatch.js";

test("selects the exact JustWatch show using its TMDb id", () => {
  const nodes = [
    {
      id: "wrong",
      content: { title: "Peaky Blinders", externalIds: { tmdbId: 1 } },
    },
    {
      id: "right",
      content: { title: "Peaky Blinders", externalIds: { tmdbId: 60574 } },
    },
  ];

  assert.equal(
    selectJustWatchTitle(nodes, {
      tmdbId: 60574,
      title: "Peaky Blinders",
    })?.id,
    "right",
  );
});

test("selects numbered seasons and episodes by label before array position", () => {
  const items = [
    { id: "special", content: { title: "Especiales" } },
    { id: "season-1", content: { title: "Temporada 1" } },
    { id: "season-2", content: { title: "Temporada 2" } },
  ];

  assert.equal(selectNumberedJustWatchItem(items, 2)?.id, "season-2");
});

test("keeps only subscription offers with an exact HTTPS deeplink", () => {
  const offers = [
    {
      monetizationType: "FLATRATE",
      presentationType: "SD",
      standardWebURL: "https://www.netflix.com/title/80002479",
      deeplinkURL: "https://www.netflix.com/watch/80003008",
      package: { packageId: 8, clearName: "Netflix" },
    },
    {
      monetizationType: "FLATRATE",
      presentationType: "HD",
      deeplinkURL: "https://www.netflix.com/watch/80003008",
      package: { packageId: 8, clearName: "Netflix" },
    },
    {
      monetizationType: "BUY",
      deeplinkURL: "https://www.netflix.com/watch/another",
      package: { packageId: 8, clearName: "Netflix" },
    },
    {
      monetizationType: "FLATRATE",
      deeplinkURL: "javascript:alert(1)",
      package: { packageId: 8, clearName: "Netflix" },
    },
  ];

  assert.deepEqual(mapEpisodeOffersToProviders(offers), [
    {
      provider_id: 8,
      provider_name: "Netflix",
      logo_path: "/t2yyOv40HZeVlLjYsCsPHnWLk4W.jpg",
      url: "https://www.netflix.com/watch/80003008",
      monetization_type: "FLATRATE",
      presentation_type: "SD",
    },
  ]);
});
