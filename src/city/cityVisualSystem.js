const FULL_TURN = Math.PI * 2;

export const CITY_PALETTE = Object.freeze({
  ground: 0x6fae6a,
  road: "#34383f",
  lane: "#f4f2e8",
  sidewalk: 0xd8d3c8,
  crosswalk: 0xf2d35b,
  tower: "#253041",
  houseFallback: "#8f6b55",
  roofFallback: 0x8b4c39,
  darkWindow: "#171a20",
  warmWindow: "#ffd978",
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
  treeHouse: Object.freeze({
    key: "treeHouse",
    url: "/models/casa-arbol.glb",
    scale: 0.42,
  }),
  pine: Object.freeze({
    key: "pine",
    url: "/models/pino.glb",
    // El GLB mide cientos de unidades en su espacio original. Con ~0.01
    // queda en una escala urbana comparable con las casas (aprox. 4-5 m).
    scale: 0.01,
  }),
  pizzeria: Object.freeze({
    key: "pizzeria",
    url: "/models/pizzeria.glb",
    scale: 0.32,
  }),
});

export const PIZZERIA_LAYOUT = Object.freeze({
  buildingCell: Object.freeze({ gridX: 10, gridZ: 4 }),
  // El modelo estaba mostrando la fachada hacia el lado contrario.
  // Cero radianes lo gira 180 grados respecto a la integración anterior.
  rotationY: 0,
  // El landmark usa una manzana completa de 2x2 y se centra en ella.
  offsetCells: Object.freeze({ x: 0.5, z: 0.5 }),
  reservedCells: Object.freeze([
    Object.freeze({ gridX: 10, gridZ: 4 }),
    Object.freeze({ gridX: 11, gridZ: 4 }),
    Object.freeze({ gridX: 10, gridZ: 5 }),
    Object.freeze({ gridX: 11, gridZ: 5 }),
  ]),
  // La fachada queda orientada hacia +Z; por eso el paisajismo se concentra
  // al fondo de la manzana para mantener libre la entrada y la acera frontal.
  landscapePines: Object.freeze([
    Object.freeze({ x: -0.24, z: -0.24, scale: 0.92, rotationY: 0.35 }),
    Object.freeze({ x: 1.24, z: -0.24, scale: 1.04, rotationY: 2.1 }),
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

export function getResidentialModelKey(gridX, gridZ, distFromCenter) {
  const roll = hash01(gridX, gridZ, 11);

  if (distFromCenter >= 5 && roll > 0.9) {
    return "treeHouse";
  }

  if (roll > 0.68) {
    return "largeHouse";
  }

  return "house";
}

export function getResidentialScale(modelKey, gridX, gridZ) {
  const model = MODEL_LIBRARY[modelKey] ?? MODEL_LIBRARY.house;
  const variation = 0.96 + hash01(gridX, gridZ, 23) * 0.08;
  return model.scale * variation;
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
  const baseChance = distFromCenter >= 5 ? 0.18 : 0.1;
  return hash01(gridX, gridZ, 53) < baseChance;
}

export function getPinePlacement(gridX, gridZ, cellSize) {
  const angle = hash01(gridX, gridZ, 67) * FULL_TURN;
  const radius = cellSize * (0.22 + hash01(gridX, gridZ, 71) * 0.06);

  return {
    offsetX: Math.cos(angle) * radius,
    offsetZ: Math.sin(angle) * radius,
    scale: MODEL_LIBRARY.pine.scale * (0.9 + hash01(gridX, gridZ, 79) * 0.18),
    rotationY: hash01(gridX, gridZ, 83) * FULL_TURN,
  };
}

export function isDowntownLot(gridX, gridZ, halfGrid) {
  return (
    Math.max(Math.abs(gridX - halfGrid), Math.abs(gridZ - halfGrid)) <= 2
  );
}
