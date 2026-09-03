// src/core/engine.js
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export function createEngine(container) {
  const scene = new THREE.Scene();

  // Color de respaldo; el sistema astronómico reemplaza este fondo en runtime.
  scene.background = new THREE.Color(0x6ca9ff);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  container.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(
    60,
    container.clientWidth / container.clientHeight,
    0.1,
    1000
  );
  camera.position.set(45, 45, 45);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 10;
  controls.maxDistance = 145;
  controls.minPolarAngle = 0.08;
  controls.maxPolarAngle = Math.PI / 2 - 0.035;

  // Evitamos que una órbita o paneo extremo mande la cámara debajo del suelo.
  // Conservamos el paneo horizontal, pero el plano de interés siempre queda
  // a nivel de ciudad.
  const keepCameraAboveGround = () => {
    controls.target.y = 0;
    camera.position.y = Math.max(camera.position.y, 1.2);
  };

  controls.addEventListener("change", keepCameraAboveGround);

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
  dirLight.shadow.camera.far = 200;
  dirLight.shadow.camera.left = -80;
  dirLight.shadow.camera.right = 80;
  dirLight.shadow.camera.top = 80;
  dirLight.shadow.camera.bottom = -80;
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
    keepCameraAboveGround();
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
