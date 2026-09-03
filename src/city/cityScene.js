import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  CITY_PALETTE,
  MODEL_LIBRARY,
  getLotFacing,
  getPinePlacement,
  getResidentialModelKey,
  getResidentialScale,
  hash01,
  isDowntownLot,
  shouldPlacePine,
} from "./cityVisualSystem.js";

const gltfLoader = new GLTFLoader();
const modelPrototypeCache = new Map();

const AGENT_POI_LOTS = [
  {
    id: "home",
    label: "Casa",
    modelUrl: "/models/casa.glb",
    buildingCell: { gridX: 4, gridZ: 7 },
    entranceRoad: { gridX: 3, gridZ: 8 },
    scale: 1.2,
    rotationY: Math.PI / 2,
    offsetCells: { x: 0, z: 0.1 },
    capacity: 4,
  },
  {
    id: "shop",
    label: "Tienda",
    modelUrl: "/models/tienda.glb",
    buildingCell: { gridX: 10, gridZ: 7 },
    entranceRoad: { gridX: 9, gridZ: 8 },
    scale: 0.75,
    rotationY: Math.PI,
    offsetCells: { x: 0.9, z: 0 },
    capacity: 10,
    extraCells: [{ gridX: 11, gridZ: 7 }],
  },
  {
    id: "park",
    label: "Parque",
    modelUrl: "/models/parque.glb",
    buildingCell: { gridX: 7, gridZ: 5 },
    entranceRoad: { gridX: 7, gridZ: 4 },
    scale: 0.9,
    rotationY: 0,
    offsetCells: { x: 0.5, z: 2.47 },
    capacity: 30,
    extraCells: [
      { gridX: 6, gridZ: 7 },
      { gridX: 7, gridZ: 7 },
      { gridX: 8, gridZ: 7 },
      { gridX: 6, gridZ: 8 },
      { gridX: 7, gridZ: 8 },
      { gridX: 8, gridZ: 8 },
    ],
  },
];

// Elementos visuales que no forman parte de las metas de los agentes.
const LANDMARK_LOTS = [
  {
    id: "pizzeria",
    label: "Pizzería",
    modelUrl: MODEL_LIBRARY.pizzeria.url,
    buildingCell: { gridX: 10, gridZ: 4 },
    scale: MODEL_LIBRARY.pizzeria.scale,
    rotationY: Math.PI,
    offsetCells: { x: 0.45, z: 0.18 },
    extraCells: [{ gridX: 11, gridZ: 4 }],
    capacity: 14,
  },
];

const VISUAL_LOTS = [...AGENT_POI_LOTS, ...LANDMARK_LOTS];

function loadModelPrototype(url) {
  if (!modelPrototypeCache.has(url)) {
    modelPrototypeCache.set(
      url,
      new Promise((resolve, reject) => {
        gltfLoader.load(
          url,
          (gltf) => resolve(gltf.scene),
          undefined,
          reject
        );
      })
    );
  }

  return modelPrototypeCache.get(url);
}

async function createModelInstance(url) {
  const prototype = await loadModelPrototype(url);
  const root = prototype.clone(true);

  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
  });

  return root;
}

