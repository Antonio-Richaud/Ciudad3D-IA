import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { CITY_PALETTE } from "./cityVisualSystem.js";
import {
  createForestRingLayout,
  getForestModelFit,
} from "./forestBoundaryLayout.js";

const FOREST_MODEL_URL = "/models/bosque-limite.glb";
const DEFAULT_CELL_SIZE = 7;
const DEFAULT_HALF_GROUND = (15 * DEFAULT_CELL_SIZE) / 2;
const OUTER_TERRAIN_SIZE = 640;
const TEXTURE_SLOTS = [
  "map",
  "normalMap",
  "roughnessMap",
  "metalnessMap",
  "aoMap",
  "emissiveMap",
];

const loader = new GLTFLoader();
let forestPrototypePromise = null;

function loadForestPrototype() {
  if (!forestPrototypePromise) {
    forestPrototypePromise = new Promise((resolve, reject) => {
      loader.load(
        FOREST_MODEL_URL,
        (gltf) => resolve(gltf.scene),
        undefined,
        reject
      );
    });
  }

  return forestPrototypePromise;
}

function getMaterials(object) {
  if (!object?.material) return [];
  return Array.isArray(object.material) ? object.material : [object.material];
}

function sampleTextureColor(texture) {
  const image = texture?.source?.data ?? texture?.image;
  if (!image || typeof document === "undefined") return null;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = 20;
    canvas.height = 20;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;

    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] < 32) continue;
      r += pixels[i];
      g += pixels[i + 1];
      b += pixels[i + 2];
      count += 1;
    }

    if (!count) return null;

    const color = new THREE.Color();
    color.setRGB(
      r / count / 255,
      g / count / 255,
      b / count / 255,
      THREE.SRGBColorSpace
    );
    return color;
  } catch {
    return null;
  }
}

function getMaterialVisualColor(material) {
  if (!material?.color?.isColor) return null;

  const color = material.color.clone();
  const textureColor = sampleTextureColor(material.map);
  if (textureColor) color.multiply(textureColor);
  return color;
}

function pickGreenerMaterial(materials) {
  let best = null;

  for (const material of materials) {
    const color = getMaterialVisualColor(material);
    if (!color) continue;

    const greenScore = color.g - (color.r + color.b) * 0.5;
    if (!best || greenScore > best.greenScore) {
      best = { material, color, greenScore };
    }
  }

  return best;
}

function findForestGroundSurface(model, sourceBox) {
  const sourceSize = sourceBox.getSize(new THREE.Vector3());
  const sourceArea = Math.max(sourceSize.x * sourceSize.z, 1e-6);
  let best = null;

  model.traverse((object) => {
    if (!object.isMesh) return;

    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const horizontal = Math.max(size.x, size.z, 1e-6);
    const area = size.x * size.z;
    const areaRatio = area / sourceArea;
    const flatness = size.y / horizontal;
    const floorDistance = Math.abs(box.min.y - sourceBox.min.y);
    const nearFloor = floorDistance <= Math.max(sourceSize.y * 0.08, 0.08);
    const colorPick = pickGreenerMaterial(getMaterials(object));
    if (!colorPick) return;

    const label = `${object.name ?? ""} ${colorPick.material?.name ?? ""}`.toLowerCase();
    const semanticBoost = /(grass|ground|terrain|suelo|pasto|cesped|césped)/.test(label)
      ? 6
      : 1;

    if (flatness > 0.22 || areaRatio < 0.12) return;

    const score =
      areaRatio *
      semanticBoost *
      (nearFloor ? 3 : 1) *
      (1 + Math.max(colorPick.greenScore, 0)) /
      (1 + flatness * 20);

    if (!best || score > best.score) {
      best = {
        object,
        material: colorPick.material,
        color: colorPick.color,
        score,
        areaRatio,
        flatness,
        nearFloor,
      };
    }
  });

  if (!best) return null;

  return {
    ...best,
    confident: best.areaRatio >= 0.28 && best.flatness <= 0.12 && best.nearFloor,
  };
}

