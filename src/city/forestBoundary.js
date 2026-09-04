import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import {
  createForestRingLayout,
  getForestModelFit,
} from "./forestBoundaryLayout.js";

const FOREST_MODEL_URL = "/models/bosque-limite.glb";
const DEFAULT_CELL_SIZE = 7;
const DEFAULT_HALF_GROUND = (15 * DEFAULT_CELL_SIZE) / 2;
const OUTER_TERRAIN_SIZE = 640;

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

function prepareForestTile(prototype, cellSize) {
  const model = prototype.clone(true);
  model.position.set(0, 0, 0);
  model.rotation.set(0, 0, 0);
  model.scale.set(1, 1, 1);
  model.updateMatrixWorld(true);

  const sourceBox = new THREE.Box3().setFromObject(model);
  const sourceSize = sourceBox.getSize(new THREE.Vector3());
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
  });

  const normalizedBox = new THREE.Box3().setFromObject(model);
  const normalizedSize = normalizedBox.getSize(new THREE.Vector3());
  const tile = new THREE.Group();
  tile.name = "forest-boundary-tile";
  tile.add(model);

  return {
    tile,
    sourceSize,
    normalizedSize,
  };
}

function createOuterTerrain() {
  const terrain = new THREE.Mesh(
    new THREE.PlaneGeometry(OUTER_TERRAIN_SIZE, OUTER_TERRAIN_SIZE),
    new THREE.MeshStandardMaterial({
      color: 0x365d39,
      roughness: 1,
      metalness: 0,
    })
  );
  terrain.name = "forest-outer-terrain";
  terrain.rotation.x = -Math.PI / 2;
  terrain.position.y = -0.065;
  terrain.receiveShadow = true;
  return terrain;
}

function setForestSmokeState(state, tileCount = 0) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.forestReady = state;
  document.documentElement.dataset.forestTiles = String(tileCount);
}

export function createForestBoundary(
  scene,
  {
    cellSize = DEFAULT_CELL_SIZE,
    halfGround = DEFAULT_HALF_GROUND,
  } = {}
) {
  const root = new THREE.Group();
  root.name = "forest-boundary";
  root.userData.ready = false;
  root.add(createOuterTerrain());
  scene.add(root);
  setForestSmokeState("loading");

  const readyPromise = loadForestPrototype()
    .then((prototype) => {
      const { tile, sourceSize, normalizedSize } = prepareForestTile(
        prototype,
        cellSize
      );
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

      root.userData.ready = true;
      root.userData.tileCount = layout.placements.length;
      root.userData.layers = layers;
      root.userData.sourceSize = sourceSize.toArray();
      root.userData.tileSize = normalizedSize.toArray();
      root.userData.outerRadius = layout.outerRadius;
      setForestSmokeState("true", layout.placements.length);

      console.info("Bosque límite listo", {
        sourceSize: root.userData.sourceSize,
        tileSize: root.userData.tileSize,
        layers,
        tiles: layout.placements.length,
        outerRadius: layout.outerRadius,
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