function createRoadTexture({ intersection = false } = {}) {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = CITY_PALETTE.road;
  ctx.fillRect(0, 0, size, size);

  if (!intersection) {
    ctx.strokeStyle = CITY_PALETTE.lane;
    ctx.lineWidth = 5;
    ctx.setLineDash([15, 11]);
    ctx.beginPath();
    ctx.moveTo(size / 2, 0);
    ctx.lineTo(size / 2, size);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function createBuildingTexture(type, gridX, gridZ) {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = type === "tower" ? CITY_PALETTE.tower : CITY_PALETTE.houseFallback;
  ctx.fillRect(0, 0, size, size);

  const cols = type === "tower" ? 8 : 5;
  const rows = type === "tower" ? 12 : 6;
  const marginX = 8;
  const marginY = 8;
  const cellW = (size - marginX * 2) / cols;
  const cellH = (size - marginY * 2) / rows;
  const windowW = cellW * 0.58;
  const windowH = cellH * 0.58;

  for (let iy = 0; iy < rows; iy++) {
    for (let ix = 0; ix < cols; ix++) {
      const x = marginX + ix * cellW + (cellW - windowW) / 2;
      const y = marginY + iy * cellH + (cellH - windowH) / 2;
      const litChance = type === "tower" ? 0.64 : 0.4;
      const isLit = hash01(gridX * cols + ix, gridZ * rows + iy, 101) < litChance;

      ctx.fillStyle = isLit
        ? CITY_PALETTE.warmWindow
        : CITY_PALETTE.darkWindow;
      ctx.fillRect(x, y, windowW, windowH);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function createFallbackTree() {
  const tree = new THREE.Group();
  const trunkHeight = 1.8;

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.28, trunkHeight, 6),
    new THREE.MeshStandardMaterial({ color: 0x805735, roughness: 0.9 })
  );
  trunk.position.y = trunkHeight / 2;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  tree.add(trunk);

  const foliage = new THREE.Mesh(
    new THREE.ConeGeometry(0.95, 2.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x3f7d46, roughness: 0.8 })
  );
  foliage.position.y = 2.6;
  foliage.castShadow = true;
  foliage.receiveShadow = true;
  tree.add(foliage);

  return tree;
}

function createFallbackHouse(worldX, worldZ, scale = 1) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(3.1, 2.3, 3.2),
    new THREE.MeshStandardMaterial({
      color: 0x9a735c,
      roughness: 0.78,
      metalness: 0.02,
    })
  );
  body.position.y = 1.15;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(2.45, 1.35, 4),
    new THREE.MeshStandardMaterial({
      color: CITY_PALETTE.roofFallback,
      roughness: 0.82,
    })
  );
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 2.85;
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  group.position.set(worldX, 0, worldZ);
  group.scale.setScalar(scale);
  return group;
}

function createCrosswalk(width, depth, stripeCount = 7) {
  const group = new THREE.Group();
  const usableWidth = width * 0.8;
  const stripeWidth = usableWidth / stripeCount;
  const totalGap = width - usableWidth;
  const gap = totalGap / (stripeCount + 1);

  const geometry = new THREE.BoxGeometry(stripeWidth, 0.02, depth);
  const material = new THREE.MeshStandardMaterial({
    color: CITY_PALETTE.crosswalk,
    roughness: 0.55,
    metalness: 0.04,
  });

  let x = -width / 2 + gap + stripeWidth / 2;
  for (let i = 0; i < stripeCount; i++) {
    const stripe = new THREE.Mesh(geometry, material);
    stripe.position.set(x, 0.01, 0);
    stripe.receiveShadow = true;
    group.add(stripe);
    x += stripeWidth + gap;
  }

  return group;
}

function createTower({ gridX, gridZ, worldX, worldZ, cellSize }) {
  const minHeight = 11;
  const maxHeight = 22;
  const baseHeight = THREE.MathUtils.lerp(
    minHeight,
    maxHeight,
    hash01(gridX, gridZ, 131)
  );

  const facadeTexture = createBuildingTexture("tower", gridX, gridZ);
  const facadeMat = new THREE.MeshStandardMaterial({
    map: facadeTexture,
    emissiveMap: facadeTexture,
    color: 0xffffff,
    metalness: 0.32,
    roughness: 0.48,
    emissive: new THREE.Color(0x111111),
    emissiveIntensity: 0.78,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x303742,
    roughness: 0.58,
    metalness: 0.12,
  });
  const bottomMat = new THREE.MeshStandardMaterial({
    color: 0x22252a,
    roughness: 0.95,
  });

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [
    facadeMat,
    facadeMat,
    roofMat,
    bottomMat,
    facadeMat,
    facadeMat,
  ]);

  const footprint = cellSize * 0.5;
  mesh.scale.set(footprint, baseHeight, footprint);
  mesh.position.set(worldX, baseHeight / 2, worldZ);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const capacity = Math.round(baseHeight * 10);
  const buildingId = `b-${gridX}-${gridZ}`;
  mesh.userData = {
    buildingId,
    type: "tower",
    baseHeight,
    capacity,
    gridX,
    gridZ,
    baseEmissiveIntensity: 0.78,
  };

  return {
    id: buildingId,
    mesh,
    type: "tower",
    capacity,
    baseHeight,
    gridX,
    gridZ,
    supportsHeightScaling: true,
  };
}

function getVisualLotAt(gridX, gridZ) {
  return VISUAL_LOTS.find(
    (lot) =>
      lot.buildingCell.gridX === gridX && lot.buildingCell.gridZ === gridZ
  );
}

