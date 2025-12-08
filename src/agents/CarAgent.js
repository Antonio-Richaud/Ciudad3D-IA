// src/agents/CarAgent.js
import * as THREE from "three";
import { gridToWorld } from "../city/cityScene.js";
import { getNeighbors } from "./pathPlanner.js";

/**
 * Crea un modelo 3D sencillo de carro.
 */
function createCarMesh() {
  const group = new THREE.Group();

  // Cuerpo principal
  const bodyGeom = new THREE.BoxGeometry(1.0, 0.35, 1.8);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xe74c3c,
    roughness: 0.4,
    metalness: 0.25,
  });
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  body.position.y = 0.35;
  group.add(body);

  // Cabina
  const cabinGeom = new THREE.BoxGeometry(0.8, 0.35, 0.9);
  const cabinMat = new THREE.MeshStandardMaterial({
    color: 0xf5f5f5,
    roughness: 0.2,
    metalness: 0.1,
    transparent: true,
    opacity: 0.95,
  });
  const cabin = new THREE.Mesh(cabinGeom, cabinMat);
  cabin.castShadow = true;
  cabin.receiveShadow = true;
  cabin.position.set(0, 0.55, -0.1);
  group.add(cabin);

  // Llantas
  const wheelGeom = new THREE.CylinderGeometry(0.22, 0.22, 0.18, 12);
  const wheelMat = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.7,
    metalness: 0.1,
  });

  function addWheel(x, z) {
    const w = new THREE.Mesh(wheelGeom, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.castShadow = true;
    w.receiveShadow = true;
    w.position.set(x, 0.22, z);
    group.add(w);
  }

  const dx = 0.46;
  const dz = 0.7;
  addWheel(-dx, dz);
  addWheel(dx, dz);
  addWheel(-dx, -dz);
  addWheel(dx, -dz);

  return group;
}

/**
 * CarAgent:
 * - Se mueve por las calles (centro de la vía).
 * - Puede usar un brain (CarShortestPathBrain, QLearningBrain, etc.)
 *   o moverse de forma aleatoria si no hay brain.
 */
export class CarAgent {
  /**
   * @param {object} city
   * @param {THREE.Scene} scene
   * @param {object|null} brain
   * @param {object} options  { startRoad?: {gridX,gridZ}, speed?: number }
   */
  constructor(city, scene, brain = null, options = {}) {
    this.city = city;
    this.scene = scene;
    this.brain = brain || null;

    this.currentRoadNode =
      options.startRoad ||
      this._findDefaultStartRoadNode() || { gridX: 0, gridZ: 0 };

    this.targetRoadNode = null;

    this.speed = options.speed || 8;
    this.segmentDuration = 1.0;
    this.segmentElapsed = 0;
    this.moving = false;

    this.segmentStartPos = new THREE.Vector3();
    this.segmentEndPos = new THREE.Vector3();

    this.baseY = 0.25;

    this.object3D = createCarMesh();
    this.scene.add(this.object3D);

    const initialWorld = gridToWorld(
      this.city,
      this.currentRoadNode.gridX,
      this.currentRoadNode.gridZ,
      this.baseY
    );
    this.object3D.position.set(
      initialWorld.x,
      this.baseY,
      initialWorld.z
    );
    this.object3D.rotation.y = 0;
  }

  _findDefaultStartRoadNode() {
    const mid = Math.floor(this.city.gridSize / 2);
    return { gridX: mid, gridZ: mid };
  }

  getCurrentRoadNode() {
    return {
      gridX: this.currentRoadNode.gridX,
      gridZ: this.currentRoadNode.gridZ,
    };
  }

  getWorldPosition(target = new THREE.Vector3()) {
    return target.copy(this.object3D.position);
  }

  isAtRoadNode(node) {
    if (!node) return false;
    return (
      this.currentRoadNode.gridX === node.gridX &&
      this.currentRoadNode.gridZ === node.gridZ
    );
  }

  isAtPOI(poi) {
    if (!poi?.entranceRoad) return false;
    return this.isAtRoadNode(poi.entranceRoad);
  }

  update(dt) {
    if (!this.moving) {
      this._startNextSegment();
    }

    if (!this.moving) return;

    this.segmentElapsed += dt;
    let t = this.segmentElapsed / this.segmentDuration;
    if (t >= 1) t = 1;

    this.object3D.position.lerpVectors(
      this.segmentStartPos,
      this.segmentEndPos,
      t
    );

    const bob = Math.sin(t * Math.PI * 2) * 0.015;
    this.object3D.position.y = this.baseY + bob;

    if (t >= 1) {
      const prevNode = { ...this.currentRoadNode };
      this.currentRoadNode = { ...this.targetRoadNode };

      this.moving = false;
      this.segmentElapsed = 0;
      this.targetRoadNode = null;

      this.object3D.position.copy(this.segmentEndPos);

      if (
        this.brain &&
        typeof this.brain.onNodeArrived === "function"
      ) {
        this.brain.onNodeArrived(prevNode, this.currentRoadNode, {
          goalId: null,
          isGoal: false,
          reward: 0,
        });
      }
    }
  }

  _startNextSegment() {
    const currentNode = this.getCurrentRoadNode();

    let nextNode = null;

    // Si hay brain, le pedimos el siguiente nodo
    if (this.brain && typeof this.brain.chooseNextRoad === "function") {
      nextNode = this.brain.chooseNextRoad(currentNode);
    }

    // Si el brain no da nada, caemos a movimiento aleatorio
    if (!nextNode) {
      const neighbors = getNeighbors(this.city, currentNode);
      if (!neighbors || neighbors.length === 0) {
        this.moving = false;
        return;
      }
      const pick =
        neighbors[Math.floor(Math.random() * neighbors.length)];
      nextNode = { gridX: pick.gridX, gridZ: pick.gridZ };
    }

    const dx = nextNode.gridX - currentNode.gridX;
    const dz = nextNode.gridZ - currentNode.gridZ;
    const manhattan = Math.abs(dx) + Math.abs(dz);
    if (manhattan !== 1) {
      console.warn(
        "[CarAgent] nextNode no es vecino directo:",
        currentNode,
        nextNode
      );
      this.moving = false;
      return;
    }

    const startPos = this.getWorldPosition(new THREE.Vector3());
    const endPos = gridToWorld(
      this.city,
      nextNode.gridX,
      nextNode.gridZ,
      this.baseY
    );

    this.segmentStartPos.copy(startPos);
    this.segmentEndPos.copy(endPos);

    const dirVec = new THREE.Vector3(
      endPos.x - startPos.x,
      0,
      endPos.z - startPos.z
    );
    dirVec.normalize();
    const angle = Math.atan2(dirVec.x, dirVec.z);
    this.object3D.rotation.y = angle;

    const distance = startPos.distanceTo(endPos);
    this.segmentDuration = distance / this.speed;
    this.segmentElapsed = 0;
    this.moving = true;

    this.targetRoadNode = { ...nextNode };
  }
}