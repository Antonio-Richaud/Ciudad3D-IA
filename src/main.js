// src/main.js
import * as THREE from "three";
import { createEngine } from "./core/engine.js";
import { createCity, applyCityState } from "./city/cityScene.js";
import { CarAgent } from "./agents/CarAgent.js";
import { WalkerAgent } from "./agents/WalkerAgent.js";
import { QLearningBrain } from "./agents/brains/QLearningBrain.js";
import { PolicyOverlay } from "./visualization/policyOverlay.js";

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("app");

  if (!container) {
    throw new Error("No se encontró el contenedor #app");
  }

  const engine = createEngine(container);
  const city = createCity(engine.scene);

  // ================= HUD abajo izquierda =================
  const statusEl = document.createElement("div");
  statusEl.id = "agent-status";
  statusEl.style.position = "absolute";
  statusEl.style.left = "10px";
  statusEl.style.bottom = "10px";
  statusEl.style.padding = "8px 12px";
  statusEl.style.background = "rgba(0,0,0,0.6)";
  statusEl.style.borderRadius = "8px";
  statusEl.style.fontFamily =
    "system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  statusEl.style.fontSize = "12px";
  statusEl.style.color = "#fff";
  statusEl.style.pointerEvents = "none";
  statusEl.textContent = "Inicializando agente...";
  container.appendChild(statusEl);

  const updateStatus = (text) => {
    statusEl.textContent = text;
  };

  // ================= Panel derecho del agente =================
  const sidePanel = document.createElement("div");
  sidePanel.id = "agent-panel";
  sidePanel.style.position = "absolute";
  sidePanel.style.top = "0";
  sidePanel.style.right = "0";
  sidePanel.style.width = "260px";
  sidePanel.style.height = "100%";
  sidePanel.style.background = "rgba(0,0,0,0.7)";
  sidePanel.style.display = "none";
  sidePanel.style.color = "#fff";
  sidePanel.style.fontFamily =
    "system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  sidePanel.style.fontSize = "12px";
  sidePanel.style.padding = "10px";
  sidePanel.style.boxSizing = "border-box";
  sidePanel.style.pointerEvents = "none";
  container.appendChild(sidePanel);

  const panelTitle = document.createElement("div");
  panelTitle.textContent = "Agente seleccionado";
  panelTitle.style.fontWeight = "600";
  panelTitle.style.marginBottom = "6px";
  sidePanel.appendChild(panelTitle);

  const chartCanvas = document.createElement("canvas");
  chartCanvas.id = "learning-chart";
  chartCanvas.width = 220;
  chartCanvas.height = 110;
  chartCanvas.style.display = "block";
  chartCanvas.style.margin = "8px 0";
  chartCanvas.style.background = "rgba(0,0,0,0.4)";
  chartCanvas.style.borderRadius = "6px";
  sidePanel.appendChild(chartCanvas);
  const chartCtx = chartCanvas.getContext("2d");

  const modelInfoEl = document.createElement("div");
  modelInfoEl.style.fontSize = "11px";
  modelInfoEl.style.lineHeight = "1.4";
  modelInfoEl.style.marginTop = "4px";
  sidePanel.appendChild(modelInfoEl);

  const drawLearningChart = (info) => {
    if (!chartCtx || !info) return;
    const stats = info.episodeStats || [];
    const ctx = chartCtx;
    const canvas = ctx.canvas;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = "#ffffff";
    ctx.font = "10px system-ui, -apple-system";
    ctx.fillText("Pasos por episodio", 10, 14);

    if (stats.length === 0) {
      ctx.fillText("Esperando episodios...", 10, 30);
      return;
    }

    const padding = 24;
    const innerW = w - padding * 2;
    const innerH = h - padding * 2;

    const stepsArr = stats.map((s) => s.steps);
    const minSteps = Math.min(...stepsArr);
    const maxSteps = Math.max(...stepsArr);
    const range = Math.max(1, maxSteps - minSteps);

    ctx.strokeStyle = "#888888";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, h - padding);
    ctx.lineTo(w - padding, h - padding);
    ctx.stroke();

    ctx.strokeStyle = "#00ff88";
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    stats.forEach((s, idx) => {
      const x =
        padding +
        (innerW * (idx / Math.max(1, stats.length - 1)));
      const norm = (s.steps - minSteps) / range;
      const y = h - padding - norm * innerH;

      if (idx === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    ctx.fillStyle = "#cccccc";
    ctx.font = "9px system-ui, -apple-system";
    ctx.fillText(
      `eps: ${info.epsilon.toFixed(3)}  ep: ${info.episodes}`,
      10,
      h - 8
    );
  };

  const updateModelInfo = (info) => {
    if (!info) {
      modelInfoEl.textContent = "";
      return;
    }

    modelInfoEl.innerHTML = `
      <div style="font-weight:600; margin-bottom:4px;">Modelo de decisión</div>
      <div>Tipo: Q-Learning tabular</div>
      <div>Episodios: ${info.episodes}</div>
      <div>Paso actual del episodio: ${info.episodeSteps}</div>
      <div>Total de pasos: ${info.totalSteps}</div>
      <div style="margin-top:6px; font-size:10px; opacity:0.75;">
        En el overlay de la ciudad ves la política aprendida:<br/>
        color (Q-value) y flechas indicando la mejor acción por calle.
      </div>
    `;
  };

  // ================= Estado visual inicial de la ciudad =================
  const initialState = {
    buildingHeightMultiplier: 1,
    skyColor: "#5f9df3",
    cityGlowIntensity: 0.7,
  };

  applyCityState(city, initialState, engine.scene);

  const agents = [];

  // 🚗 Carrito
  const car = new CarAgent(city, engine.scene, { speed: 7 });
  agents.push(car);

  // 🧠 Cerebro del muñequito (Q-Learning)
  const walkerBrain = new QLearningBrain(city, {
    alpha: 0.4,
    gamma: 0.9,
    epsilon: 0.3,
    epsilonMin: 0.02,
    epsilonDecay: 0.99,
    maxEpisodeStats: 80,
    maxEpisodeSteps: 60,
  });

  // Overlay de política
  const policyOverlay = new PolicyOverlay(city, engine.scene);
  let lastPolicyEpisode = 0;

  // Nodo inicial del muñequito: entrada de la casa (si existe)
  const homePOI = city.pointsOfInterest?.home;
  const walkerStartRoad =
    homePOI?.entranceRoad || { gridX: 9, gridZ: 7 };

  // 🚶 Muñequito con brain
  const walker = new WalkerAgent(
    city,
    engine.scene,
    walkerBrain,
    {
      speed: 2.2,
      startRoad: walkerStartRoad,
    }
  );
  agents.push(walker);

  // 🎯 Estado de la misión
  let currentGoal = "shop";
  let tripsToShop = 0;
  let tripsToHome = 0;

  walker.setGoal(currentGoal);
  updateStatus("Objetivo: ir a la tienda 🏪");

  // ================= Raycaster + lock de cámara =================
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  let focusedAgent = null;
  let followLocked = false;
  const lockMousePos = { x: 0, y: 0 };

  container.addEventListener("mousemove", (event) => {
    const rect = container.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;

    // Si ya estamos lockeados, un movimiento grande libera
    if (followLocked) {
      const dx = localX - lockMousePos.x;
      const dy = localY - lockMousePos.y;
      const dist2 = dx * dx + dy * dy;

      if (dist2 > 25) {
        followLocked = false;
        focusedAgent = null;
        sidePanel.style.display = "none";
      }
      return;
    }

    // Si NO está lockeado, hacemos raycast normal
    mouse.x = (localX / rect.width) * 2 - 1;
    mouse.y = -(localY / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, engine.camera);

    const intersects = raycaster.intersectObject(
      walker.object3D,
      true
    );

    if (intersects.length > 0) {
      // Primer hover -> activamos seguimiento
      focusedAgent = walker;
      followLocked = true;
      lockMousePos.x = localX;
      lockMousePos.y = localY;
      sidePanel.style.display = "block";
    } else {
      focusedAgent = null;
      sidePanel.style.display = "none";
    }
  });

  // ================= Loop principal =================
  const SIM_SPEED = 6;

  engine.onUpdate((dt) => {
    const scaledDt = dt * SIM_SPEED;

    agents.forEach((agent) => agent.update(scaledDt));

    // Lógica de cambio de meta
    const poi = city.pointsOfInterest?.[currentGoal];
    if (poi && walker.isAtPOI(poi)) {
      if (currentGoal === "shop") {
        tripsToShop += 1;
        currentGoal = "home";
        walker.setGoal(currentGoal);
        updateStatus(
          `Llegó a la tienda 🏪 (${tripsToShop} veces). Nuevo objetivo: regresar a casa 🏠`
        );
      } else {
        tripsToHome += 1;
        currentGoal = "shop";
        walker.setGoal(currentGoal);
        updateStatus(
          `Llegó a casa 🏠 (${tripsToHome} veces). Nuevo objetivo: ir a la tienda 🏪`
        );
      }
    }

    // Info del brain
    if (
      walkerBrain &&
      typeof walkerBrain.getDebugInfo === "function"
    ) {
      const info = walkerBrain.getDebugInfo();
      drawLearningChart(info);
      updateModelInfo(info);

      // Actualizar overlay solo cuando cambia el número de episodios
      if (info.episodes !== lastPolicyEpisode) {
        policyOverlay.updateFromBrain(walkerBrain, currentGoal);
        lastPolicyEpisode = info.episodes;
      }
    }

    // Cámara siguiendo al agente si está enfocado
    if (focusedAgent) {
      const targetPos = focusedAgent.getWorldPosition(
        new THREE.Vector3()
      );

      // Offset de la cámara respecto al agente (ajusta a tu gusto)
      const offset = new THREE.Vector3(16, 22, 18);
      const camTargetPos = targetPos.clone().add(offset);

      // Suavizar movimiento de la cámara
      engine.camera.position.lerp(camTargetPos, 0.12);

      // Punto al que queremos mirar (ligeramente arriba del mono)
      const lookAt = new THREE.Vector3(
        targetPos.x,
        targetPos.y + 1.2,
        targetPos.z
      );

      // MUY IMPORTANTE: decirle a OrbitControls a dónde mirar
      if (engine.controls) {
        engine.controls.target.lerp(lookAt, 0.2);
      } else {
        // fallback por si algún día no usamos OrbitControls
        engine.camera.lookAt(lookAt);
      }
    }
  });

  engine.start();

  // window.__CITY3D__ = { engine, city, agents, walkerBrain, policyOverlay };
})