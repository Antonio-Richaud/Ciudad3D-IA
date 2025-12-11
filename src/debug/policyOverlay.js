// src/visualization/policyOverlay.js
import * as THREE from "three";
import { gridToWorld } from "../city/cityScene.js";

/**
 * PolicyOverlay:
 * Dibuja flechas sobre las calles a partir de la Q-table de un QLearningBrain.
 * - Para cada estado (goalId|gx,gz) toma la acción con mayor Q.
 * - Color: rojo -> verde según el valor relativo de Q.
 */
export class PolicyOverlay {
  constructor(city, scene) {
    this.city = city;
    this.scene = scene;

    this.group = new THREE.Group();
    this.group.renderOrder = 999; // que se dibuje por encima
    this.scene.add(this.group);
  }

  clear() {
    while (this.group.children.length > 0) {
      const child = this.group.children.pop();
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
      if (child.dispose) child.dispose();
    }
  }

  /**
   * brain: instancia de QLearningBrain
   * goalId: "home" o "shop"
   */
  updateFromBrain(brain, goalId) {
    if (!brain) return;

    const snapshot = brain.getPolicySnapshot
      ? brain.getPolicySnapshot(goalId)
      : brain.getQSnapshot
        ? brain.getQSnapshot(goalId)
        : null;

    if (!snapshot || snapshot.size === 0) return;

    this.clear();

    // Min/Max Q para normalizar color
    let qMin = Infinity;
    let qMax = -Infinity;

    snapshot.forEach((row) => {
      for (const q of row.values()) {
        if (q < qMin) qMin = q;
        if (q > qMax) qMax = q;
      }
    });

    if (!isFinite(qMin) || !isFinite(qMax) || qMax === qMin) {
      return;
    }

    snapshot.forEach((row, stateKey) => {
      // stateKey = `${goalId}|gx,gz`
      const parts = stateKey.split("|");
      if (parts.length !== 2) return;

      const coordStr = parts[1];
      const [gxStr, gzStr] = coordStr.split(",");
      const gx = parseInt(gxStr, 10);
      const gz = parseInt(gzStr, 10);
      if (Number.isNaN(gx) || Number.isNaN(gz)) return;

      // Elegimos la acción con mayor Q
      let bestActionKey = null;
      let bestQ = -Infinity;

      for (const [aKey, q] of row.entries()) {
        if (q > bestQ) {
          bestQ = q;
          bestActionKey = aKey;
        }
      }

      if (bestActionKey == null) return;

      const [axStr, azStr] = bestActionKey.split(",");
      const ax = parseInt(axStr, 10);
      const az = parseInt(azStr, 10);
      if (Number.isNaN(ax) || Number.isNaN(az)) return;

      const fromPos = gridToWorld(this.city, gx, gz, 0.08);
      const toPos = gridToWorld(this.city, ax, az, 0.08);

      const dir = new THREE.Vector3().subVectors(toPos, fromPos);
      const dist = dir.length();
      if (dist < 0.01) return;
      dir.normalize();

      // Normalizamos Q para color [0,1]
      const t = (bestQ - qMin) / (qMax - qMin);

      const color = new THREE.Color().setHSL(
        0.3 * t,  // 0 = rojo, 0.3 ~ verde
        0.9,
        0.5
      );

      // Flecha = cilindro sencillo
      const shaftLength = dist * 0.6;
      const shaftGeom = new THREE.CylinderGeometry(
        0.06,
        0.06,
        shaftLength,
        6
      );
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      });

      const shaft = new THREE.Mesh(shaftGeom, material);

      // En Three el cilindro es vertical (eje Y), lo giramos para “acostarlo”
      shaft.rotation.z = Math.PI / 2;

      // Lo colocamos a la mitad entre origen y destino
      const mid = new THREE.Vector3()
        .addVectors(fromPos, toPos)
        .multiplyScalar(0.5);
      shaft.position.copy(mid);

      // Rotación en Y según la dirección de la flecha
      const angleY = Math.atan2(dir.x, dir.z);
      shaft.rotation.y = angleY;

      this.group.add(shaft);
    });
  }
}