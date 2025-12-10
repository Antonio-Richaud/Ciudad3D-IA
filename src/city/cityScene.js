// src/city/cityScene.js
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const gltfLoader = new GLTFLoader();

// Rutas a tus modelos (ajusta si usas otros nombres)
const HOUSE_MODEL_URL = "/models/casa.glb";
const SHOP_MODEL_URL = "/models/tienda.glb";
const PARK_MODEL_URL = "/models/parque.glb";



/**
 * Lotes especiales donde NO queremos edificio procedimental,
 * sino tu modelo de Blender.
 *
 * buildingCell = celda de manzana donde va el modelo.
 * entranceRoad = celda de calle que será el "punto de entrada" del agente.
 */
const SPECIAL_LOTS = [
  {
    id: "home",
    label: "Casa",
    modelUrl: HOUSE_MODEL_URL,
    buildingCell: { gridX: 4, gridZ: 7 },
    // Antes: { gridX: 3, gridZ: 7 }
    entranceRoad: { gridX: 3, gridZ: 8 },   // 👉 coincide con círculo morado
    scale: 1.2,
    rotationY: Math.PI / 2,
    capacity: 4,
  },
  {
    id: "shop",
    label: "Tienda",
    modelUrl: SHOP_MODEL_URL,
    buildingCell: { gridX: 10, gridZ: 7 },
    // Antes: { gridX: 9, gridZ: 7 }
    entranceRoad: { gridX: 9, gridZ: 8 },   // 👉 coincide con círculo morado
    scale: 0.75,
    rotationY: Math.PI,
    capacity: 10,
    extraCells: [{ gridX: 11, gridZ: 7 }],
  },
  // ---------- PARQUE ----------
  {
    id: "park",
    label: "Parque",
    modelUrl: PARK_MODEL_URL,

    // Celda “base” (donde ya comprobamos que aparece el parque)
    buildingCell: { gridX: 7, gridZ: 5 },

    // Manzana gorda reservada para que no haya edificios alrededor
    extraCells: [
      { gridX: 6, gridZ: 5 },
      { gridX: 8, gridZ: 5 },
      { gridX: 6, gridZ: 6 },
      { gridX: 7, gridZ: 6 },
      { gridX: 8, gridZ: 6 },
      { gridX: 6, gridZ: 7 },
      { gridX: 7, gridZ: 7 },
      { gridX: 8, gridZ: 7 },
      { gridX: 6, gridZ: 8 },
      { gridX: 7, gridZ: 8 },
      { gridX: 8, gridZ: 8 },
    ],

    entranceRoad: { gridX: 7, gridZ: 4 },

    // Lo hacemos un poco más pequeño para que no se meta tanto a la calle
    scale: 0.85,
    rotationY: 0,
    capacity: 30,
  },
];

/**
 * Textura de pavimento con línea central o cruce.
 */
