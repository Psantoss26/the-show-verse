import assert from "node:assert/strict";
import test from "node:test";

import { parseAwardsHtml } from "./awardsParse.js";

// Esqueleto del marcado real de /movie/<id>/awards, con la cabecera de cada
// certamen como parámetro para cubrir sus variantes.
function awardsPage(headerClass) {
  return `
<section><div class="space-y-12">
  <div class="flex items-center">
    <img class="logo" src="https://media.themoviedb.org/t/p/w45_and_h45_fit/oscar.png">
    <div class="${headerClass}">
      <a class="font-bold font-black!" href="/award/1-academy-awards?language=en-US" title="Academy Awards">
        Academy Awards
      </a>
    </div>
    <p class="ml-auto">8 Nominations, 4 Wins</p>
  </div>
  <div class="w-full divide-y">
    <div id="a1" class="flex flex-row p-3 sm:p-6">
      <p class="mb-1"><a href="/award/1-academy-awards/ceremony/83?language=en-US">83rd Academy Awards (2011)</a></p>
      <p><span class="rounded-md">Nominee</span> <a href="/award/1-academy-awards/ceremony/83?language=en-US#category-1">Best Picture</a></p>
      <ul><li><a class="font-light! text-black!" href="/person/525">Christopher Nolan</a></li></ul>
      <p class="md:text-right font-bold">2011</p>
    </div>
    <div id="a2" class="flex flex-row p-3 sm:p-6">
      <p><span class="rounded-md">Winner</span> <a href="/award/1-academy-awards/ceremony/83?language=en-US#category-9">Best Cinematography</a></p>
      <p class="md:text-right font-bold">2011</p>
    </div>
  </div>
</div></section>`;
}

test("parses the current TMDb header markup (without leading-9)", () => {
  const result = parseAwardsHtml(awardsPage("font-semibold text-xl"));
  assert.equal(result.parseFailed, false);
  assert.equal(result.hasAwards, true);
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].name, "Academy Awards");
  assert.equal(result.groups[0].imageUrl?.includes("/t/p/original/"), true);
  assert.deepEqual(
    result.groups[0].items.map((item) => [item.category, item.result, item.year]),
    [
      ["Best Picture", "nominee", "2011"],
      ["Best Cinematography", "winner", "2011"],
    ],
  );
  assert.deepEqual(result.groups[0].items[0].people, ["Christopher Nolan"]);
});

test("still parses the previous header markup", () => {
  const result = parseAwardsHtml(awardsPage("font-semibold leading-9 text-xl"));
  assert.equal(result.groups.length, 1);
  assert.equal(result.total, 2);
});

test("flags unrecognised markup instead of reporting no awards", () => {
  const result = parseAwardsHtml(awardsPage("award-heading"));
  assert.equal(result.groups.length, 0);
  assert.equal(result.parseFailed, true);
});

test("a page without award rows is a genuine empty result", () => {
  const result = parseAwardsHtml('<section><div class="space-y-12"></div></section>');
  assert.equal(result.parseFailed, false);
  assert.equal(result.hasAwards, false);
});
