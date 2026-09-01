import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const detailsClient = readFileSync(
  new URL("../../components/DetailsClient.jsx", import.meta.url),
  "utf8",
);

test("el póster LOW permanece opaco mientras HIGH entra por encima", () => {
  const lowLayer = detailsClient.slice(
    detailsClient.indexOf("{/* LOW */}"),
    detailsClient.indexOf("{/* HIGH:"),
  );

  assert.match(
    lowLayer,
    /currentLowLoaded \? "opacity-100" : "opacity-0"/,
  );
  assert.doesNotMatch(lowLayer, /currentHighLoaded \? "opacity-0"/);
});

test("la versión HIGH conserva su fundido de entrada sobre LOW", () => {
  const highLayer = detailsClient.slice(
    detailsClient.indexOf("{/* HIGH:"),
    detailsClient.indexOf("{showNoPoster"),
  );

  assert.match(
    highLayer,
    /currentHighLoaded \? "opacity-100" : "opacity-0"/,
  );
  assert.match(highLayer, /duration-700/);
});

test("la versión final del póster apunta a la calidad original", () => {
  const posterUrlsStart = detailsClient.indexOf("const posterLowUrl");
  const posterUrls = detailsClient.slice(
    posterUrlsStart,
    detailsClient.indexOf("const posterLoadToken", posterUrlsStart),
  );

  assert.match(
    posterUrls,
    /const posterHighPath = mobilePosterPath \|\| displayPosterPath/,
  );
  assert.match(posterUrls, /buildOriginalImageUrl\(posterHighPath\)/);
  assert.doesNotMatch(posterUrls, /w780\$\{mobilePosterPath\}/);
  assert.doesNotMatch(posterUrls, /w780\$\{displayPosterPath\}/);
});

test("la versión original móvil no compite con la carga crítica", () => {
  assert.match(detailsClient, /function useDeferredOriginalUpgrade/);
  assert.match(detailsClient, /window\.addEventListener\("load"/);
  assert.match(detailsClient, /window\.requestIdleCallback\(approve\)/);
  assert.match(detailsClient, /connection\.saveData/);
  assert.match(
    detailsClient,
    /posterHighUrl && shouldRenderPosterHigh/,
  );
  assert.match(
    detailsClient,
    /fetchPriority=\{deferPosterOriginal \? "low" : "high"\}/,
  );
  assert.match(
    detailsClient,
    /const isMobileRequest =[\s\S]*?matchMedia\?\.\("\(max-width: 640px\)"\)[\s\S]*?const isHighPreloaded = isMobileRequest[\s\S]*?\? false[\s\S]*?: checkIfLoaded\(posterHighUrl\)/,
  );
});

test("el hero móvil reutiliza la original solo después de quedar en caché", () => {
  assert.match(
    detailsClient,
    /mobilePosterOriginalRequestReady && posterHighLoaded/,
  );
  assert.match(detailsClient, /\? "w500"[\s\S]*?: "original"/);
});

test("el logo carga y decodifica la original con prioridad baja", () => {
  const logoComponent = detailsClient.slice(
    detailsClient.indexOf("function ProgressiveHeroLogo"),
    detailsClient.indexOf("// Componente de badge"),
  );

  assert.match(logoComponent, /useDeferredOriginalUpgrade/);
  assert.match(logoComponent, /image\.fetchPriority = "low"/);
  assert.match(logoComponent, /await image\.decode\?\.\(\)/);
  assert.match(logoComponent, /useOriginal \? "original" : "w500"/);
});
