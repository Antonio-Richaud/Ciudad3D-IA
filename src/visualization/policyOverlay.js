// src/visualization/policyOverlay.js
import * as THREE from "three";
import { gridToWorld } from "../city/cityScene.js";

/**
 * PolicyOverlay:
 * Dibuja sobre las calles pequeños tiles coloreados + flechas,
 * según la mejor acción (política) que el QLearningBrain tiene
 * para cada nodo, para un objetivo dado.
 */
export class PolicyOverlay {
  /**
   * @param {object} city
   * @param {THREE.Scene} scene
   */
  constructor(city, scene) {
    this.city = city;
    this.scene = scene;

    this.group = new THREE.Group();
    this.group.renderOrder = 10;
    this.group.visible = true;

    scene.add(this.group);
  }

  clear() {
    while (this.group.children.length > 0) {
      const child = this.group.children.pop();
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }
  }

  /**
   * Actualiza el overlay a partir del brain y del goal actual.
   * @param {QLearningBrain} brain
   * @param {string} goalId
   */
  updateFromBrain(brain, goalId) {
    if (!brain || typeof brain.getPolicySnapshot !== "function") return;

    const snapshot = brain.getPolicySnapshot(goalId);
    if (!snapshot || snapshot.length === 0) {
      this.clear();
      return;
    }

    // calcular min y max Q para normalizar colores
    let minQ = Infinity;
    let maxQ = -Infinity;
    for (const s of snapshot) {
      if (s.bestQ < minQ) minQ = s.bestQ;
      if (s.bestQ > maxQ) maxQ = s.bestQ;
    }
    if (!Number.isFinite(minQ) || !Number.isFinite(maxQ)) {
      this.clear();
      return;
    }
    if (minQ === maxQ) {
      minQ -= 1;
      maxQ += 1;
    }

    this.clear();

    const cellSize = this.city.cellSize || 4;
    const tileSize = cellSize * 0.35;
    const tileHeight = 0.03;

    snapshot.forEach((state) => {
      const { gridX, gridZ, bestDir, bestQ } = state;

      const basePos = gridToWorld(this.city, gridX, gridZ, 0);

      // Q → [0,1] → color de rojo a verde
      const t = (bestQ - minQ) / (maxQ - minQ);
      const r = 1 - t;
      const g = t;
      const b = 0.2;

      const tileGeom = new THREE.BoxGeometry(
        tileSize,
        tileHeight,
        tileSize
      );
      const tileMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(r, g, b),
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      });
      const tile = new THREE.Mesh(tileGeom, tileMat);
      tile.position.set(basePos.x, 0.06, basePos.z);

      // Flecha negra encima indicando la mejor acción
      const arrowGeom = new THREE.BoxGeometry(
        tileSize * 0.6,
        tileHeight * 1.5,
        tileSize * 0.14
      );
      const arrowMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      });
      const arrow = new THREE.Mesh(arrowGeom, arrowMat);
      arrow.position.set(0, tileHeight, 0);

      switch (bestDir) {
        case "north": // hacia -Z
          arrow.rotation.y = 0;
          break;
        case "south": // hacia +Z
          arrow.rotation.y = Math.PI;
          break;
        case "east": // hacia +X
          arrow.rotation.y = Math.PI / 2;
          break;
        case "west": // hacia -X
          arrow.rotation.y = -Math.PI / 2;
          break;
        default:
          break;
      }

      tile.add(arrow);
      this.group.add(tile);
    });
  }
}