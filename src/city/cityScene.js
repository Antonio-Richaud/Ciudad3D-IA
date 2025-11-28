// src/city/cityScene.js
import * as THREE from "three";

export function createCity(scene) {
  // Piso
  const groundGeom = new THREE.PlaneGeometry(200, 200);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  const ground = new THREE.Mesh(groundGeom, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const buildings = [];

  const gridSize = 8; // 8x8 edificios
  const spacing = 8; // distancia entre edificios
  const minHeight = 2;
  const maxHeight = 12;

  const baseGeom = new THREE.BoxGeometry(1, 1, 1);

  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const t = Math.random();
      const height = THREE.MathUtils.lerp(minHeight, maxHeight, t);

      const color = new THREE.Color().setHSL(
        0.58 + Math.random() * 0.1, // azul–morado
        0.4,
        0.5
      );

      const mat = new THREE.MeshStandardMaterial({
        color,
        metalness: 0.3,
        roughness: 0.6,
      });

      const mesh = new THREE.Mesh(baseGeom, mat);
      mesh.scale.set(3, height, 3);

      const x = (i - gridSize / 2) * spacing;
      const z = (j - gridSize / 2) * spacing;

      mesh.position.set(x, height / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      scene.add(mesh);
      buildings.push(mesh);
    }
  }

  // Niebla para darle profundidad
  const fogColor = 0x05060a;
  scene.fog = new THREE.FogExp2(fogColor, 0.008);

  return {
    ground,
    buildings,
  };
}