function createRoadTexture({ intersection = false } = {}) {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  // Fondo asfalto
  ctx.fillStyle = "#3f4349";
  ctx.fillRect(0, 0, size, size);

  if (!intersection) {
    // =========================
    // TRAMO DE CALLE NORMAL
    // =========================
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 6;
    ctx.setLineDash([14, 10]); // línea discontinua

    ctx.beginPath();
    ctx.moveTo(size / 2, 0);
    ctx.lineTo(size / 2, size);
    ctx.stroke();
  } else {
    // =========================
    // INTERSECCIÓN
    // =========================
    // La dejamos solo con asfalto (sin cruz blanca).
    // Todo el “dibujo” de los cruces peatonales lo estamos
    // haciendo con geometría aparte, fuera de este tile.
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Textura de fachada con ventanitas.
 */
function createBuildingTexture(type) {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  if (type === "tower") {
    ctx.fillStyle = "#1f2633";
  } else {
    ctx.fillStyle = "#5c4b3c";
  }
  ctx.fillRect(0, 0, size, size);

  const cols = type === "tower" ? 8 : 5;
  const rows = type === "tower" ? 12 : 6;

  const marginX = 8;
  const marginY = 8;
  const cellW = (size - marginX * 2) / cols;
  const cellH = (size - marginY * 2) / rows;
  const windowW = cellW * 0.6;
  const windowH = cellH * 0.6;

  for (let iy = 0; iy < rows; iy++) {
    for (let ix = 0; ix < cols; ix++) {
      const x = marginX + ix * cellW + (cellW - windowW) / 2;
      const y = marginY + iy * cellH + (cellH - windowH) / 2;

      const litChance = type === "tower" ? 0.65 : 0.4;
      const isLit = Math.random() < litChance;

      ctx.fillStyle = isLit ? "#ffd86a" : "#181a1f";
      ctx.fillRect(x, y, windowW, windowH);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Árbol (tronco + copa).
 */
function createTree() {
  const tree = new THREE.Group();

  const trunkHeight = 2;
  const trunkGeom = new THREE.CylinderGeometry(0.25, 0.35, trunkHeight, 6);
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x8a5a2b,
    roughness: 0.8,
    metalness: 0.1,
  });
  const trunk = new THREE.Mesh(trunkGeom, trunkMat);
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  trunk.position.y = trunkHeight / 2;
  tree.add(trunk);

  const foliageHeight = 2.5;
  const foliageGeom = new THREE.ConeGeometry(1.1, foliageHeight, 8);
  const foliageMat = new THREE.MeshStandardMaterial({
    color: 0x3c7d3b,
    roughness: 0.6,
    metalness: 0.05,
  });
  const foliage = new THREE.Mesh(foliageGeom, foliageMat);
  foliage.castShadow = true;
  foliage.receiveShadow = true;
  foliage.position.y = trunkHeight + foliageHeight / 2 - 0.2;
  tree.add(foliage);

  return tree;
}

function createSpecialBuilding(lot, worldX, worldZ, scene, buildings) {
  gltfLoader.load(
    lot.modelUrl,
    (gltf) => {
      const root = gltf.scene;
      root.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });

      root.position.set(worldX, 0, worldZ);
      const s = lot.scale ?? 1;
      root.scale.setScalar(s);
      root.rotation.y = lot.rotationY ?? 0;

      scene.add(root);

      // Lo registramos como "edificio" especial dentro de la ciudad
      buildings.push({
        id: `poi-${lot.id}`,
        mesh: root,
        type: lot.id,
        capacity: lot.capacity ?? 10,
        baseHeight: lot.baseHeight ?? 5,
        gridX: lot.buildingCell.gridX,
        gridZ: lot.buildingCell.gridZ,
      });
    },
    undefined,
    (error) => {
      console.error(`Error cargando modelo ${lot.id}:`, error);
    }
  );
}

/**
 * Grupo de franjas tipo "zebra" para un cruce peatonal.
 * width  = ancho total del cruce (de banqueta a banqueta).
 * depth  = qué tanto se mete en la calle.
 */
function createCrosswalk(width, depth, stripeCount = 7) {
  const group = new THREE.Group();

  const usableWidth = width * 0.8;
  const stripeWidth = usableWidth / stripeCount;
  const totalGap = width - usableWidth;
  const gap = totalGap / (stripeCount + 1);

  const geom = new THREE.BoxGeometry(stripeWidth, 0.02, depth);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xf3d35b,
    roughness: 0.4,
    metalness: 0.15,
  });

  let x = -width / 2 + gap + stripeWidth / 2;
  for (let i = 0; i < stripeCount; i++) {
    const stripe = new THREE.Mesh(geom, mat);
    stripe.position.set(x, 0.01, 0);
    stripe.castShadow = true;
    stripe.receiveShadow = true;
    group.add(stripe);
    x += stripeWidth + gap;
  }

  return group;
}

