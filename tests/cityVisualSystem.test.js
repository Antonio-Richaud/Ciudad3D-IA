import test from "node:test";
import assert from "node:assert/strict";

import {
  MODEL_LIBRARY,
  PIZZERIA_LAYOUT,
  TREE_HOUSE_LAYOUT,
  getLotFacing,
  getModelFitScale,
  getPinePlacement,
  getResidentialModelKey,
  hash01,
  isDowntownLot,
  shouldPlacePine,
} from "../src/city/cityVisualSystem.js";

const CELL_SIZE = 7;

test("city visual hash is deterministic and normalized", () => {
  const first = hash01(4, 7, 11);
  const second = hash01(4, 7, 11);

  assert.equal(first, second);
  assert.ok(first >= 0 && first <= 1);
});

test("residential model selection never duplicates the tree-house landmark", () => {
  for (let gridX = 0; gridX < 15; gridX++) {
    for (let gridZ = 0; gridZ < 15; gridZ++) {
      const distFromCenter = Math.max(Math.abs(gridX - 7), Math.abs(gridZ - 7));
      const model = getResidentialModelKey(gridX, gridZ, distFromCenter);
      assert.ok(["house", "largeHouse"].includes(model));
    }
  }
});

test("tree house owns exactly one complete 2x2 block", () => {
  const reserved = TREE_HOUSE_LAYOUT.reservedCells.map(
    ({ gridX, gridZ }) => `${gridX},${gridZ}`
  );

  assert.deepEqual(
    new Set(reserved),
    new Set(["13,4", "14,4", "13,5", "14,5"])
  );
  assert.deepEqual(TREE_HOUSE_LAYOUT.offsetCells, { x: 0.5, z: 0.5 });
  assert.ok(MODEL_LIBRARY.treeHouse.fit.maxWidthCells >= 1.5);
  assert.ok(MODEL_LIBRARY.treeHouse.fit.maxHeightCells >= 1.5);
});

test("lot facing always points to one of the two adjacent roads", () => {
  const facing = getLotFacing(1, 2);

  assert.ok(["west", "south"].includes(facing.side));
  assert.equal(typeof facing.yaw, "number");
});

test("downtown detection keeps the central district procedural", () => {
  const halfGrid = 7;

  assert.equal(isDowntownLot(7, 8, halfGrid), true);
  assert.equal(isDowntownLot(1, 1, halfGrid), false);
});

test("model fitting uses actual visual dimensions instead of GLB pivots", () => {
  const scale = getModelFitScale(
    { x: 200, y: 400, z: 100 },
    { targetHeight: 4 },
    CELL_SIZE
  );

  assert.equal(scale, 0.01);
});

test("pines target a small visual center safely inside residential lots", () => {
  const placement = getPinePlacement(1, 1);

  assert.ok(Math.abs(placement.centerOffsetX) < 1.4);
  assert.ok(Math.abs(placement.centerOffsetZ) < 1.4);
  assert.ok(placement.targetHeight >= 2.8);
  assert.ok(placement.targetHeight <= 3.5);
});

test("pine density remains intentionally sparse", () => {
  const first = shouldPlacePine(1, 1, 6);
  const second = shouldPlacePine(1, 1, 6);

  assert.equal(first, second);
  assert.equal(typeof first, "boolean");
});

test("pizzeria keeps exclusive use of one complete 2x2 city block", () => {
  const reserved = PIZZERIA_LAYOUT.reservedCells.map(
    ({ gridX, gridZ }) => `${gridX},${gridZ}`
  );

  assert.deepEqual(
    new Set(reserved),
    new Set(["10,4", "11,4", "10,5", "11,5"])
  );
  assert.deepEqual(PIZZERIA_LAYOUT.offsetCells, { x: 0.5, z: 0.5 });
});

test("pizzeria is sized from visual bounds to fill most of its block", () => {
  assert.equal(PIZZERIA_LAYOUT.rotationY, 0);
  assert.ok(MODEL_LIBRARY.pizzeria.fit.maxWidthCells >= 1.5);
  assert.ok(MODEL_LIBRARY.pizzeria.fit.maxDepthCells >= 1.4);
  assert.ok(MODEL_LIBRARY.pizzeria.fit.maxWidthCells < 2);
  assert.ok(MODEL_LIBRARY.pizzeria.fit.maxDepthCells < 2);
});

test("pizzeria landscaping targets visual centers inside the block", () => {
  assert.equal(PIZZERIA_LAYOUT.landscapePines.length, 2);

  for (const pine of PIZZERIA_LAYOUT.landscapePines) {
    assert.ok(Math.abs(pine.x) < 0.75);
    assert.ok(Math.abs(pine.z) < 0.75);
    assert.ok(pine.heightScale > 0.8 && pine.heightScale < 1.1);
  }
});
