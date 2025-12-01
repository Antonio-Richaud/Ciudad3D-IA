// src/agents/CarAgent.js
import * as THREE from "three";
import { gridToWorld } from "../city/cityScene.js";

export class CarAgent {
  constructor(city, scene, options = {}) {
    this.city = city;
    this.scene = scene;
    this.speed = options.speed ?? 6;

    const roads = city.roads;
    if (!roads || roads.length === 0) {
      throw new Error("CarAgent: no hay calles en la ciudad");
    }

    const startRoad =
      roads[Math.floor(Math.random() * roads.length)];

    this.gridX = startRoad.gridX;
    this.gridZ = startRoad.gridZ;
    this.prevGridX = this.gridX;
    this.prevGridZ = this.gridZ;

    const startWorld = gridToWorld(city, this.gridX, this.gridZ, 0);
    this.position = new THREE.Vector3(
      startWorld.x,
      0.5,
      startWorld.z
    );

    this.targetGridX = null;
    this.targetGridZ = null;
    this.targetPos = null;

    this.mesh = this.#createMesh();
    this.mesh.position.copy(this.position);
    this.scene.add(this.mesh);
  }

  #createMesh() {
    const group = new THREE.Group();

    const cellSize = this.city.cellSize;
    const bodyLength = cellSize * 0.6;
    const bodyWidth = cellSize * 0.3;
    const bodyHeight = 0.6;

    // Cuerpo
    const bodyGeom = new THREE.BoxGeometry(
      bodyWidth,
      bodyHeight,
      bodyLength
    );
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xff5c5c,
      metalness: 0.5,
      roughness: 0.35,
    });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    body.position.y = bodyHeight / 2;

    // Cabina
    const cabinGeom = new THREE.BoxGeometry(
      bodyWidth * 0.8,
      bodyHeight * 0.7,
      bodyLength * 0.45
    );
    const cabinMat = new THREE.MeshStandardMaterial({
      color: 0xeeeeff,
      metalness: 0.1,
      roughness: 0.15,
      transparent: true,
      opacity: 0.9,
    });
    const cabin = new THREE.Mesh(cabinGeom, cabinMat);
    cabin.position.y = bodyHeight + (bodyHeight * 0.7) / 2 - 0.05;
    cabin.position.z = bodyLength * 0.05;
    cabin.castShadow = true;
    cabin.receiveShadow = true;

    // Llantas
    const wheelGeom = new THREE.CylinderGeometry(
      bodyWidth * 0.16,
      bodyWidth * 0.16,
      bodyWidth * 0.3,
      10
    );
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.9,
      metalness: 0.0,
    });

    const wheelOffsets = [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];

    wheelOffsets.forEach(([sx, sz]) => {
      const wheel = new THREE.Mesh(wheelGeom, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(
        (bodyWidth / 2 - bodyWidth * 0.1) * sx,
        bodyHeight * 0.2,
        (bodyLength / 2 - bodyLength * 0.2) * sz
      );
      wheel.castShadow = true;
      wheel.receiveShadow = true;
      group.add(wheel);
    });

    // Luces delanteras
    const lightGeom = new THREE.BoxGeometry(
      bodyWidth * 0.18,
      bodyHeight * 0.15,
      bodyHeight * 0.15
    );
    const headlightMat = new THREE.MeshStandardMaterial({
      color: 0xffffcc,
      emissive: 0xffffcc,
      emissiveIntensity: 1.5,
      roughness: 0.2,
      metalness: 0.0,
    });
    const leftLight = new THREE.Mesh(lightGeom, headlightMat);
    const rightLight = new THREE.Mesh(lightGeom, headlightMat);
    const lightZ = bodyLength / 2 + 0.02;
    const lightY = bodyHeight * 0.4;

    leftLight.position.set(-bodyWidth * 0.25, lightY, lightZ);
    rightLight.position.set(bodyWidth * 0.25, lightY, lightZ);
    leftLight.castShadow = false;
    rightLight.castShadow = false;
    group.add(leftLight);
    group.add(rightLight);

    group.add(body);
    group.add(cabin);

    return group;
  }

  #getNeighbors() {
    const { roadMap } = this.city;
    const deltas = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];

    const neighbors = [];

    for (const [dx, dz] of deltas) {
      const nx = this.gridX + dx;
      const nz = this.gridZ + dz;
      const key = `${nx},${nz}`;
      const road = roadMap.get(key);
      if (road) {
        neighbors.push(road);
      }
    }

    return neighbors;
  }

  #pickNextTarget() {
    const neighbors = this.#getNeighbors();

    if (neighbors.length === 0) {
      // Calle aislada (no debería ocurrir): nos quedamos en el mismo tile
      const wp = gridToWorld(
        this.city,
        this.gridX,
        this.gridZ,
        0
      );
      this.targetGridX = this.gridX;
      this.targetGridZ = this.gridZ;
      this.targetPos = new THREE.Vector3(wp.x, 0.5, wp.z);
      return;
    }

    let candidates = neighbors;

    if (neighbors.length > 1) {
      const filtered = neighbors.filter(
        (r) =>
          !(
            r.gridX === this.prevGridX &&
            r.gridZ === this.prevGridZ
          )
      );
      if (filtered.length > 0) {
        candidates = filtered;
      }
    }

    const next =
      candidates[Math.floor(Math.random() * candidates.length)];

    this.prevGridX = this.gridX;
    this.prevGridZ = this.gridZ;

    this.targetGridX = next.gridX;
    this.targetGridZ = next.gridZ;

    const wp = gridToWorld(
      this.city,
      this.targetGridX,
      this.targetGridZ,
      0
    );
    this.targetPos = new THREE.Vector3(wp.x, 0.5, wp.z);
  }

  update(dt) {
    if (!this.targetPos) {
      this.#pickNextTarget();
      return;
    }

    const dir = new THREE.Vector3().subVectors(
      this.targetPos,
      this.position
    );
    const dist = dir.length();

    if (dist < 0.01) {
      this.gridX = this.targetGridX;
      this.gridZ = this.targetGridZ;
      this.position.copy(this.targetPos);
      this.targetPos = null;
      this.#pickNextTarget();
      return;
    }

    dir.normalize();
    const step = this.speed * dt;

    if (step >= dist) {
      this.position.copy(this.targetPos);
      this.gridX = this.targetGridX;
      this.gridZ = this.targetGridZ;
      this.targetPos = null;
      this.#pickNextTarget();
    } else {
      this.position.addScaledVector(dir, step);
    }

    this.mesh.position.copy(this.position);

    if (this.targetPos) {
      const lookDir = new THREE.Vector3().subVectors(
        this.targetPos,
        this.position
      );
      if (lookDir.lengthSq() > 0.0001) {
        lookDir.normalize();
        const angle = Math.atan2(lookDir.x, lookDir.z);
        this.mesh.rotation.y = angle;
      }
    }
  }
}