function isReservedVisualCell(gridX, gridZ) {
  return VISUAL_LOTS.some((lot) => {
    if (
      lot.buildingCell.gridX === gridX &&
      lot.buildingCell.gridZ === gridZ
    ) {
      return true;
    }

    return (lot.extraCells ?? []).some(
      (cell) => cell.gridX === gridX && cell.gridZ === gridZ
    );
  });
}

function getSetbackForFacing(side, amount) {
  if (side === "north") return { x: 0, z: amount };
  if (side === "south") return { x: 0, z: -amount };
  if (side === "east") return { x: -amount, z: 0 };
  return { x: amount, z: 0 };
}

function createResidentialPath(side, worldX, worldZ, cellSize, material) {
  const width = Math.max(0.55, cellSize * 0.09);
  const length = cellSize * 0.34;
  const geometry = new THREE.PlaneGeometry(width, length);
  const path = new THREE.Mesh(geometry, material);
  path.rotation.x = -Math.PI / 2;
  path.position.y = 0.035;

  const edgeOffset = cellSize * 0.33;
  if (side === "north") {
    path.position.set(worldX, 0.035, worldZ - edgeOffset);
  } else if (side === "south") {
    path.position.set(worldX, 0.035, worldZ + edgeOffset);
  } else if (side === "east") {
    path.rotation.z = Math.PI / 2;
    path.position.set(worldX + edgeOffset, 0.035, worldZ);
  } else {
    path.rotation.z = Math.PI / 2;
    path.position.set(worldX - edgeOffset, 0.035, worldZ);
  }

  path.receiveShadow = true;
  return path;
}

function addSidewalksForCell({
  scene,
  sidewalks,
  isRoadCell,
  gridX,
  gridZ,
  worldX,
  worldZ,
  cellSize,
  sidewalkWidth,
  sidewalkHeight,
  sidewalkMaterial,
}) {
  const y = sidewalkHeight / 2 + 0.03;

  const add = (side, geometry, x, z) => {
    const mesh = new THREE.Mesh(geometry, sidewalkMaterial);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    sidewalks.push({ mesh, gridX, gridZ, side });
  };

  if (isRoadCell(gridX, gridZ - 1)) {
    add(
      "north",
      new THREE.BoxGeometry(cellSize, sidewalkHeight, sidewalkWidth),
      worldX,
      worldZ - cellSize / 2 + sidewalkWidth / 2
    );
  }
  if (isRoadCell(gridX, gridZ + 1)) {
    add(
      "south",
      new THREE.BoxGeometry(cellSize, sidewalkHeight, sidewalkWidth),
      worldX,
      worldZ + cellSize / 2 - sidewalkWidth / 2
    );
  }
  if (isRoadCell(gridX - 1, gridZ)) {
    add(
      "west",
      new THREE.BoxGeometry(sidewalkWidth, sidewalkHeight, cellSize),
      worldX - cellSize / 2 + sidewalkWidth / 2,
      worldZ
    );
  }
  if (isRoadCell(gridX + 1, gridZ)) {
    add(
      "east",
      new THREE.BoxGeometry(sidewalkWidth, sidewalkHeight, cellSize),
      worldX + cellSize / 2 - sidewalkWidth / 2,
      worldZ
    );
  }
}

function placeVisualLot({ lot, worldX, worldZ, cellSize, scene, buildings, visualModels }) {
  const offsetX = (lot.offsetCells?.x ?? 0) * cellSize;
  const offsetZ = (lot.offsetCells?.z ?? 0) * cellSize;

  createModelInstance(lot.modelUrl)
    .then((root) => {
      root.position.set(worldX + offsetX, 0, worldZ + offsetZ);
      root.scale.setScalar(lot.scale ?? 1);
      root.rotation.y = lot.rotationY ?? 0;
      root.userData.cityVisualType = lot.id;
      scene.add(root);
      visualModels.push(root);

      buildings.push({
        id: `visual-${lot.id}`,
        mesh: root,
        type: lot.id,
        capacity: lot.capacity ?? 10,
        baseHeight: lot.baseHeight ?? 5,
        gridX: lot.buildingCell.gridX,
        gridZ: lot.buildingCell.gridZ,
        supportsHeightScaling: false,
      });
    })
    .catch((error) => {
      console.error(`Error cargando modelo ${lot.id}:`, error);
    });
}