function polishImportedMaterial(material, maxAnisotropy) {
  if (!material) return;

  if ("flatShading" in material) material.flatShading = false;
  material.dithering = true;

  if (Number.isFinite(material.roughness)) {
    material.roughness = Math.max(material.roughness, 0.68);
  }

  for (const slot of TEXTURE_SLOTS) {
    const texture = material[slot];
    if (!texture?.isTexture) continue;
    texture.anisotropy = Math.max(1, Math.min(maxAnisotropy, 8));
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.needsUpdate = true;
  }

  material.needsUpdate = true;
}

// El GLB se mide con bounds reales en runtime; no dependemos de su pivote,
// orientación ni escala de exportación para colocarlo alrededor de la ciudad.
function prepareForestTile(prototype, cellSize, maxAnisotropy) {
  const model = prototype.clone(true);
  model.position.set(0, 0, 0);
  model.rotation.set(0, 0, 0);
  model.scale.set(1, 1, 1);
  model.updateMatrixWorld(true);

  const sourceBox = new THREE.Box3().setFromObject(model);
  const sourceSize = sourceBox.getSize(new THREE.Vector3());
  const groundSurface = findForestGroundSurface(model, sourceBox);
  const fit = getForestModelFit(sourceSize, cellSize);

  model.rotation.y = fit.rotationY;
  model.scale.setScalar(fit.scale);
  model.updateMatrixWorld(true);

  const fittedBox = new THREE.Box3().setFromObject(model);
  const fittedCenter = fittedBox.getCenter(new THREE.Vector3());

  model.position.x -= fittedCenter.x;
  model.position.z -= fittedCenter.z;
  model.position.y -= fittedBox.min.y;
  model.updateMatrixWorld(true);

  model.traverse((object) => {
    if (!object.isMesh) return;
    object.receiveShadow = true;
    object.frustumCulled = true;

    if (!object.geometry?.attributes?.normal) {
      object.geometry?.computeVertexNormals?.();
    }

    for (const material of getMaterials(object)) {
      polishImportedMaterial(material, maxAnisotropy);
    }
  });

  const normalizedBox = new THREE.Box3().setFromObject(model);
  const normalizedSize = normalizedBox.getSize(new THREE.Vector3());

  // Si el GLB trae una placa plana de césped claramente separada, la ocultamos.
  // Los árboles/rocas quedan sobre un único terreno continuo y desaparecen las
  // costuras y el z-fighting entre copias del bloque.
  if (groundSurface?.confident) {
    groundSurface.object.visible = false;
  }

  const tile = new THREE.Group();
  tile.name = "forest-boundary-tile";
  tile.add(model);

  return {
    tile,
    sourceSize,
    normalizedSize,
    grassColor: groundSurface?.color ?? null,
    groundHidden: Boolean(groundSurface?.confident),
    groundMeshName: groundSurface?.object?.name || null,
    groundMaterialName: groundSurface?.material?.name || null,
  };
}

function createOuterTerrain() {
  const terrain = new THREE.Mesh(
    new THREE.PlaneGeometry(OUTER_TERRAIN_SIZE, OUTER_TERRAIN_SIZE),
    new THREE.MeshStandardMaterial({
      color: CITY_PALETTE.ground,
      roughness: 1,
      metalness: 0,
    })
  );
  terrain.name = "forest-outer-terrain";
  terrain.rotation.x = -Math.PI / 2;
  terrain.position.y = -0.025;
  terrain.receiveShadow = true;
  return terrain;
}

