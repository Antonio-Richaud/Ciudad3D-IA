// src/debug/gridOverlay.js
import * as THREE from "three";
import { gridToWorld } from "../city/cityScene.js";

/**
 * Crea una cuadrícula de depuración sobre la ciudad.
 * - Dibuja líneas sobre todas las celdas.
 * - Añade etiquetas de coordenadas cada 2 celdas (puedes ajustar el paso).
 */
export function createGridOverlay(city, scene) {
  const group = new THREE.Group();
  group.visible = false; // por defecto apagado

  const size = city.gridSize;
  const cellSize = city.cellSize;

  // --- Líneas de la cuadrícula ---
  const positions = [];

  // Líneas verticales (fijas X, varía Z)
  for (let gx = 0; gx <= size; gx++) {
    const start = gridToWorld(city, gx, 0, 0.03);
    const end = gridToWorld(city, gx, size - 1, 0.03);
    positions.push(start.x, start.y, start.z);
    positions.push(end.x, end.y, end.z);
  }

  // Líneas horizontales (fijo Z, varía X)
  for (let gz = 0; gz <= size; gz++) {
    const start = gridToWorld(city, 0, gz, 0.03);
    const end = gridToWorld(city, size - 1, gz, 0.03);
    positions.push(start.x, start.y, start.z);
    positions.push(end.x, end.y, end.z);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );

  const lineMat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.35,
  });

  const lines = new THREE.LineSegments(geom, lineMat);
  group.add(lines);

  // --- Etiquetas de coordenadas (cada 2 celdas para no saturar) ---
  const labelsGroup = new THREE.Group();

  for (let gx = 0; gx < size; gx += 2) {
    for (let gz = 0; gz < size; gz += 2) {
      const label = createCoordSprite(`${gx},${gz}`);
      const center = gridToWorld(city, gx, gz, 0.04);
      label.position.set(center.x, center.y + 0.01, center.z);
      labelsGroup.add(label);
    }
  }

  group.add(labelsGroup);
  scene.add(group);

  return {
    group,
    setVisible(visible) {
      group.visible = visible;
    },
    toggle() {
      group.visible = !group.visible;
    },
  };
}

/**
 * Crea un Sprite con texto usando un canvas.
 */
function createCoordSprite(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Fondo semitransparente
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Texto
  ctx.fillStyle = "white";
  ctx.font = "bold 40px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.4, 0.7, 1); // ajusta si lo quieres más chico/grande

  return sprite;
}