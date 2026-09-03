import test from "node:test";
import assert from "node:assert/strict";

import {
  MODEL_LIBRARY,
  PIZZERIA_LAYOUT,
  getLotFacing,
  getPinePlacement,
  getResidentialModelKey,
  hash01,
  isDowntownLot,
  shouldPlacePine,
} from "../src/city/cityVisualSystem.js";

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
  assert.ok(["house", "largeHouse", "treeHouse"].includes(first));
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

test("pine placement stays at human-scale landscaping size", () => {
  const placement = getPinePlacement(1, 1, 7);

  assert.ok(placement.scale > 0);
  assert.ok(placement.scale < 0.012);
  assert.ok(Math.abs(placement.offsetX) < 2.1);
  assert.ok(Math.abs(placement.offsetZ) < 2.1);
});

test("pine density remains intentionally sparse", () => {
  const first = shouldPlacePine(1, 1, 6);
  const second = shouldPlacePine(1, 1, 6);

  assert.equal(first, second);
  assert.equal(typeof first, "boolean");
});

test("pizzeria occupies one complete 2x2 city block", () => {
  const reserved = PIZZERIA_LAYOUT.reservedCells.map(
    ({ gridX, gridZ }) => `${gridX},${gridZ}`
  );

  assert.deepEqual(
    new Set(reserved),
    new Set(["10,4", "11,4", "10,5", "11,5"])
  );
  assert.deepEqual(PIZZERIA_LAYOUT.offsetCells, { x: 0.5, z: 0.5 });
});

test("pizzeria facade is flipped toward the opposite sidewalk", () => {
  assert.equal(PIZZERIA_LAYOUT.rotationY, 0);
});

test("pizzeria landscaping stays behind the entrance", () => {
  assert.ok(PIZZERIA_LAYOUT.landscapePines.length >= 2);
  assert.ok(PIZZERIA_LAYOUT.landscapePines.every((pine) => pine.z < 0));
});

test("large commercial landmark scale remains contained", () => {
  assert.ok(MODEL_LIBRARY.pizzeria.scale <= 0.35);
  assert.ok(MODEL_LIBRARY.pizzeria.scale > 0);
});
