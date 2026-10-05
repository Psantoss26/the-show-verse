import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalPlatformId,
  detectionFingerprint,
  detectionTriggerText,
} from "./detectionFingerprint.js";

test("la identidad prefiere la serie, luego la película y luego el título principal", () => {
  assert.equal(detectionTriggerText({ showName: "Dark", mainTitle: "Episodio 1" }), "Dark");
  assert.equal(detectionTriggerText({ movieTitle: "Dune", mainTitle: "Ver Dune" }), "Dune");
  assert.equal(detectionTriggerText({ showName: "  ", mainTitle: "Frieren" }), "Frieren");
  assert.equal(detectionTriggerText({}), "");
});

test("la huella normaliza mayúsculas, acentos y signos", () => {
  assert.equal(detectionFingerprint("Netflix", "Top 10 en España!"), "netflix|top 10 en espana");
  assert.equal(
    detectionFingerprint("netflix", "La Casa del Dragón"),
    detectionFingerprint("netflix", "la casa del dragon"),
  );
});

test("los textos que no identifican nada no se aprenden", () => {
  assert.equal(detectionFingerprint("netflix", "Capítulo 3"), "");
  assert.equal(detectionFingerprint("netflix", "Piloto"), "");
  assert.equal(detectionFingerprint("netflix", "Netflix"), "");
  assert.equal(detectionFingerprint("netflix", "OK"), "");
  assert.equal(detectionFingerprint("", "Dark"), "");
});

test("la extensión y Android comparten huella aunque nombren distinto la plataforma", () => {
  assert.equal(canonicalPlatformId("prime"), "primevideo");
  assert.equal(canonicalPlatformId("primevideo"), "primevideo");
  assert.equal(canonicalPlatformId("Disney+"), "disney");
  assert.equal(detectionFingerprint("prime", "The Boys"), detectionFingerprint("primevideo", "The Boys"));
});
