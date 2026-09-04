import test from "node:test";
import assert from "node:assert/strict";

import {
  createForestRingLayout,
  getForestModelFit,
} from "../src/city/forestBoundaryLayout.js";

const CELL_SIZE = 7;
const HALF_GROUND = (15 * CELL_SIZE) / 2;

test("forest model fit normalizes the longest horizontal axis", () => {
  const fit = getForestModelFit(
    { x: 20, y: 12, z: 40 },
    CELL_SIZE
  );

  assert.equal(fit.rotationY, Math.PI / 2);
  assert.ok(fit.width <= CELL_SIZE * 7.25 + 1e-9);
  assert.ok(fit.height <= CELL_SIZE * 4.2 + 1e-9);
  assert.ok(fit.width > fit.depth);
});

test("forest layout surrounds every side with every requested layer", () => {
  const layout = createForestRingLayout({
    halfGround: HALF_GROUND,
    cellSize: CELL_SIZE,
    tileWidth: 42,
    tileDepth: 14,
    layers: 4,
  });

  for (const side of ["north", "south", "east", "west"]) {
    const sideTiles = layout.placements.filter((tile) => tile.side === side);
    assert.ok(sideTiles.length > 0);
    assert.deepEqual(
      new Set(sideTiles.map((tile) => tile.layer)),
      new Set([0, 1, 2, 3])
    );
  }
});

test("first forest layer aligns exactly with the city edge", () => {
  const tileDepth = 14;
  const layout = createForestRingLayout({
    halfGround: HALF_GROUND,
    cellSize: CELL_SIZE,
    tileWidth: 42,
    tileDepth,
    layers: 3,
  });

  const firstLayer = layout.placements.filter((tile) => tile.layer === 0);
  const innerEdges = firstLayer.map((tile) => {
    const radialCenter = ["north", "south"].includes(tile.side)
      ? Math.abs(tile.z)
      : Math.abs(tile.x);
    return radialCenter - tileDepth / 2;
  });

  for (const edge of innerEdges) {
    assert.ok(Math.abs(edge - HALF_GROUND) < 1e-9);
  }
});

test("forest rows do not overlap coplanar plates", () => {
  const tileWidth = 42;
  const tileDepth = 14;
  const layout = createForestRingLayout({
    halfGround: HALF_GROUND,
    cellSize: CELL_SIZE,
    tileWidth,
    tileDepth,
    layers: 3,
  });

  assert.ok(layout.tangentialSpacing >= tileWidth - 1e-9);
  assert.ok(layout.radialSpacing >= tileDepth - 1e-9);
});

test("first forest row has no position or angle jitter", () => {
  const layout = createForestRingLayout({
    halfGround: HALF_GROUND,
    cellSize: CELL_SIZE,
    tileWidth: 42,
    tileDepth: 14,
    layers: 2,
  });

  const baseAngles = {
    north: 0,
    south: Math.PI,
    east: Math.PI / 2,
    west: -Math.PI / 2,
  };

  for (const tile of layout.placements.filter((item) => item.layer === 0)) {
    const base = baseAngles[tile.side];
    const deltaModuloHalfTurn = Math.abs(
      Math.sin(tile.rotationY - base)
    );
    assert.ok(deltaModuloHalfTurn < 1e-9);
  }
});

test("forest layout is deterministic and staggered between deeper layers", () => {
  const options = {
    halfGround: HALF_GROUND,
    cellSize: CELL_SIZE,
    tileWidth: 45,
    tileDepth: 12,
    layers: 3,
  };
  const first = createForestRingLayout(options);
  const second = createForestRingLayout(options);

  assert.deepEqual(first, second);

  const northLayer0 = first.placements
    .filter((tile) => tile.side === "north" && tile.layer === 0)
    .map((tile) => tile.x);
  const northLayer1 = first.placements
    .filter((tile) => tile.side === "north" && tile.layer === 1)
    .map((tile) => tile.x);

  assert.notDeepEqual(northLayer0, northLayer1);
  assert.ok(first.outerRadius > first.firstRadius);
});
