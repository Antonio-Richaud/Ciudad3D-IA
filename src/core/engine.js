// src/core/engine.js
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export function createEngine(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05060a);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(
    60,
    container.clientWidth / container.clientHeight,
    0.1,
    1000
  );
  camera.position.set(40, 40, 40);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;

  // Luces básicas
  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1);
  dirLight.position.set(20, 40, 20);
  dirLight.castShadow = true;
  scene.add(dirLight);

  // Resize
  const onResize = () => {
    const { clientWidth, clientHeight } = container;
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(clientWidth, clientHeight);
  };

  window.addEventListener("resize", onResize);

  let isRunning = false;

  function renderLoop() {
    if (!isRunning) return;
    requestAnimationFrame(renderLoop);
    controls.update();
    renderer.render(scene, camera);
  }

  function start() {
    if (isRunning) return;
    isRunning = true;
    renderLoop();
  }

  function stop() {
    isRunning = false;
  }

  return {
    scene,
    camera,
    renderer,
    controls,
    start,
    stop,
  };
}