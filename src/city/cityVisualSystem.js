const FULL_TURN = Math.PI * 2;
const CITY_CELL_SIZE = 7;

export const CITY_PALETTE = Object.freeze({
  ground: 0x6fae6a,
  road: "#34383f",
  lane: "#f4f2e8",
  sidewalk: 0xd8d3c8,
  crosswalk: 0xf2d35b,
  houseFallback: "#8f6b55",
  roofFallback: 0x8b4c39,
  sky: 0x6ca9ff,
});

export const MODEL_LIBRARY = Object.freeze({
  house: Object.freeze({
    key: "house",
    url: "/models/casa.glb",
    scale: 1.0,
  }),
  largeHouse: Object.freeze({
    key: "largeHouse",
    url: "/models/casa-grande.glb",
    scale: 0.9,
  }),
  pine: Object.freeze({
    key: "pine",
    url: "/models/pino.glb",
    fit: Object.freeze({ targetHeight: 3.2 }),
  }),
  pizzeria: Object.freeze({
    key: "pizzeria",
    url: "/models/pizzeria.glb",
    fit: Object.freeze({
      maxWidthCells: 1.55,
      maxDepthCells: 1.45,
      maxHeightCells: 1.3,
    }),
  }),
});

export const PIZZERIA_LAYOUT = Object.freeze({
  buildingCell: Object.freeze({ gridX: 10, gridZ: 4 }),
  rotationY: 0,
  // Este punto representa el centro VISUAL de la manzana, no el pivote del GLB.
  offsetCells: Object.freeze({ x: 0.5, z: 0.5 }),
  reservedCells: Object.freeze([
    Object.freeze({ gridX: 10, gridZ: 4 }),
    Object.freeze({ gridX: 11, gridZ: 4 }),
    Object.freeze({ gridX: 10, gridZ: 5 }),
    Object.freeze({ gridX: 11, gridZ: 5 }),
  ]),
  // Posiciones relativas al centro visual de la manzana. El runtime centra
  // también la geometría real de cada pino, así que nunca dependen de su pivote.
  landscapePines: Object.freeze([
    Object.freeze({ x: -0.62, z: -0.52, heightScale: 0.92, rotationY: 0.35 }),
    Object.freeze({ x: 0.62, z: -0.52, heightScale: 1.02, rotationY: 2.1 }),
  ]),
});

function mix32(value) {
  let x = value | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
}

export function hash01(gridX, gridZ, salt = 0) {
  const seed =
    Math.imul(gridX + 17, 0x1f123bb5) ^
    Math.imul(gridZ + 31, 0x5f356495) ^
    Math.imul(salt + 47, 0x6c8e9cf5);
  return mix32(seed) / 0xffffffff;
}

export function getModelFitScale(size, fit = {}, cellSize = CITY_CELL_SIZE) {
  const ratios = [];

  const addRatio = (limit, dimension) => {
    if (
      Number.isFinite(limit) &&
      limit > 0 &&
      Number.isFinite(dimension) &&
      dimension > 0
    ) {
      ratios.push(limit / dimension);
    }
  };

  addRatio(fit.targetHeight, size.y);
  addRatio(fit.maxWidthCells * cellSize, size.x);
  addRatio(fit.maxDepthCells * cellSize, size.z);
  addRatio(fit.maxHeightCells * cellSize, size.y);

  return ratios.length > 0 ? Math.min(...ratios) : 1;
}

export function getResidentialModelKey(gridX, gridZ, distFromCenter) {
  const roll = hash01(gridX, gridZ, 11);
  void distFromCenter;

  if (roll > 0.68) {
    return "largeHouse";
  }

  return "house";
}

export function getResidentialScale(modelKey, gridX, gridZ) {
  const model = MODEL_LIBRARY[modelKey] ?? MODEL_LIBRARY.house;
  const variation = 0.96 + hash01(gridX, gridZ, 23) * 0.08;
  return (model.scale ?? 1) * variation;
}

export function getLotFacing(gridX, gridZ) {
  const modX = ((gridX % 3) + 3) % 3;
  const modZ = ((gridZ % 3) + 3) % 3;

  const xSide = modX === 1 ? "west" : "east";
  const zSide = modZ === 1 ? "north" : "south";
  const side = hash01(gridX, gridZ, 37) < 0.5 ? xSide : zSide;

  const yawBySide = {
    north: Math.PI,
    south: 0,
    east: Math.PI / 2,
    west: -Math.PI / 2,
  };

  return {
    side,
    yaw: yawBySide[side] ?? 0,
  };
}

export function shouldPlacePine(gridX, gridZ, distFromCenter) {
  const baseChance = distFromCenter >= 5 ? 0.12 : 0.06;
  return hash01(gridX, gridZ, 53) < baseChance;
}

export function getPinePlacement(gridX, gridZ) {
  const corner = Math.floor(hash01(gridX, gridZ, 67) * 4) % 4;
  const signs = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ][corner];
  const jitterX = (hash01(gridX, gridZ, 71) - 0.5) * 0.28;
  const jitterZ = (hash01(gridX, gridZ, 73) - 0.5) * 0.28;

  return {
    centerOffsetX: signs[0] * 1.18 + jitterX,
    centerOffsetZ: signs[1] * 1.18 + jitterZ,
    targetHeight:
      MODEL_LIBRARY.pine.fit.targetHeight *
      (0.9 + hash01(gridX, gridZ, 79) * 0.16),
    rotationY: hash01(gridX, gridZ, 83) * FULL_TURN,
  };
}

