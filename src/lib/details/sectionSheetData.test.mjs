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

test("los creadores de una serie van en el equipo, en «Creación» y los primeros", () => {
  const groups = buildCrewGroups(
    [{ id: 2, name: "Michelle MacLaren", department: "Directing", jobs: [{ job: "Director", episode_count: 11 }], total_episode_count: 11 }],
    { creators: [{ id: 1, name: "Vince Gilligan", profile_path: "/v.jpg" }] },
  );
  assert.deepEqual(groups.map((group) => [group.label, group.people.map((person) => person.name)]), [
    ["Creación", ["Vince Gilligan"]],
    ["Dirección", ["Michelle MacLaren"]],
  ]);
  assert.equal(crewRoleLabel(groups[0].people[0].jobs[0].job), "Creador");
});

test("en cada departamento van primero los trabajos principales", () => {
  const [directing] = buildCrewGroups([
    { id: 10, name: "Ayudante", department: "Directing", job: "Second Assistant Director" },
    { id: 11, name: "Lana", department: "Directing", job: "Director" },
    { id: 12, name: "Script", department: "Directing", job: "Script Supervisor" },
    { id: 13, name: "Lilly", department: "Directing", job: "Director" },
  ]);
  assert.deepEqual(directing.people.map((person) => person.name), ["Lana", "Lilly", "Ayudante", "Script"]);
});
