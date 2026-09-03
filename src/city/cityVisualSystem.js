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
    // El asset original está modelado a una escala mucho mayor que las casas.
    // Esta escala lo convierte en vegetación de acompañamiento y evita que
    // domine el horizonte de la ciudad.
    scale: 0.12,
  }),
  pizzeria: Object.freeze({
    key: "pizzeria",
    url: "/models/pizzeria.glb",
    // El modelo tiene un footprint grande. Lo mantenemos como comercio
    // reconocible, pero dentro del espacio asignado en la manzana.
    scale: 0.32,
  }),
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

  // La casa-árbol funciona mejor como acento de barrios periféricos,
  // no como lenguaje dominante de toda la ciudad.
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

  // Los modelos se tratan como si su frente local mirara hacia +Z.
  // Si un asset nuevo tiene otro frente, se corrige solo en su config.
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
  // Vegetación deliberadamente escasa: los pinos son acentos del barrio,
  // no una segunda capa de edificios en el skyline.
  const baseChance = distFromCenter >= 5 ? 0.22 : 0.12;
  return hash01(gridX, gridZ, 53) < baseChance;
}

export function getPinePlacement(gridX, gridZ, cellSize) {
  const angle = hash01(gridX, gridZ, 67) * FULL_TURN;
  const radius = cellSize * (0.22 + hash01(gridX, gridZ, 71) * 0.06);

  return {
    offsetX: Math.cos(angle) * radius,
    offsetZ: Math.sin(angle) * radius,
    scale: MODEL_LIBRARY.pine.scale * (0.88 + hash01(gridX, gridZ, 79) * 0.2),
    rotationY: hash01(gridX, gridZ, 83) * FULL_TURN,
  };
}

export function isDowntownLot(gridX, gridZ, halfGrid) {
  return (
    Math.max(Math.abs(gridX - halfGrid), Math.abs(gridZ - halfGrid)) <= 2
  );
}
