const FULL_TURN = Math.PI * 2;
const CITY_CELL_SIZE = 7;

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
    // Es una pieza especial de la ciudad, así que la hacemos más protagonista.
    scale: 0.58,
  }),
  pine: Object.freeze({
    key: "pine",
    url: "/models/pino.glb",
    // El GLB está modelado en cientos de unidades. Esta escala lo deja en
    // proporción urbana y con suficiente margen respecto a calles y banquetas.
    scale: 0.0085,
  }),
  pizzeria: Object.freeze({
    key: "pizzeria",
    url: "/models/pizzeria.glb",
    // Aprovecha mejor la manzana completa sin recuperar el tamaño invasivo
    // de las primeras pruebas.
    scale: 0.4,
  }),
});

// El pino de Sketchfab tiene su geometría muy desplazada respecto al origen.
// Estos valores salen de los bounds del POSITION accessor del propio GLB.
export const PINE_SOURCE_CENTER = Object.freeze({
  x: (345.8518371582031 + 578.1685180664063) / 2,
  z: (13.900848388671875 + 451.65478515625) / 2,
});

// Solo habrá una casa-árbol en toda la ciudad. La mantenemos en uno de los
// lotes periféricos donde ya podía aparecer antes, pero ahora como landmark
// residencial explícito y estable.
export const TREE_HOUSE_LAYOUT = Object.freeze({
  gridX: 13,
  gridZ: 4,
});

export const PIZZERIA_LAYOUT = Object.freeze({
  buildingCell: Object.freeze({ gridX: 10, gridZ: 4 }),
  rotationY: 0,
  // El asset no está centrado respecto a su origen. Este offset lo desplaza
  // hacia el centro visual de la manzana y lo retira de la acera frontal.
  offsetCells: Object.freeze({ x: 0.88, z: 0.08 }),
  reservedCells: Object.freeze([
    Object.freeze({ gridX: 10, gridZ: 4 }),
    Object.freeze({ gridX: 11, gridZ: 4 }),
    Object.freeze({ gridX: 10, gridZ: 5 }),
    Object.freeze({ gridX: 11, gridZ: 5 }),
  ]),
  // Coordenadas de raíz compensadas por el pivote desplazado de pino.glb.
  // Visualmente ambos árboles quedan dentro del terreno, detrás del comercio.
  landscapePines: Object.freeze([
    Object.freeze({ x: -0.51, z: -0.16, scale: 0.9, rotationY: 0.35 }),
    Object.freeze({ x: 0.44, z: -0.18, scale: 1.0, rotationY: 2.1 }),
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

export function isTreeHouseLot(gridX, gridZ) {
  return gridX === TREE_HOUSE_LAYOUT.gridX && gridZ === TREE_HOUSE_LAYOUT.gridZ;
}

export function getResidentialModelKey(gridX, gridZ, distFromCenter) {
  if (isTreeHouseLot(gridX, gridZ)) {
    return "treeHouse";
  }

  const roll = hash01(gridX, gridZ, 11);

  // El resto del barrio alterna únicamente casas normales y casas grandes.
  // distFromCenter se conserva en la firma para poder volver a zonificar más
  // adelante sin romper a los consumidores actuales.
  void distFromCenter;

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
  const baseChance = distFromCenter >= 5 ? 0.16 : 0.08;
  return hash01(gridX, gridZ, 53) < baseChance;
}

export function getPinePlacement(gridX, gridZ, cellSize = CITY_CELL_SIZE) {
  const angle = hash01(gridX, gridZ, 67) * FULL_TURN;
  const radius = cellSize * (0.09 + hash01(gridX, gridZ, 71) * 0.04);
  const scale =
    MODEL_LIBRARY.pine.scale * (0.92 + hash01(gridX, gridZ, 79) * 0.14);

  // Primero elegimos dónde queremos ver el centro del árbol dentro del lote.
  const visualCenterOffsetX = Math.cos(angle) * radius;
  const visualCenterOffsetZ = Math.sin(angle) * radius;

  // Después compensamos el origen desplazado del GLB para que la geometría,
  // y no solo su pivote, quede realmente dentro de la propiedad.
  const pivotOffsetX = PINE_SOURCE_CENTER.x * scale;
  const pivotOffsetZ = PINE_SOURCE_CENTER.z * scale;

  return {
    offsetX: visualCenterOffsetX - pivotOffsetX,
    offsetZ: visualCenterOffsetZ - pivotOffsetZ,
    visualCenterOffsetX,
    visualCenterOffsetZ,
    scale,
    rotationY: hash01(gridX, gridZ, 83) * FULL_TURN,
  };
}

export function isDowntownLot(gridX, gridZ, halfGrid) {
  return (
    Math.max(Math.abs(gridX - halfGrid), Math.abs(gridZ - halfGrid)) <= 2
  );
}