export function createCity(scene) {
  // Parámetros globales de la cuadrícula
  const gridSize = 15;
  const cellSize = 7;              // celdas amplias
  const roadStep = 3;
  const halfGrid = (gridSize - 1) / 2;

  // helper: ¿esta celda es calle?
  const isRoadCell = (gx, gz) =>
    gx >= 0 &&
    gx < gridSize &&
    gz >= 0 &&
    gz < gridSize &&
    (gx % roadStep === 0 || gz % roadStep === 0);

  // === Piso verde ===
  const groundSize = gridSize * cellSize;
  const groundGeom = new THREE.PlaneGeometry(groundSize, groundSize);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x7fbf7a,
  });
  const ground = new THREE.Mesh(groundGeom, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // === Materiales de calles ===
  const roadTextureBase = createRoadTexture({ intersection: false });
  const roadTextureRotated = roadTextureBase.clone();
  roadTextureRotated.center.set(0.5, 0.5);
  roadTextureRotated.rotation = Math.PI / 2;

  const intersectionTexture = createRoadTexture({ intersection: true });

  const roadMatVertical = new THREE.MeshStandardMaterial({
    map: roadTextureBase,
    roughness: 0.95,
    metalness: 0.0,
  });

  const roadMatHorizontal = new THREE.MeshStandardMaterial({
    map: roadTextureRotated,
    roughness: 0.95,
    metalness: 0.0,
  });

  const intersectionMat = new THREE.MeshStandardMaterial({
    map: intersectionTexture,
    roughness: 0.95,
    metalness: 0.0,
  });

  // === Banquetas ===
  const sidewalkMat = new THREE.MeshStandardMaterial({
    color: 0xd9d9d9,
    roughness: 0.95,
    metalness: 0.0,
  });
  const sidewalkHeight = 0.08;
  const sidewalkWidthFactor = 0.18;
  const sidewalkWidth = cellSize * sidewalkWidthFactor;

  const sidewalks = [];
  const roads = [];
  const buildings = [];
  const trees = [];
  const crosswalks = [];
  const roadMap = new Map();


  const baseBuildingGeom = new THREE.BoxGeometry(1, 1, 1);

  // offset para peatones: desde el centro de la calle hasta el centro de banqueta
  const sidewalkOffsetForWalker =
    cellSize / 2 + sidewalkWidth / 2 - 0.02;

  // === 1) Calles + roadMap ===
  for (let gx = 0; gx < gridSize; gx++) {
    for (let gz = 0; gz < gridSize; gz++) {
      if (!isRoadCell(gx, gz)) continue;

      const isRoadRow = gx % roadStep === 0;
      const isRoadCol = gz % roadStep === 0;
      const isIntersection = isRoadRow && isRoadCol;

      const worldX = (gx - halfGrid) * cellSize;
      const worldZ = (gz - halfGrid) * cellSize;

      const roadGeom = new THREE.PlaneGeometry(cellSize, cellSize);

      let mat;
      if (isIntersection) {
        mat = intersectionMat;
      } else if (isRoadRow && !isRoadCol) {
        mat = roadMatVertical; // corre a lo largo de Z
      } else if (isRoadCol && !isRoadRow) {
        mat = roadMatHorizontal; // corre a lo largo de X
      } else {
        mat = roadMatVertical;
      }

      const road = new THREE.Mesh(roadGeom, mat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(worldX, 0.02, worldZ);
      road.receiveShadow = true;
      scene.add(road);

      const roadData = {
        mesh: road,
        gridX: gx,
        gridZ: gz,
        isIntersection,
        isRoadRow,
        isRoadCol,
      };
      roads.push(roadData);
      roadMap.set(`${gx},${gz}`, roadData);
    }
  }

  // === 2) Edificios, banquetas y árboles (celdas SIN calle) ===
  for (let gx = 0; gx < gridSize; gx++) {
    for (let gz = 0; gz < gridSize; gz++) {
      if (isRoadCell(gx, gz)) continue;

      const worldX = (gx - halfGrid) * cellSize;
      const worldZ = (gz - halfGrid) * cellSize;

      // 2.1) Banquetas alrededor de esta manzana (SIEMPRE)
      const ySidewalk = sidewalkHeight / 2 + 0.03;

      // norte
      if (isRoadCell(gx, gz - 1)) {
        const geom = new THREE.BoxGeometry(
          cellSize,
          sidewalkHeight,
          sidewalkWidth
        );
        const sw = new THREE.Mesh(geom, sidewalkMat);
        sw.position.set(
          worldX,
          ySidewalk,
          worldZ - cellSize / 2 + sidewalkWidth / 2
        );
        sw.castShadow = true;
        sw.receiveShadow = true;
        scene.add(sw);
        sidewalks.push({ mesh: sw, gridX: gx, gridZ: gz, side: "north" });
      }

      // sur
      if (isRoadCell(gx, gz + 1)) {
        const geom = new THREE.BoxGeometry(
          cellSize,
          sidewalkHeight,
          sidewalkWidth
        );
        const sw = new THREE.Mesh(geom, sidewalkMat);
        sw.position.set(
          worldX,
          ySidewalk,
          worldZ + cellSize / 2 - sidewalkWidth / 2
        );
        sw.castShadow = true;
        sw.receiveShadow = true;
        scene.add(sw);
        sidewalks.push({ mesh: sw, gridX: gx, gridZ: gz, side: "south" });
      }

      // oeste
      if (isRoadCell(gx - 1, gz)) {
        const geom = new THREE.BoxGeometry(
          sidewalkWidth,
          sidewalkHeight,
          cellSize
        );
        const sw = new THREE.Mesh(geom, sidewalkMat);
        sw.position.set(
          worldX - cellSize / 2 + sidewalkWidth / 2,
          ySidewalk,
          worldZ
        );
        sw.castShadow = true;
        sw.receiveShadow = true;
        scene.add(sw);
        sidewalks.push({ mesh: sw, gridX: gx, gridZ: gz, side: "west" });
      }

      // este
      if (isRoadCell(gx + 1, gz)) {
        const geom = new THREE.BoxGeometry(
          sidewalkWidth,
          sidewalkHeight,
          cellSize
        );
        const sw = new THREE.Mesh(geom, sidewalkMat);
        sw.position.set(
          worldX + cellSize / 2 - sidewalkWidth / 2,
          ySidewalk,
          worldZ
        );
        sw.castShadow = true;
        sw.receiveShadow = true;
        scene.add(sw);
        sidewalks.push({ mesh: sw, gridX: gx, gridZ: gz, side: "east" });
      }

      // 2.2) ¿Lote especial (casa / tienda)? ¿o celda reservada por uno?
      const specialLot = SPECIAL_LOTS.find(
        (lot) =>
          lot.buildingCell.gridX === gx &&
          lot.buildingCell.gridZ === gz
      );

      const isReservedBySpecial = SPECIAL_LOTS.some((lot) => {
        if (
          lot.buildingCell.gridX === gx &&
          lot.buildingCell.gridZ === gz
        ) {
          return true;
        }
        if (!lot.extraCells) return false;
        return lot.extraCells.some(
          (c) => c.gridX === gx && c.gridZ === gz
        );
      });

      // 2.3) Si es un lote especial, colocamos el modelo y NO creamos edificio ni árboles
      if (specialLot) {
        let wx = worldX;
        let wz = worldZ;

        // Tienda
        if (specialLot.id === "shop") {
          wx += cellSize * 0.90;
        }

        // Casa
        if (specialLot.id === "home") {
          wz += cellSize * 0.10;
        }

        // Parque: lo centramos mejor en la manzana y lo bajamos un poco
        if (specialLot.id === "park") {
          // Lo movemos medio bloque a la derecha y hacia abajo,
          // partiendo de la celda de buildingCell.
          wx += cellSize * 0.5;
          wz += cellSize * 0.6;
        }

        createSpecialBuilding(specialLot, wx, wz, scene, buildings);
        continue;
      }

      // 2.4) Si es celda reservada por un lote especial (segunda manzana de la tienda, etc),
      //      dejamos solo banqueta/pasto, sin edificio ni árboles.
      if (isReservedBySpecial) {
        continue;
      }

      // 2.5) Edificio procedimental normal
      const distFromCenter = Math.max(
        Math.abs(gx - halfGrid),
        Math.abs(gz - halfGrid)
      );

      let type;
      let minHeight;
      let maxHeight;

      if (distFromCenter <= 2) {
        type = "tower";
        minHeight = 11;
        maxHeight = 22;
      } else {
        type = "house";
        minHeight = 4;
        maxHeight = 9;
      }

      const t = Math.random();
      const baseHeight = THREE.MathUtils.lerp(minHeight, maxHeight, t);

      const facadeTexture = createBuildingTexture(type);

      const facadeMat = new THREE.MeshStandardMaterial({
        map: facadeTexture,
        emissiveMap: facadeTexture,
        color: 0xffffff,
        metalness: type === "tower" ? 0.35 : 0.18,
        roughness: type === "tower" ? 0.45 : 0.65,
        emissive: new THREE.Color(0x111111),
        emissiveIntensity: type === "tower" ? 0.8 : 0.4,
      });

      const roofColor = type === "tower" ? 0x30343d : 0x8b4c39;
      const roofMat = new THREE.MeshStandardMaterial({
        color: roofColor,
        roughness: 0.6,
        metalness: 0.1,
      });

      const bottomMat = new THREE.MeshStandardMaterial({
        color: 0x222222,
        roughness: 0.95,
        metalness: 0.0,
      });

      const materials = [
        facadeMat, // +x
        facadeMat, // -x
        roofMat,   // top
        bottomMat, // bottom
        facadeMat, // +z
        facadeMat, // -z
      ];

      const mesh = new THREE.Mesh(baseBuildingGeom, materials);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      const footprintFactor = type === "tower" ? 0.5 : 0.4;
      const footprint = cellSize * footprintFactor;
      const buildingHalf = footprint / 2;

      mesh.scale.set(footprint, baseHeight, footprint);
      mesh.position.set(worldX, baseHeight / 2, worldZ);

      const capacity =
        type === "tower"
          ? Math.round(baseHeight * 10)
          : Math.round(baseHeight * 4);

      const buildingId = `b-${gx}-${gz}`;
      const baseEmissiveIntensity = type === "tower" ? 0.8 : 0.4;

      mesh.userData = {
        ...mesh.userData,
        buildingId,
        type,
        baseHeight,
        capacity,
        gridX: gx,
        gridZ: gz,
        baseEmissiveIntensity,
      };

      const buildingData = {
        id: buildingId,
        mesh,
        type,
        capacity,
        baseHeight,
        gridX: gx,
        gridZ: gz,
      };

      scene.add(mesh);
      buildings.push(buildingData);

      // 2.6) Árboles SOLO en manzanas normales (no especiales / reservadas)
      const cellHalf = cellSize / 2;
      const walkwayInner = cellHalf - sidewalkWidth;
      const marginWalk = 0.25;
      const marginBuild = 0.25;

      const maxRadius = walkwayInner - marginWalk;
      const minRadius = buildingHalf + marginBuild;

      if (maxRadius > minRadius) {
        const cornerRadius = (minRadius + maxRadius) / 2;
        const corners = [
          [cornerRadius, cornerRadius],
          [cornerRadius, -cornerRadius],
          [-cornerRadius, cornerRadius],
          [-cornerRadius, -cornerRadius],
        ];

        const maxTreesForType = type === "house" ? 3 : 2;
        let treeCount =
          Math.random() < 0.7
            ? Math.floor(Math.random() * maxTreesForType) + 1
            : 0;
        treeCount = Math.min(treeCount, corners.length);

        for (let i = corners.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [corners[i], corners[j]] = [corners[j], corners[i]];
        }

        for (let i = 0; i < treeCount; i++) {
          const [ox, oz] = corners[i];
          const tree = createTree();
          tree.position.set(worldX + ox, 0, worldZ + oz);
          scene.add(tree);
          trees.push({
            group: tree,
            gridX: gx,
            gridZ: gz,
          });
        }
      }
    }
  }


  // === 3) Cruces peatonales (fuera del cuadrado de la intersección) ===
  const crosswalkWidthWorld = cellSize * 0.8;   // ancho de banqueta a banqueta
  const crosswalkDepthWorld = cellSize * 0.28;  // cuánto invade la calle

  for (const road of roads) {
    if (!road.isIntersection) continue;

    const gx = road.gridX;
    const gz = road.gridZ;
    const centerX = (gx - halfGrid) * cellSize;
    const centerZ = (gz - halfGrid) * cellSize;

    // Norte (sobre el tramo de calle que llega desde arriba)
    if (gz > 0) {
      const cwN = createCrosswalk(
        crosswalkWidthWorld,
        crosswalkDepthWorld,
        7
      );
      cwN.position.set(
        centerX,
        0.03,
        centerZ - cellSize / 2 - crosswalkDepthWorld / 2
      );
      scene.add(cwN);
      crosswalks.push(cwN);
    }

    // Sur
    if (gz < gridSize - 1) {
      const cwS = createCrosswalk(
        crosswalkWidthWorld,
        crosswalkDepthWorld,
        7
      );
      cwS.position.set(
        centerX,
        0.03,
        centerZ + cellSize / 2 + crosswalkDepthWorld / 2
      );
      scene.add(cwS);
      crosswalks.push(cwS);
    }

    // Este (rotado 90°)
    if (gx < gridSize - 1) {
      const cwE = createCrosswalk(
        crosswalkWidthWorld,
        crosswalkDepthWorld,
        7
      );
      cwE.rotation.y = Math.PI / 2;
      cwE.position.set(
        centerX + cellSize / 2 + crosswalkDepthWorld / 2,
        0.03,
        centerZ
      );
      scene.add(cwE);
      crosswalks.push(cwE);
    }

    // Oeste
    if (gx > 0) {
      const cwW = createCrosswalk(
        crosswalkWidthWorld,
        crosswalkDepthWorld,
        7
      );
      cwW.rotation.y = Math.PI / 2;
      cwW.position.set(
        centerX - cellSize / 2 - crosswalkDepthWorld / 2,
        0.03,
        centerZ
      );
      scene.add(cwW);
      crosswalks.push(cwW);
    }
  }

  // === 4) Acera perimetral (en vez de barda) ===
  const halfGround = groundSize / 2;
  // usamos el mismo grosor que las banquetas normales
  const perimeterWidth = sidewalkWidth;
  const yPerimeter = sidewalkHeight / 2 + 0.03;

  const perimeterSidewalks = [];

  // lados oeste / este
  const sideGeomZ = new THREE.BoxGeometry(
    perimeterWidth,
    sidewalkHeight,
    groundSize
  );
  const westSide = new THREE.Mesh(sideGeomZ, sidewalkMat);
  westSide.position.set(
    -halfGround + perimeterWidth / 2,
    yPerimeter,
    0
  );
  westSide.castShadow = true;
  westSide.receiveShadow = true;
  scene.add(westSide);
  perimeterSidewalks.push(westSide);

  const eastSide = new THREE.Mesh(sideGeomZ, sidewalkMat);
  eastSide.position.set(
    halfGround - perimeterWidth / 2,
    yPerimeter,
    0
  );
  eastSide.castShadow = true;
  eastSide.receiveShadow = true;
  scene.add(eastSide);
  perimeterSidewalks.push(eastSide);

  // lados norte / sur
  const sideGeomX = new THREE.BoxGeometry(
    groundSize,
    sidewalkHeight,
    perimeterWidth
  );
  const northSide = new THREE.Mesh(sideGeomX, sidewalkMat);
  northSide.position.set(
    0,
    yPerimeter,
    -halfGround + perimeterWidth / 2
  );
  northSide.castShadow = true;
  northSide.receiveShadow = true;
  scene.add(northSide);
  perimeterSidewalks.push(northSide);

  const southSide = new THREE.Mesh(sideGeomX, sidewalkMat);
  southSide.position.set(
    0,
    yPerimeter,
    halfGround - perimeterWidth / 2
  );
  southSide.castShadow = true;
  southSide.receiveShadow = true;
  scene.add(southSide);
  perimeterSidewalks.push(southSide);

  const fogColor = new THREE.Color(0x6ca9ff).multiplyScalar(0.7);
  scene.fog = new THREE.FogExp2(fogColor, 0.007);

  // === Puntos de interés (POIs) para el agente ===
  const pointsOfInterest = {};

  for (const lot of SPECIAL_LOTS) {
    pointsOfInterest[lot.id] = {
      id: lot.id,
      label: lot.label,
      type: lot.id, // "home" | "shop" ...
      buildingCell: { ...lot.buildingCell },
      entranceRoad: { ...lot.entranceRoad },
    };
  }

  const city = {
    ground,
    roads,
    sidewalks,
    perimeterSidewalks,
    crosswalks,
    buildings,
    trees,
    roadMap,
    pointsOfInterest,
    gridSize,
    cellSize,
    sidewalkWidth,
    sidewalkOffset: sidewalkOffsetForWalker,
  };

  return city;
}

// Estado visual
export function applyCityState(city, state, scene) {
  const { buildings } = city;
  const {
    buildingHeightMultiplier = 1,
    skyColor = "#6ca9ff",
    cityGlowIntensity = 0.7,
  } = state;

  buildings.forEach((b) => {
    const mesh = b.mesh;
    const baseHeight = b.baseHeight;
    const newHeight = baseHeight * buildingHeightMultiplier;

    mesh.scale.y = newHeight;
    mesh.position.y = newHeight / 2;

    const baseEmissive =
      mesh.userData.baseEmissiveIntensity ?? 0.5;

    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((mat) => {
        if (mat && mat.isMeshStandardMaterial) {
          mat.emissiveIntensity = baseEmissive * cityGlowIntensity;
        }
      });
    } else if (mesh.material && mesh.material.isMeshStandardMaterial) {
      mesh.material.emissiveIntensity =
        baseEmissive * cityGlowIntensity;
    }
  });

  if (scene) {
    const color = new THREE.Color(skyColor);
    scene.background = color;
    if (scene.fog) {
      scene.fog.color.copy(color.clone().multiplyScalar(0.7));
    }
  }
}

// Helpers para agentes
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
  const gridX = Math.round(x / city.cellSize + half);
  const gridZ = Math.round(z / city.cellSize + half);
  return { gridX, gridZ };
}