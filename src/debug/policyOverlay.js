// src/debug/policyOverlay.js
import * as THREE from "three";
import { gridToWorld } from "../city/cityScene.js";

/**
 * Dibuja flechas sobre la ciudad a partir de la Q-table del brain.
 * Cada celda de calle muestra la acción con mayor Q hacia un vecino.
 */
export function createPolicyOverlay(city, scene, brain, getGoalId) {
    const group = new THREE.Group();
    group.visible = true;
    scene.add(group);

    const tmpFrom = new THREE.Vector3();
    const tmpTo = new THREE.Vector3();

    function clearGroup() {
        while (group.children.length > 0) {
            const child = group.children.pop();
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        }
    }

    function update() {
        if (!group.visible) return;

        const goalId = getGoalId ? getGoalId() : brain.currentGoalId;
        if (!goalId) return;

        // Compatibilidad: getPolicySnapshot o getQSnapshot
        const snapshot = brain.getPolicySnapshot
            ? brain.getPolicySnapshot(goalId)
            : brain.getQSnapshot
                ? brain.getQSnapshot(goalId)
                : null;

        if (!snapshot || snapshot.size === 0) return;

        clearGroup();

        // Buscamos min/max Q para normalizar color/opacidad
        let qMin = Infinity;
        let qMax = -Infinity;

        snapshot.forEach((row) => {
            for (const q of row.values()) {
                if (q < qMin) qMin = q;
                if (q > qMax) qMax = q;
            }
        });

        if (!isFinite(qMin) || !isFinite(qMax) || qMax === qMin) {
            // Todo está en cero; no tiene caso dibujar todavía
            return;
        }

        snapshot.forEach((row, stateKey) => {
            // stateKey = `${goalId}|gx,gz`
            const [, coords] = stateKey.split("|");
            if (!coords) return;
            const [gxStr, gzStr] = coords.split(",");
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

            // Si ni siquiera hay Q positivo, lo podemos omitir
            // (si quieres ver todo, quita este if)
            if (bestActionKey == null) return;

            const [axStr, azStr] = bestActionKey.split(",");
            const ax = parseInt(axStr, 10);
            const az = parseInt(azStr, 10);
            if (Number.isNaN(ax) || Number.isNaN(az)) return;

            // Posiciones mundo
            gridToWorld(city, gx, gz, 0.08, tmpFrom);
            gridToWorld(city, ax, az, 0.08, tmpTo);

            const dir = new THREE.Vector3().subVectors(tmpTo, tmpFrom);
            const dist = dir.length();
            if (dist < 0.01) return;
            dir.normalize();

            // Normalizamos Q para color/opacidad [0,1]
            const t = (bestQ - qMin) / (qMax - qMin);
            const opacity = 0.25 + 0.55 * t; // 0.25–0.8

            // Color de rojo (malo) a verde (bueno)
            const color = new THREE.Color().setHSL(
                0.3 * t,    // H 0 (rojo) → 0.3 (verdoso)
                0.9,
                0.5
            );

            const material = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity,
                depthWrite: false,
            });

            // Flecha sencilla: cilindro + punta pequeña
            const shaftLength = dist * 0.6;
            const shaftGeom = new THREE.CylinderGeometry(0.05, 0.05, shaftLength, 6);
            const shaft = new THREE.Mesh(shaftGeom, material);

            // El cilindro en Three va sobre el eje Y; lo rotamos para que vaya en Z
            shaft.rotation.z = Math.PI / 2;

            // Posición al centro entre from/to
            shaft.position.set(
                (tmpFrom.x + tmpTo.x) / 2,
                tmpFrom.y + 0.01,
                (tmpFrom.z + tmpTo.z) / 2
            );

            // Rotamos en Y según la dirección
            const angleY = Math.atan2(dir.x, dir.z);
            shaft.rotation.y = angleY;

            group.add(shaft);
        });
    }

    return {
        group,
        update,
        setVisible(v) {
            group.visible = v;
        },
    };
}