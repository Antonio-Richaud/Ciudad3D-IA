// src/core/engine.js
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { createForestBoundary } from "../city/forestBoundary.js";

export function createEngine(container) {
  const scene = new THREE.Scene();

  // Color de respaldo; el sistema astronómico reemplaza este fondo en runtime.
  scene.background = new THREE.Color(0x6ca9ff);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  container.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(
    60,
    container.clientWidth / container.clientHeight,
    0.1,
    3000
  );
  camera.position.set(40, 45, 40);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 10;
  controls.maxDistance = 125;
  controls.minPolarAngle = 0.08;
  controls.maxPolarAngle = Math.PI / 2 - 0.08;
  controls.screenSpacePanning = false;

  const targetLimit = 32;
  const cameraHorizontalLimit = 62;
  const minimumCameraHeight = 2.8;

  // El usuario puede recorrer visualmente la ciudad, pero no abandonar el
  // mundo ni inclinar la cámara por debajo del plano de suelo.
  const keepCameraInsideWorld = () => {
    controls.target.x = THREE.MathUtils.clamp(
      controls.target.x,
      -targetLimit,
      targetLimit
    );
    controls.target.z = THREE.MathUtils.clamp(
      controls.target.z,
      -targetLimit,
      targetLimit
    );
    controls.target.y = 0;
    camera.position.y = Math.max(camera.position.y, minimumCameraHeight);

    const horizontalDistance = Math.hypot(
      camera.position.x,
      camera.position.z
    );
    if (horizontalDistance > cameraHorizontalLimit) {
      const factor = cameraHorizontalLimit / horizontalDistance;
      camera.position.x *= factor;
      camera.position.z *= factor;
    }
  };

  controls.addEventListener("change", keepCameraInsideWorld);
  keepCameraInsideWorld();

  // El límite boscoso vive fuera de la cuadrícula lógica: es puramente visual,
  // por lo que no altera calles, pathfinding ni estados de los agentes.
  const forestBoundary = createForestBoundary(scene, { renderer });

  // Luces base. Sus intensidades, colores y dirección se actualizan después
  // con la posición astronómica real del Sol y el ciclo día/noche.
  const hemiLight = new THREE.HemisphereLight(0x6ca9ff, 0x1f3b21, 0.8);
  scene.add(hemiLight);

  const ambient = new THREE.AmbientLight(0xffffff, 0.25);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.3);
  dirLight.position.set(40, 60, 20);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(2048, 2048);
  dirLight.shadow.camera.near = 1;
  dirLight.shadow.camera.far = 180;
  dirLight.shadow.camera.left = -70;
  dirLight.shadow.camera.right = 70;
  dirLight.shadow.camera.top = 70;
  dirLight.shadow.camera.bottom = -70;

  // Un pequeño normalBias corrige las bandas/lineas de auto-sombreado sobre
  // superficies GLB sin separar visualmente las sombras de los objetos.
  dirLight.shadow.bias = -0.00015;
  dirLight.shadow.normalBias = 0.045;
  dirLight.shadow.radius = 2;

  scene.add(dirLight);
  scene.add(dirLight.target);

  const clock = new THREE.Clock();
  let updateCallback = null;

  const onResize = () => {
    const { clientWidth, clientHeight } = container;
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(clientWidth, clientHeight);
  };

  window.addEventListener("resize", onResize);

  let isRunning = false;

  function renderLoop() {
    if (!isRunning) return;
    requestAnimationFrame(renderLoop);

    const delta = clock.getDelta();
    if (typeof updateCallback === "function") {
      updateCallback(delta);
    }

    controls.update();
    keepCameraInsideWorld();
    renderer.render(scene, camera);
  }

  function start() {
    if (isRunning) return;
    isRunning = true;
    clock.start();
    renderLoop();
  }

  function stop() {
    isRunning = false;
  }

  function onUpdate(fn) {
    updateCallback = fn;
  }

  return {
    scene,
    camera,
    renderer,
    controls,
    forestBoundary,
    lights: {
      hemisphere: hemiLight,
      ambient,
      sun: dirLight,
    },
    start,
    stop,
    onUpdate,
  };
}
