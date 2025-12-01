// src/agents/WalkerAgent.js
import * as THREE from "three";
import { gridToWorld } from "../city/cityScene.js";

export class WalkerAgent {
  constructor(city, scene, options = {}) {
    this.city = city;
    this.scene = scene;
    this.speed = options.speed ?? 2.4;

    // side = 1 o -1 → lado de la calle donde camina
    this.side = options.side ?? (Math.random() < 0.5 ? 1 : -1);

    // offset calculado en la ciudad para coincidir con la banqueta
    this.offsetAmount =
      city.sidewalkOffset ?? city.cellSize * 0.35;

    this.height = 1.0;

    const roads = city.roads;
    if (!roads || roads.length === 0) {
      throw new Error("WalkerAgent: no hay calles en la ciudad");
    }

    const startRoad =
      roads[Math.floor(Math.random() * roads.length)];

    this.gridX = startRoad.gridX;
    this.gridZ = startRoad.gridZ;

    // Dirección inicial inventada para poder calcular el primer offset
    this.prevGridX = this.gridX;
    this.prevGridZ = this.gridZ - 1;

    const dx0 = this.gridX - this.prevGridX;
    const dz0 = this.gridZ - this.prevGridZ;

    const startPos = this.#computeSidewalkPosition(
      this.gridX,
      this.gridZ,
      dx0,
      dz0
    );
    this.position = startPos.clone();

    this.targetPos = null;
    this.nextGridX = null;
    this.nextGridZ = null;

    this.mesh = this.#createMesh();
    this.mesh.position.copy(this.position);
    this.scene.add(this.mesh);
  }

  #createMesh() {
    const group = new THREE.Group();

    const bodyHeight = 1.1;
    const bodyRadius = 0.22;
    const headRadius = 0.28;

    const bodyGeom = new THREE.CylinderGeometry(
      bodyRadius,
      bodyRadius * 1.05,
      bodyHeight,
      10
    );
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x4b8efc,
      roughness: 0.45,
      metalness: 0.1,
    });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    body.position.y = bodyHeight / 2;
    group.add(body);

    const headGeom = new THREE.SphereGeometry(headRadius, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xffe0c2,
      roughness: 0.7,
      metalness: 0.05,
    });
    const head = new THREE.Mesh(headGeom, headMat);
    head.castShadow = true;
    head.receiveShadow = true;
    head.position.y = bodyHeight + headRadius * 0.95;
    group.add(head);

    return group;
  }

  #computeSidewalkPosition(gridX, gridZ, dirX, dirZ) {
    const center = gridToWorld(this.city, gridX, gridZ, 0);

    let offsetX = 0;
    let offsetZ = 0;

    if (dirX !== 0) {
      // avanzando a lo largo de X → desplazamos en Z hacia la banqueta
      offsetZ = this.side * this.offsetAmount;
    } else if (dirZ !== 0) {
      // avanzando a lo largo de Z → desplazamos en X
      offsetX = this.side * this.offsetAmount;
    } else {
      // sin dirección clara, aplica offset fijo en X
      offsetX = this.side * this.offsetAmount;
    }

    return new THREE.Vector3(
      center.x + offsetX,
      this.height,
      center.z + offsetZ
    );
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
      this.targetPos = null;
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

    const dx = next.gridX - this.gridX;
    const dz = next.gridZ - this.gridZ;

    const startPos = this.#computeSidewalkPosition(
      this.gridX,
      this.gridZ,
      dx,
      dz
    );
    const targetPos = this.#computeSidewalkPosition(
      next.gridX,
      next.gridZ,
      dx,
      dz
    );

    this.position.copy(startPos);

    this.nextGridX = next.gridX;
    this.nextGridZ = next.gridZ;
    this.targetPos = targetPos;
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
      this.prevGridX = this.gridX;
      this.prevGridZ = this.gridZ;
      this.gridX = this.nextGridX;
      this.gridZ = this.nextGridZ;

      this.position.copy(this.targetPos);
      this.targetPos = null;
      this.#pickNextTarget();
      return;
    }

    dir.normalize();
    const step = this.speed * dt;

    if (step >= dist) {
      this.position.copy(this.targetPos);
      this.prevGridX = this.gridX;
      this.prevGridZ = this.gridZ;
      this.gridX = this.nextGridX;
      this.gridZ = this.nextGridZ;
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