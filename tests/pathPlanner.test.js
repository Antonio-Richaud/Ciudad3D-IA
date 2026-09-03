import test from "node:test";
import assert from "node:assert/strict";

import {
  bfsPath,
  getNeighbors,
  hasRoadAt,
  roadKey,
  sameNode,
} from "../src/agents/pathPlanner.js";

function createTestCity() {
  const roadCoordinates = [
    [0, 0],
    [1, 0],
    [2, 0],
    [2, 1],
    [2, 2],
    [1, 2],
    [0, 2],
  ];

  const roadMap = new Map(
    roadCoordinates.map(([gridX, gridZ]) => [
      roadKey(gridX, gridZ),
      { gridX, gridZ },
    ])
  );

  return { roadMap };
}

test("road helpers expose valid orthogonal neighbors", () => {
  const city = createTestCity();

  assert.equal(hasRoadAt(city, 1, 0), true);
  assert.equal(hasRoadAt(city, 1, 1), false);
  assert.equal(sameNode({ gridX: 1, gridZ: 0 }, { gridX: 1, gridZ: 0 }), true);

  assert.deepEqual(getNeighbors(city, { gridX: 2, gridZ: 0 }), [
    { gridX: 1, gridZ: 0, dir: "west" },
    { gridX: 2, gridZ: 1, dir: "south" },
  ]);
});

test("bfsPath returns a shortest valid route", () => {
  const city = createTestCity();
  const path = bfsPath(
    city,
    { gridX: 0, gridZ: 0 },
    { gridX: 0, gridZ: 2 }
  );

  assert.deepEqual(path, [
    { gridX: 0, gridZ: 0 },
    { gridX: 1, gridZ: 0 },
    { gridX: 2, gridZ: 0 },
    { gridX: 2, gridZ: 1 },
    { gridX: 2, gridZ: 2 },
    { gridX: 1, gridZ: 2 },
    { gridX: 0, gridZ: 2 },
  ]);
});

test("bfsPath handles identical start and goal", () => {
  const city = createTestCity();

  assert.deepEqual(
    bfsPath(city, { gridX: 2, gridZ: 0 }, { gridX: 2, gridZ: 0 }),
    [{ gridX: 2, gridZ: 0 }]
  );
});

test("bfsPath returns null for invalid road endpoints", () => {
  const city = createTestCity();

  assert.equal(
    bfsPath(city, { gridX: 1, gridZ: 1 }, { gridX: 0, gridZ: 2 }),
    null
  );
});
