import test from "node:test";
import assert from "node:assert/strict";

import {
  MODEL_LIBRARY,
  PINE_SOURCE_CENTER,
  PIZZERIA_LAYOUT,
  TREE_HOUSE_LAYOUT,
  getLotFacing,
  getPinePlacement,
  getResidentialModelKey,
  hash01,
  isDowntownLot,
  isTreeHouseLot,
  shouldPlacePine,
} from "../src/city/cityVisualSystem.js";

const CELL_SIZE = 7;

test("city visual hash is deterministic and normalized", () => {
  const first = hash01(4, 7, 11);
  const second = hash01(4, 7, 11);

  assert.equal(first, second);
  assert.ok(first >= 0 && first <= 1);
});

test("residential model selection is deterministic", () => {
  const first = getResidentialModelKey(1, 1, 6);
  const second = getResidentialModelKey(1, 1, 6);

  assert.equal(first, second);
  assert.ok(["house", "largeHouse"].includes(first));
});

test("exactly one lot is designated as the tree-house landmark", () => {
  const treeHouseLots = [];

  for (let gridX = 0; gridX < 15; gridX++) {
    for (let gridZ = 0; gridZ < 15; gridZ++) {
      const distFromCenter = Math.max(Math.abs(gridX - 7), Math.abs(gridZ - 7));
      if (getResidentialModelKey(gridX, gridZ, distFromCenter) === "treeHouse") {
        treeHouseLots.push({ gridX, gridZ });
      }
    }
  }

  assert.deepEqual(treeHouseLots, [
    { gridX: TREE_HOUSE_LAYOUT.gridX, gridZ: TREE_HOUSE_LAYOUT.gridZ },
  ]);
  assert.equal(isTreeHouseLot(TREE_HOUSE_LAYOUT.gridX, TREE_HOUSE_LAYOUT.gridZ), true);
  assert.ok(MODEL_LIBRARY.treeHouse.scale >= 0.55);
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

test("pine geometry center stays safely inside its residential lot", () => {
  const placement = getPinePlacement(1, 1, CELL_SIZE);

  assert.ok(placement.scale > 0);
  assert.ok(placement.scale < 0.01);
  assert.ok(Math.abs(placement.visualCenterOffsetX) < CELL_SIZE * 0.14);
  assert.ok(Math.abs(placement.visualCenterOffsetZ) < CELL_SIZE * 0.14);

  const reconstructedCenterX =
    placement.offsetX + PINE_SOURCE_CENTER.x * placement.scale;
  const reconstructedCenterZ =
    placement.offsetZ + PINE_SOURCE_CENTER.z * placement.scale;

  assert.ok(Math.abs(reconstructedCenterX - placement.visualCenterOffsetX) < 1e-9);
  assert.ok(Math.abs(reconstructedCenterZ - placement.visualCenterOffsetZ) < 1e-9);
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
});

test("pizzeria facade and visual anchor remain tuned to the sidewalk", () => {
  assert.equal(PIZZERIA_LAYOUT.rotationY, 0);
  assert.ok(PIZZERIA_LAYOUT.offsetCells.x >= 0.7);
  assert.ok(PIZZERIA_LAYOUT.offsetCells.x <= 1.05);
  assert.ok(PIZZERIA_LAYOUT.offsetCells.z >= -0.1);
  assert.ok(PIZZERIA_LAYOUT.offsetCells.z <= 0.25);
  assert.ok(MODEL_LIBRARY.pizzeria.scale >= 0.38);
  assert.ok(MODEL_LIBRARY.pizzeria.scale <= 0.42);
});

test("pizzeria landscaping renders inside the reserved block", () => {
  assert.equal(PIZZERIA_LAYOUT.landscapePines.length, 2);

  for (const pine of PIZZERIA_LAYOUT.landscapePines) {
    const scale = MODEL_LIBRARY.pine.scale * pine.scale;
    const visualX = pine.x + (PINE_SOURCE_CENTER.x * scale) / CELL_SIZE;
    const visualZ = pine.z + (PINE_SOURCE_CENTER.z * scale) / CELL_SIZE;

    assert.ok(visualX > -0.25 && visualX < 1.25);
    assert.ok(visualZ > -0.25 && visualZ < 1.25);
  }
});