function placeResidentialLot({
  gridX,
  gridZ,
  worldX,
  worldZ,
  distFromCenter,
  cellSize,
  scene,
  residentialLots,
  visualModels,
  paths,
  pathMaterial,
}) {
  const modelKey = getResidentialModelKey(gridX, gridZ, distFromCenter);
  const model = MODEL_LIBRARY[modelKey] ?? MODEL_LIBRARY.house;
  const facing = getLotFacing(gridX, gridZ);
  const setback = getSetbackForFacing(facing.side, cellSize * 0.055);
  const scale = getResidentialScale(modelKey, gridX, gridZ);
  const houseX = worldX + setback.x;
  const houseZ = worldZ + setback.z;

  const path = createResidentialPath(
    facing.side,
    worldX,
    worldZ,
    cellSize,
    pathMaterial
  );
  scene.add(path);
  paths.push(path);

  const lotData = {
    id: `res-${gridX}-${gridZ}`,
    gridX,
    gridZ,
    modelKey,
    facing: facing.side,
    mesh: null,
  };
  residentialLots.push(lotData);

  createModelInstance(model.url)
    .then((root) => {
      root.position.set(houseX, 0, houseZ);
      root.scale.setScalar(scale);
      root.rotation.y = facing.yaw;
      root.userData.cityVisualType = "residential";
      root.userData.residentialModel = modelKey;
      scene.add(root);
      visualModels.push(root);
      lotData.mesh = root;
    })
    .catch((error) => {
      console.error(`Error cargando ${model.url}; usando casa fallback.`, error);
      const fallback = createFallbackHouse(houseX, houseZ, 0.95);
      fallback.rotation.y = facing.yaw;
      scene.add(fallback);
      visualModels.push(fallback);
      lotData.mesh = fallback;
    });
}

function placePine({
  gridX,
  gridZ,
  worldX,
  worldZ,
  cellSize,
  scene,
  trees,
  visualModels,
}) {
  const placement = getPinePlacement(gridX, gridZ, cellSize);
  const pineX = worldX + placement.offsetX;
  const pineZ = worldZ + placement.offsetZ;

  createModelInstance(MODEL_LIBRARY.pine.url)
    .then((root) => {
      root.position.set(pineX, 0, pineZ);
      root.scale.setScalar(placement.scale);
      root.rotation.y = placement.rotationY;
      root.userData.cityVisualType = "pine";
      scene.add(root);
      visualModels.push(root);
      trees.push({ group: root, gridX, gridZ, model: "pino.glb" });
    })
    .catch((error) => {
      console.error("Error cargando pino.glb; usando árbol fallback.", error);
      const fallback = createFallbackTree();
      fallback.position.set(pineX, 0, pineZ);
      scene.add(fallback);
      trees.push({ group: fallback, gridX, gridZ, model: "fallback" });
    });
}