function findCityGround(scene, halfGround) {
  const expectedSize = halfGround * 2;
  let best = null;

  scene.traverse((object) => {
    if (!object.isMesh || object.name === "forest-outer-terrain") return;
    if (object.geometry?.type !== "PlaneGeometry") return;

    const width = Number(object.geometry.parameters?.width);
    const height = Number(object.geometry.parameters?.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;

    const error =
      Math.abs(width - expectedSize) / expectedSize +
      Math.abs(height - expectedSize) / expectedSize;

    if (!best || error < best.error) best = { object, error };
  });

  return best?.error < 0.05 ? best.object : null;
}

function applySharedGrassColor(scene, outerTerrain, grassColor, halfGround) {
  if (!grassColor?.isColor) return;

  outerTerrain.material.color.copy(grassColor);
  outerTerrain.material.needsUpdate = true;

  const cityGround = findCityGround(scene, halfGround);
  if (cityGround?.material?.color?.isColor) {
    cityGround.material.color.copy(grassColor);
    cityGround.material.needsUpdate = true;
  }
}

function colorToCssHex(color) {
  if (!color?.isColor) return null;
  return `#${color.getHexString(THREE.SRGBColorSpace)}`;
}

function setForestSmokeState(state, metadata = {}) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.forestReady = state;
  document.documentElement.dataset.forestTiles = String(metadata.tileCount ?? 0);
  document.documentElement.dataset.forestGrassColor = metadata.grassColor ?? "";
  document.documentElement.dataset.forestGroundHidden = String(
    metadata.groundHidden ?? false
  );
  document.documentElement.dataset.forestGroundMesh = metadata.groundMeshName ?? "";
}

export function createForestBoundary(
  scene,
  {
    cellSize = DEFAULT_CELL_SIZE,
    halfGround = DEFAULT_HALF_GROUND,
    renderer = null,
  } = {}
) {
  const root = new THREE.Group();
  root.name = "forest-boundary";
  root.userData.ready = false;

  const outerTerrain = createOuterTerrain();
  root.add(outerTerrain);
  scene.add(root);
  setForestSmokeState("loading");

  const maxAnisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;

  const readyPromise = loadForestPrototype()
    .then((prototype) => {
      const {
        tile,
        sourceSize,
        normalizedSize,
        grassColor,
        groundHidden,
        groundMeshName,
        groundMaterialName,
      } = prepareForestTile(prototype, cellSize, maxAnisotropy);

      applySharedGrassColor(scene, outerTerrain, grassColor, halfGround);

      const layers = normalizedSize.z >= cellSize * 2.8 ? 3 : 5;
      const layout = createForestRingLayout({
        halfGround,
        cellSize,
        tileWidth: normalizedSize.x,
        tileDepth: normalizedSize.z,
        layers,
      });

      for (const placement of layout.placements) {
        const instance = tile.clone(true);
        instance.name = `forest-${placement.side}-${placement.layer}-${placement.index}`;
        instance.position.set(placement.x, 0, placement.z);
        instance.rotation.y = placement.rotationY;
        instance.scale.y = placement.heightScale;
        instance.userData.forestSide = placement.side;
        instance.userData.forestLayer = placement.layer;

        instance.traverse((object) => {
          if (!object.isMesh) return;
          object.castShadow = placement.castShadow;
          object.receiveShadow = true;
        });

        root.add(instance);
      }

      const grassHex = colorToCssHex(grassColor);
      root.userData.ready = true;
      root.userData.tileCount = layout.placements.length;
      root.userData.layers = layers;
      root.userData.sourceSize = sourceSize.toArray();
      root.userData.tileSize = normalizedSize.toArray();
      root.userData.outerRadius = layout.outerRadius;
      root.userData.grassColor = grassHex;
      root.userData.groundHidden = groundHidden;
      root.userData.groundMeshName = groundMeshName;
      root.userData.groundMaterialName = groundMaterialName;

      setForestSmokeState("true", {
        tileCount: layout.placements.length,
        grassColor: grassHex,
        groundHidden,
        groundMeshName,
      });

      console.info("Bosque límite listo", {
        sourceSize: root.userData.sourceSize,
        tileSize: root.userData.tileSize,
        layers,
        tiles: layout.placements.length,
        outerRadius: layout.outerRadius,
        grassColor: grassHex,
        groundHidden,
        groundMeshName,
        groundMaterialName,
      });

      return root;
    })
    .catch((error) => {
      root.userData.error = error;
      setForestSmokeState("error");
      console.error("Error cargando bosque-limite.glb:", error);
      throw error;
    });

  root.userData.readyPromise = readyPromise;
  return root;
}
