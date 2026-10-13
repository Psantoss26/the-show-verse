import assert from "node:assert/strict";
import test from "node:test";

import { buildCrewGroups, crewRoleLabel } from "./sectionSheetData.js";

test("equipo de una película: por departamento, una entrada por persona", () => {
  const groups = buildCrewGroups([
    { id: 2, name: "Lilly", department: "Writing", job: "Screenplay" },
    { id: 1, name: "Lana", department: "Directing", job: "Director" },
    { id: 1, name: "Lana", department: "Writing", job: "Screenplay" },
    { id: 2, name: "Lilly", department: "Directing", job: "Director" },
    { id: 3, name: "Bill", department: "Camera", job: "Director of Photography" },
    { id: 4, name: "X", department: "Writing", job: "Screenplay" },
    { id: 4, name: "X", department: "Writing", job: "Novel" },
    { name: "Sin id" },
  ]);
  assert.deepEqual(groups.map((group) => [group.label, group.people.map((person) => person.name)]), [
    ["Dirección", ["Lana", "Lilly"]],
    ["Guion", ["Lilly", "Lana", "X"]],
    ["Fotografía", ["Bill"]],
  ]);
  assert.deepEqual(groups[1].people[2].jobs.map((job) => job.job), ["Screenplay", "Novel"]);
});

test("equipo de una serie: trabajos con episodios y orden por episodios", () => {
  const [group] = buildCrewGroups([
    { id: 1, name: "A", department: "Production", jobs: [{ job: "Producer", episode_count: 10 }], total_episode_count: 10 },
    { id: 2, name: "B", department: "Production", jobs: [{ job: "Executive Producer", episode_count: 62 }], total_episode_count: 62 },
  ]);
  assert.equal(group.label, "Producción");
  assert.deepEqual(group.people.map((person) => [person.name, person.episodes]), [["B", 62], ["A", 10]]);
});

test("trabajos en español", () => {
  assert.equal(crewRoleLabel("Executive Producer"), "Productor ejecutivo");
  assert.equal(crewRoleLabel("Gaffer"), "Gaffer");
});
