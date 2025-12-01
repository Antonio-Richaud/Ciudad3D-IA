// src/city/cityScene.js
import * as THREE from "three";

/**
 * Crea una textura de pavimento con línea blanca central
 */
function createRoadTexture({ intersection = false } = {}) {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  // Fondo asfalto (gris un poco más clarito)
  ctx.fillStyle = "#3f4349";
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 6;
  ctx.setLineDash([]);

  if (intersection) {
    // Cruz blanca completa
    ctx.beginPath();
    ctx.moveTo(size / 2, 0);
    ctx.lineTo(size / 2, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, size / 2);
    ctx.lineTo(size, size / 2);
    ctx.stroke();
  } else {
    // Línea discontinua en el centro
    ctx.setLineDash([14, 10]);
    ctx.beginPath();
    ctx.moveTo(size / 2, 0);
    ctx.lineTo(size / 2, size);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Crea textura de edificio con "ventanas"
 */
function createBuildingTexture(type) {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  // Color base según tipo
  if (type === "tower") {
    ctx.fillStyle = "#1f2633"; // tipo vidrio oscuro
  } else {
    ctx.fillStyle = "#5c4b3c"; // tipo fachada café/clara
  }
  ctx.fillRect(0, 0, size, size);

  // Grid de ventanas
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

      if (isLit) {
        ctx.fillStyle = "#ffd86a"; // luz cálida
      } else {
        ctx.fillStyle = "#181a1f"; // ventana apagada
      }
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

export function createCity(scene) {
  // Parámetros de la cuadrícula
  const gridSize = 15; // 15x15 celdas
  const cellSize = 6;
  const roadStep = 3; // cada 3 celdas hay calle
  const halfGrid = (gridSize - 1) / 2;

  // === Piso verde (pasto bonito) ===
  const groundSize = gridSize * cellSize;
  const groundGeom = new THREE.PlaneGeometry(groundSize, groundSize);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x7fbf7a, // verde más clarito, tipo parque
  });
  const ground = new THREE.Mesh(groundGeom, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Texturas de calles
  const roadTexture = createRoadTexture({ intersection: false });
  const intersectionTexture = createRoadTexture({ intersection: true });

  const roadMat = new THREE.MeshStandardMaterial({
    map: roadTexture,
    roughness: 0.95,
    metalness: 0.0,
  });

  const intersectionMat = new THREE.MeshStandardMaterial({
    map: intersectionTexture,
    roughness: 0.95,
    metalness: 0.0,
  });

  const roads = [];
  const buildings = [];

  const baseBuildingGeom = new THREE.BoxGeometry(1, 1, 1);

  for (let gx = 0; gx < gridSize; gx++) {
    for (let gz = 0; gz < gridSize; gz++) {
      const isRoadRow = gx % roadStep === 0;
      const isRoadCol = gz % roadStep === 0;
      const isRoad = isRoadRow || isRoadCol;
      const isIntersection = isRoadRow && isRoadCol;

      const worldX = (gx - halfGrid) * cellSize;
      const worldZ = (gz - halfGrid) * cellSize;

      if (isRoad) {
        // === Calles ===
        const roadGeom = new THREE.PlaneGeometry(cellSize, cellSize);
        const mat = isIntersection ? intersectionMat : roadMat;
        const road = new THREE.Mesh(roadGeom, mat);
        road.rotation.x = -Math.PI / 2;
        road.position.set(worldX, 0.02, worldZ);
        road.receiveShadow = true;

        scene.add(road);
        roads.push({
          mesh: road,
          gridX: gx,
          gridZ: gz,
          isIntersection,
        });
        continue;
      }

      // === Celdas con edificios/casas ===

      // Distancia del centro para decidir tipo de edificio
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

      const mat = new THREE.MeshStandardMaterial({
        map: facadeTexture,
        emissiveMap: facadeTexture,
        color: 0xffffff,
        metalness: type === "tower" ? 0.35 : 0.18,
        roughness: type === "tower" ? 0.45 : 0.65,
        emissive: new THREE.Color(0x111111),
        emissiveIntensity: type === "tower" ? 0.8 : 0.4,
      });

      const mesh = new THREE.Mesh(baseBuildingGeom, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      const footprint =
        type === "tower" ? cellSize * 0.7 : cellSize * 0.55;

      mesh.scale.set(footprint, baseHeight, footprint);
      mesh.position.set(worldX, baseHeight / 2, worldZ);

      // Capacidad poblacional
      const capacity =
        type === "tower"
          ? Math.round(baseHeight * 10)
          : Math.round(baseHeight * 4);

      const buildingId = `b-${gx}-${gz}`;

      mesh.userData = {
        ...mesh.userData,
        buildingId,
        type,
        baseHeight,
        capacity,
        gridX: gx,
        gridZ: gz,
        baseEmissiveIntensity: mat.emissiveIntensity,
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
    }
  }

  // Niebla ligera, ajustada al cielo azul
  const fogColor = new THREE.Color(0x6ca9ff).multiplyScalar(0.7);
  scene.fog = new THREE.FogExp2(fogColor, 0.007);

  const city = {
    ground,
    roads,
    buildings,
    gridSize,
    cellSize,
  };

  return city;
}

// Aplica un estado visual genérico (por si luego quieres volver a usar datos)
export function applyCityState(city, state, scene) {
  const { buildings } = city;
  const {
    buildingHeightMultiplier = 1,
    skyColor = "#6ca9ff",
    cityGlowIntensity = 0.6,
  } = state;

  buildings.forEach((b) => {
    const mesh = b.mesh;
    const baseHeight = b.baseHeight;
    const newHeight = baseHeight * buildingHeightMultiplier;

    mesh.scale.y = newHeight;
    mesh.position.y = newHeight / 2;

    const mat = mesh.material;
    if (mat && mat.isMeshStandardMaterial) {
      const baseEmissive =
        mesh.userData.baseEmissiveIntensity ?? 0.5;
      mat.emissiveIntensity = baseEmissive * cityGlowIntensity;
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

// Helpers para agentes: convertir entre grid y mundo
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