export function createCity(scene) {
  const gridSize = 15;
  const cellSize = 7;
  const roadStep = 3;
  const halfGrid = (gridSize - 1) / 2;

  const isRoadCell = (gridX, gridZ) =>
    gridX >= 0 &&
    gridX < gridSize &&
    gridZ >= 0 &&
    gridZ < gridSize &&
    (gridX % roadStep === 0 || gridZ % roadStep === 0);

  const groundSize = gridSize * cellSize;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(groundSize, groundSize),
    new THREE.MeshStandardMaterial({
      color: CITY_PALETTE.ground,
      roughness: 0.92,
      metalness: 0,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const roadTextureBase = createRoadTexture({ intersection: false });
  const roadTextureRotated = roadTextureBase.clone();
  roadTextureRotated.center.set(0.5, 0.5);
  roadTextureRotated.rotation = Math.PI / 2;
  const intersectionTexture = createRoadTexture({ intersection: true });

  const roadMatVertical = new THREE.MeshStandardMaterial({
    map: roadTextureBase,
    roughness: 0.95,
  });
  const roadMatHorizontal = new THREE.MeshStandardMaterial({
    map: roadTextureRotated,
    roughness: 0.95,
  });
  const intersectionMat = new THREE.MeshStandardMaterial({
    map: intersectionTexture,
    roughness: 0.95,
  });

  const sidewalkMaterial = new THREE.MeshStandardMaterial({
    color: CITY_PALETTE.sidewalk,
    roughness: 0.94,
    metalness: 0,
  });
  const pathMaterial = new THREE.MeshStandardMaterial({
    color: 0xc7c0b3,
    roughness: 0.96,
    metalness: 0,
  });
  const sidewalkHeight = 0.08;
  const sidewalkWidth = cellSize * 0.18;

  const sidewalks = [];
  const roads = [];
  const buildings = [];
  const trees = [];
  const crosswalks = [];
  const roadMap = new Map();
  const residentialLots = [];
  const visualModels = [];
  const paths = [];

  const sidewalkOffsetForWalker =
    cellSize / 2 + sidewalkWidth / 2 - 0.02;

  // Calles y grafo vial. Se conserva exactamente la misma lógica de celdas
  // para no modificar navegación, pathfinding ni Q-Learning.
  for (let gridX = 0; gridX < gridSize; gridX++) {
    for (let gridZ = 0; gridZ < gridSize; gridZ++) {
      if (!isRoadCell(gridX, gridZ)) continue;

      const isRoadRow = gridX % roadStep === 0;
      const isRoadCol = gridZ % roadStep === 0;
      const isIntersection = isRoadRow && isRoadCol;
      const worldX = (gridX - halfGrid) * cellSize;
      const worldZ = (gridZ - halfGrid) * cellSize;

      let material = roadMatVertical;
      if (isIntersection) material = intersectionMat;
      else if (isRoadCol && !isRoadRow) material = roadMatHorizontal;

      const road = new THREE.Mesh(
        new THREE.PlaneGeometry(cellSize, cellSize),
        material
      );
      road.rotation.x = -Math.PI / 2;
      road.position.set(worldX, 0.02, worldZ);
      road.receiveShadow = true;
      scene.add(road);

      const roadData = {
        mesh: road,
        gridX,
        gridZ,
        isIntersection,
        isRoadRow,
        isRoadCol,
      };
      roads.push(roadData);
      roadMap.set(`${gridX},${gridZ}`, roadData);
    }
  }

  // Cada manzana está formada por 2x2 celdas no viales. En barrios
  // residenciales usamos una casa GLB por celda: hasta cuatro casas por cuadra.
  for (let gridX = 0; gridX < gridSize; gridX++) {
    for (let gridZ = 0; gridZ < gridSize; gridZ++) {
      if (isRoadCell(gridX, gridZ)) continue;

      const worldX = (gridX - halfGrid) * cellSize;
      const worldZ = (gridZ - halfGrid) * cellSize;
      const distFromCenter = Math.max(
        Math.abs(gridX - halfGrid),
        Math.abs(gridZ - halfGrid)
      );

      addSidewalksForCell({
        scene,
        sidewalks,
        isRoadCell,
        gridX,
        gridZ,
        worldX,
        worldZ,
        cellSize,
        sidewalkWidth,
        sidewalkHeight,
        sidewalkMaterial,
      });

      const visualLot = getVisualLotAt(gridX, gridZ);
      if (visualLot) {
        placeVisualLot({
          lot: visualLot,
          worldX,
          worldZ,
          cellSize,
          scene,
          buildings,
          visualModels,
        });
        continue;
      }

      if (isReservedVisualCell(gridX, gridZ)) continue;

      if (isDowntownLot(gridX, gridZ, halfGrid)) {
        const tower = createTower({
          gridX,
          gridZ,
          worldX,
          worldZ,
          cellSize,
        });
        scene.add(tower.mesh);
        buildings.push(tower);
        continue;
      }

      placeResidentialLot({
        gridX,
        gridZ,
        worldX,
        worldZ,
        distFromCenter,
        cellSize,
        scene,
        residentialLots,
        visualModels,
        paths,
        pathMaterial,
      });

      if (shouldPlacePine(gridX, gridZ, distFromCenter)) {
        placePine({
          gridX,
          gridZ,
          worldX,
          worldZ,
          cellSize,
          scene,
          trees,
          visualModels,
        });
      }
    }
  }

  const crosswalkWidthWorld = cellSize * 0.8;
  const crosswalkDepthWorld = cellSize * 0.28;

  for (const road of roads) {
    if (!road.isIntersection) continue;

    const centerX = (road.gridX - halfGrid) * cellSize;
    const centerZ = (road.gridZ - halfGrid) * cellSize;

    const addCrosswalk = (x, z, rotationY = 0) => {
      const crosswalk = createCrosswalk(
        crosswalkWidthWorld,
        crosswalkDepthWorld,
        7
      );
      crosswalk.rotation.y = rotationY;
      crosswalk.position.set(x, 0.03, z);
      scene.add(crosswalk);
      crosswalks.push(crosswalk);
    };

    if (road.gridZ > 0) {
      addCrosswalk(
        centerX,
        centerZ - cellSize / 2 - crosswalkDepthWorld / 2
      );
    }
    if (road.gridZ < gridSize - 1) {
      addCrosswalk(
        centerX,
        centerZ + cellSize / 2 + crosswalkDepthWorld / 2
      );
    }
    if (road.gridX < gridSize - 1) {
      addCrosswalk(
        centerX + cellSize / 2 + crosswalkDepthWorld / 2,
        centerZ,
        Math.PI / 2
      );
    }
    if (road.gridX > 0) {
      addCrosswalk(
        centerX - cellSize / 2 - crosswalkDepthWorld / 2,
        centerZ,
        Math.PI / 2
      );
    }
  }

  const halfGround = groundSize / 2;
  const perimeterWidth = sidewalkWidth;
  const yPerimeter = sidewalkHeight / 2 + 0.03;
  const perimeterSidewalks = [];

  const addPerimeter = (geometry, x, z) => {
    const mesh = new THREE.Mesh(geometry, sidewalkMaterial);
    mesh.position.set(x, yPerimeter, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    perimeterSidewalks.push(mesh);
  };

  const sideGeomZ = new THREE.BoxGeometry(
    perimeterWidth,
    sidewalkHeight,
    groundSize
  );
  addPerimeter(sideGeomZ, -halfGround + perimeterWidth / 2, 0);
  addPerimeter(sideGeomZ, halfGround - perimeterWidth / 2, 0);

  const sideGeomX = new THREE.BoxGeometry(
    groundSize,
    sidewalkHeight,
    perimeterWidth
  );
  addPerimeter(sideGeomX, 0, -halfGround + perimeterWidth / 2);
  addPerimeter(sideGeomX, 0, halfGround - perimeterWidth / 2);

  const fogColor = new THREE.Color(CITY_PALETTE.sky).multiplyScalar(0.7);
  scene.fog = new THREE.FogExp2(fogColor, 0.007);

  const pointsOfInterest = {};
  for (const lot of AGENT_POI_LOTS) {
    pointsOfInterest[lot.id] = {
      id: lot.id,
      label: lot.label,
      type: lot.id,
      buildingCell: { ...lot.buildingCell },
      entranceRoad: { ...lot.entranceRoad },
    };
  }

  return {
    ground,
    roads,
    sidewalks,
    perimeterSidewalks,
    crosswalks,
    buildings,
    trees,
    roadMap,
    pointsOfInterest,
    residentialLots,
    visualModels,
    paths,
    gridSize,
    cellSize,
    sidewalkWidth,
    sidewalkOffset: sidewalkOffsetForWalker,
  };
}

export function applyCityState(city, state, scene) {
  const {
    buildingHeightMultiplier = 1,
    skyColor = "#6ca9ff",
    cityGlowIntensity = 0.7,
  } = state;

  city.buildings.forEach((building) => {
    if (!building.supportsHeightScaling) return;

    const mesh = building.mesh;
    const newHeight = building.baseHeight * buildingHeightMultiplier;
    mesh.scale.y = newHeight;
    mesh.position.y = newHeight / 2;

    const baseEmissive = mesh.userData.baseEmissiveIntensity ?? 0.5;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];

    materials.forEach((material) => {
      if (material?.isMeshStandardMaterial) {
        material.emissiveIntensity = baseEmissive * cityGlowIntensity;
      }
    });
  });

  if (scene) {
    const color = new THREE.Color(skyColor);
    scene.background = color;
    if (scene.fog) {
      scene.fog.color.copy(color.clone().multiplyScalar(0.7));
    }
  }
}

export function gridToWorld(city, gridX, gridZ, y = 0) {
  const half = (city.gridSize - 1) / 2;
  return {
    x: (gridX - half) * city.cellSize,
    y,
    z: (gridZ - half) * city.cellSize,
  };
}

export function worldToGrid(city, x, z) {
  const half = (city.gridSize - 1) / 2;
  return {
    gridX: Math.round(x / city.cellSize + half),
    gridZ: Math.round(z / city.cellSize + half),
  };
}
