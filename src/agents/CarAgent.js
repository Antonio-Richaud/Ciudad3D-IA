// src/agents/CarAgent.js
import * as THREE from "three";
import { gridToWorld } from "../city/cityScene.js";
import { getNeighbors } from "./pathPlanner.js";

function createCarMesh() {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.35, 1.8),
    new THREE.MeshStandardMaterial({
      color: 0xe74c3c,
      roughness: 0.4,
      metalness: 0.25,
    })
  );
  body.castShadow = true;
  body.receiveShadow = true;
  body.position.y = 0.35;
  group.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.35, 0.9),
    new THREE.MeshStandardMaterial({
      color: 0xf5f5f5,
      roughness: 0.2,
      metalness: 0.1,
      transparent: true,
      opacity: 0.95,
    })
  );
  cabin.castShadow = true;
  cabin.receiveShadow = true;
  cabin.position.set(0, 0.55, -0.1);
  group.add(cabin);

  const wheelGeometry = new THREE.CylinderGeometry(0.22, 0.22, 0.18, 12);
  const wheelMaterial = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.7,
    metalness: 0.1,
  });

  const wheelPositions = [
    [-0.46, 0.7],
    [0.46, 0.7],
    [-0.46, -0.7],
    [0.46, -0.7],
  ];

  for (const [x, z] of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheel.rotation.z = Math.PI / 2;
    wheel.castShadow = true;
    wheel.receiveShadow = true;
    wheel.position.set(x, 0.22, z);
    group.add(wheel);
  }

  return group;
}

export class CarAgent {
  constructor(city, scene, brain = null, options = {}) {
    this.city = city;
    this.scene = scene;
    this.brain = brain;

    this.currentRoadNode =
      options.startRoad || this._findDefaultStartRoadNode();
    this.targetRoadNode = null;

    this.speed = options.speed ?? 8;
    this.segmentDuration = 1;
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

    this.object3D.position.set(initialWorld.x, this.baseY, initialWorld.z);
  }

  _findDefaultStartRoadNode() {
    const homeEntrance = this.city.pointsOfInterest?.home?.entranceRoad;
    if (
      homeEntrance &&
      this.city.roadMap.has(`${homeEntrance.gridX},${homeEntrance.gridZ}`)
    ) {
      return { ...homeEntrance };
    }

    const center = (this.city.gridSize - 1) / 2;
    let bestNode = null;
    let bestDistance = Infinity;

    for (const road of this.city.roadMap.values()) {
      const distance =
        Math.abs(road.gridX - center) + Math.abs(road.gridZ - center);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestNode = { gridX: road.gridX, gridZ: road.gridZ };
      }
    }

    if (!bestNode) {
      throw new Error("[CarAgent] La ciudad no contiene nodos de calle.");
    }

    return bestNode;
  }

  getCurrentRoadNode() {
    return { ...this.currentRoadNode };
  }

  getWorldPosition(target = new THREE.Vector3()) {
    return target.copy(this.object3D.position);
  }

  isAtRoadNode(node) {
    return Boolean(
      node &&
        this.currentRoadNode.gridX === node.gridX &&
        this.currentRoadNode.gridZ === node.gridZ
    );
  }

  isAtPOI(poi) {
    return Boolean(poi?.entranceRoad && this.isAtRoadNode(poi.entranceRoad));
  }

  update(dt) {
    if (!this.moving) this._startNextSegment();
    if (!this.moving) return;

    this.segmentElapsed += dt;
    const t = Math.min(1, this.segmentElapsed / this.segmentDuration);

    this.object3D.position.lerpVectors(
      this.segmentStartPos,
      this.segmentEndPos,
      t
    );

    this.object3D.position.y =
      this.baseY + Math.sin(t * Math.PI * 2) * 0.015;

    if (t < 1) return;

    const previousNode = { ...this.currentRoadNode };
    this.currentRoadNode = { ...this.targetRoadNode };
    this.targetRoadNode = null;
    this.moving = false;
    this.segmentElapsed = 0;
    this.object3D.position.copy(this.segmentEndPos);

    this.brain?.onNodeArrived?.(previousNode, this.currentRoadNode);
  }

  _startNextSegment() {
    const currentNode = this.getCurrentRoadNode();
    let nextNode = this.brain?.chooseNextRoad?.(currentNode) || null;

    if (!nextNode) {
      const neighbors = getNeighbors(this.city, currentNode);
      if (neighbors.length === 0) return;

      const pick = neighbors[Math.floor(Math.random() * neighbors.length)];
      nextNode = { gridX: pick.gridX, gridZ: pick.gridZ };
    }

    const dx = nextNode.gridX - currentNode.gridX;
    const dz = nextNode.gridZ - currentNode.gridZ;

    if (Math.abs(dx) + Math.abs(dz) !== 1) {
      console.warn("[CarAgent] El brain devolvió un nodo no adyacente.", {
        currentNode,
        nextNode,
      });
      return;
    }

    const startPos = this.getWorldPosition(new THREE.Vector3());
    const endPosData = gridToWorld(
      this.city,
      nextNode.gridX,
      nextNode.gridZ,
      this.baseY
    );
    const endPos = new THREE.Vector3(
      endPosData.x,
      endPosData.y,
      endPosData.z
    );

    this.segmentStartPos.copy(startPos);
    this.segmentEndPos.copy(endPos);

    const direction = endPos.clone().sub(startPos);
    direction.y = 0;
    direction.normalize();
    this.object3D.rotation.y = Math.atan2(direction.x, direction.z);

    this.segmentDuration = Math.max(
      Number.EPSILON,
      startPos.distanceTo(endPos) / this.speed
    );
    this.segmentElapsed = 0;
    this.targetRoadNode = { ...nextNode };
    this.moving = true;
  }
}
