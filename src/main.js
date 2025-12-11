// src/main.js
import * as THREE from "three";
import { createEngine } from "./core/engine.js";
import { createCity, applyCityState } from "./city/cityScene.js";
import { CarAgent } from "./agents/CarAgent.js";
import { WalkerAgent } from "./agents/WalkerAgent.js";
import { QLearningBrain } from "./agents/brains/QLearningBrain.js";
import { PolicyOverlay } from "./visualization/policyOverlay.js";
import { CarShortestPathBrain } from "./agents/brains/CarShortestPathBrain.js";
import { createGridOverlay } from "./debug/gridOverlay.js";
import { createPolicyOverlay } from "./debug/policyOverlay.js";


document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("app");

  if (!container) {
    throw new Error("No se encontró el contenedor #app");
  }

  const engine = createEngine(container);
  const city = createCity(engine.scene);

  // Aseguramos que el contenedor permita overlays posicionados
  container.style.position = "relative";

  // Cuadrícula de depuración
  const gridOverlay = createGridOverlay(city, engine.scene);

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
  statusEl.textContent = "Ningún agente seleccionado";
  container.appendChild(statusEl);

  // Toggle para mostrar/ocultar la cuadrícula de depuración
  const gridToggleWrapper = document.createElement("label");
  gridToggleWrapper.id = "grid-toggle-wrapper";
  gridToggleWrapper.style.position = "absolute";
  gridToggleWrapper.style.top = "10px";
  gridToggleWrapper.style.right = "10px";
  gridToggleWrapper.style.padding = "6px 10px";
  gridToggleWrapper.style.background = "rgba(0,0,0,0.6)";
  gridToggleWrapper.style.borderRadius = "8px";
  gridToggleWrapper.style.display = "flex";
  gridToggleWrapper.style.alignItems = "center";
  gridToggleWrapper.style.gap = "6px";
  gridToggleWrapper.style.fontFamily =
    "system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  gridToggleWrapper.style.fontSize = "12px";
  gridToggleWrapper.style.color = "#fff";

  const gridCheckbox = document.createElement("input");
  gridCheckbox.type = "checkbox";
  gridCheckbox.id = "grid-toggle";

  const gridLabelText = document.createElement("span");
  gridLabelText.textContent = "Cuadrícula";

  gridToggleWrapper.appendChild(gridCheckbox);
  gridToggleWrapper.appendChild(gridLabelText);
  container.appendChild(gridToggleWrapper);

  gridCheckbox.addEventListener("change", (e) => {
    gridOverlay.setVisible(e.target.checked);
  });

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
    const ctx = chartCtx;
    const canvas = ctx.canvas;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#ffffff";
    ctx.font = "10px system-ui, -apple-system";

    // Caso 1: cerebro de ruta más corta (carro)
    if (info.type === "shortest-path") {
      const pathLen =
        typeof info.pathLength === "number" ? info.pathLength : 0;
      const remaining =
        typeof info.remainingSteps === "number"
          ? info.remainingSteps
          : 0;
      const goalId = info.goalId || "sin objetivo";

      ctx.fillText("Ruta más corta", 10, 14);
      ctx.fillText(`Objetivo: ${goalId}`, 10, 30);
      ctx.fillText(`Longitud de ruta: ${pathLen}`, 10, 46);
      ctx.fillText(`Pasos restantes: ${remaining}`, 10, 62);
      return;
    }

    // Caso 2: Q-Learning (peatón)
    const stats = info.episodeStats || [];
    ctx.fillText("Pasos por episodio", 10, 14);

    if (!Array.isArray(stats) || stats.length === 0) {
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

    if (
      typeof info.epsilon === "number" &&
      typeof info.episodes === "number"
    ) {
      ctx.fillStyle = "#cccccc";
      ctx.font = "9px system-ui, -apple-system";
      ctx.fillText(
        `eps: ${info.epsilon.toFixed(3)}  ep: ${info.episodes}`,
        10,
        h - 8
      );
    }
  };

  const updateModelInfo = (info, agent) => {
    if (!info || !agent) {
      modelInfoEl.textContent = "";
      return;
    }

    const name = agent.label || agent.id || "Agente";

    if (info.type === "shortest-path") {
      modelInfoEl.innerHTML = `
        <div style="font-weight:600; margin-bottom:4px;">Modelo de decisión</div>
        <div>Agente: ${name}</div>
        <div>Tipo: búsqueda de ruta más corta (BFS sobre calles)</div>
        <div>Objetivo actual: ${info.goalId || "sin objetivo"}</div>
        <div>Longitud de ruta: ${info.pathLength ?? 0}</div>
        <div>Pasos restantes estimados: ${info.remainingSteps ?? 0}</div>
      `;
      return;
    }

    // Q-Learning
    modelInfoEl.innerHTML = `
      <div style="font-weight:600; margin-bottom:4px;">Modelo de decisión</div>
      <div>Agente: ${name}</div>
      <div>Tipo: Q-Learning tabular</div>
      <div>Objetivo actual: ${info.goalId || "sin objetivo"}</div>
      <div>Episodios: ${info.episodes}</div>
      <div>Paso actual del episodio: ${info.episodeSteps}</div>
      <div>Total de pasos: ${info.totalSteps}</div>
      <div style="margin-top:6px; font-size:10px; opacity:0.75;">
        La capa de colores en la ciudad muestra la política aprendida:
        color = valor de Q, flecha = mejor acción desde cada calle.
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

  // Carro con cerebro de ruta más corta
  const carBrain = new CarShortestPathBrain(city, {
    defaultGoalId: "home",
  });
  const car = new CarAgent(city, engine.scene, carBrain, {
    speed: 7,
  });
  car.id = "car-1";
  car.label = "Carro 1";
  agents.push(car);

  // Cerebro Q-Learning para el walker
  // Cerebro Q-Learning del peatón (solo ruta tienda ↔ casa)
  const walkerBrain = new QLearningBrain(city, {
    alpha: 0.4,
    gamma: 0.9,
    epsilon: 0.3,
    epsilonMin: 0.02,
    epsilonDecay: 0.99,
    maxEpisodeStats: 80,
    maxEpisodeSteps: 60,
  });

  // Overlay de política (flechas sobre las calles según Q-Learning)
  const policyOverlay = new PolicyOverlay(city, engine.scene);
  let lastPolicyEpisode = 0;

  // Nodo inicial del muñequito: entrada de la casa (si existe)
  const homePOI = city.pointsOfInterest?.home;
  const walkerStartRoad =
    homePOI?.entranceRoad || { gridX: 9, gridZ: 7 };

  // Agente peatón con cerebro de Q-Learning
  const walker = new WalkerAgent(
    city,
    engine.scene,
    walkerBrain,
    {
      speed: 2.2,
      startRoad: walkerStartRoad,
    }
  );
  walker.id = "walker-1";
  walker.label = "Peatón 1";
  agents.push(walker);

  // Solo dos objetivos: tienda ↔ casa
  let walkerGoal = "shop";
  let tripsToShop = 0;
  let tripsToHome = 0;

  walker.setGoal(walkerGoal);
  policyOverlay.updateFromBrain(walkerBrain, walkerGoal);

  // Estado de la misión del carro
  let carGoal = "home";
  let carTripsToShop = 0;
  let carTripsToHome = 0;
  carBrain.setGoal(carGoal, car.getCurrentRoadNode());

  // Función para actualizar el HUD según el agente seleccionado
  function updateStatusForAgent(agent) {
    if (!agent) {
      statusEl.textContent = "Ningún agente seleccionado";
      return;
    }

    const name = agent.label || agent.id || "Agente";

    if (agent === walker) {
      const goalText =
        walkerGoal === "shop"
          ? "Ir a la tienda"
          : "Regresar a casa";

      statusEl.textContent =
        `Agente: ${name} | Objetivo actual: ${goalText} ` +
        `| Viajes a tienda: ${tripsToShop} | Viajes a casa: ${tripsToHome}`;
    } else if (agent === car) {
      const goalText =
        carGoal === "shop"
          ? "Ir a la tienda"
          : "Regresar a casa";

      statusEl.textContent =
        `Agente: ${name} | Objetivo actual: ${goalText} ` +
        `| Viajes a tienda: ${carTripsToShop} | Viajes a casa: ${carTripsToHome}`;
    } else {
      statusEl.textContent = `Agente: ${name} (sin objetivo definido)`;
    }
  }

  // ================= Dropdown de agentes =================
  const agentSelect = document.createElement("select");
  agentSelect.style.position = "absolute";
  agentSelect.style.top = "10px";
  agentSelect.style.left = "10px";
  agentSelect.style.padding = "4px 6px";
  agentSelect.style.background = "rgba(0,0,0,0.7)";
  agentSelect.style.color = "#fff";
  agentSelect.style.border = "1px solid rgba(255,255,255,0.3)";
  agentSelect.style.borderRadius = "4px";
  agentSelect.style.fontSize = "12px";
  agentSelect.style.fontFamily =
    "system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  agentSelect.style.zIndex = "10";

  const optNone = document.createElement("option");
  optNone.value = "";
  optNone.textContent = "Selecciona un agente...";
  agentSelect.appendChild(optNone);

  agents.forEach((agent) => {
    const opt = document.createElement("option");
    opt.value = agent.id;
    opt.textContent = agent.label || agent.id;
    agentSelect.appendChild(opt);
  });

  container.appendChild(agentSelect);

  // ================= Raycaster + foco =================
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  let focusedAgent = null;
  let focusMode = "none"; // 'none' | 'hover' | 'select'

  agentSelect.addEventListener("change", () => {
    const id = agentSelect.value;

    if (!id) {
      focusedAgent = null;
      focusMode = "none";
      sidePanel.style.display = "none";

      if (chartCtx) {
        chartCtx.clearRect(
          0,
          0,
          chartCanvas.width,
          chartCanvas.height
        );
      }
      modelInfoEl.textContent = "";
      updateStatusForAgent(null);
      return;
    }

    const agent = agents.find((a) => a.id === id);
    if (!agent) return;

    focusedAgent = agent;
    focusMode = "select";
    sidePanel.style.display = "block";
    updateStatusForAgent(agent);
  });

  // Hover solo controla foco cuando NO hay selección manual
  container.addEventListener("mousemove", (event) => {
    if (focusMode === "select") return;

    const rect = container.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;

    mouse.x = (localX / rect.width) * 2 - 1;
    mouse.y = -(localY / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, engine.camera);

    // Por ahora solo hacemos hover sobre el walker
    const intersects = raycaster.intersectObject(
      walker.object3D,
      true
    );

    if (intersects.length > 0) {
      focusedAgent = walker;
      focusMode = "hover";
      sidePanel.style.display = "block";
      updateStatusForAgent(walker);
    } else if (focusMode === "hover") {
      focusedAgent = null;
      focusMode = "none";
      sidePanel.style.display = "none";
      updateStatusForAgent(null);
    }
  });

  // ================= Loop principal =================
  const SIM_SPEED = 20;

  engine.onUpdate((dt) => {
    const scaledDt = dt * SIM_SPEED;

    agents.forEach((agent) => agent.update(scaledDt));

    // Walker: cambio de meta home <-> shop
    const walkerPoi = city.pointsOfInterest?.[walkerGoal];
    if (walkerPoi && walker.isAtPOI(walkerPoi)) {
      if (walkerGoal === "shop") {
        tripsToShop += 1;
        walkerGoal = "home";
      } else {
        tripsToHome += 1;
        walkerGoal = "shop";
      }
      walker.setGoal(walkerGoal);

      if (focusedAgent === walker) {
        updateStatusForAgent(walker);
      }
    }

    // Carro: cambio de meta home <-> shop
    const carPoi = city.pointsOfInterest?.[carGoal];
    if (carPoi && car.isAtPOI(carPoi)) {
      if (carGoal === "shop") {
        carTripsToShop += 1;
        carGoal = "home";
      } else {
        carTripsToHome += 1;
        carGoal = "shop";
      }
      carBrain.setGoal(carGoal, car.getCurrentRoadNode());

      if (focusedAgent === car) {
        updateStatusForAgent(car);
      }
    }

    // Actualizar panel para el agente enfocado (si tiene brain)
    if (
      focusedAgent &&
      focusedAgent.brain &&
      typeof focusedAgent.brain.getDebugInfo === "function"
    ) {
      const brain = focusedAgent.brain;
      const info = brain.getDebugInfo();

      drawLearningChart(info);
      updateModelInfo(info, focusedAgent);

      // Solo el Q-Learning actualiza el overlay de política
      if (brain instanceof QLearningBrain) {
        if (info.episodes !== lastPolicyEpisode) {
          policyOverlay.updateFromBrain(brain, walkerGoal);
          lastPolicyEpisode = info.episodes;
        }
      }
    }

    // Cámara siguiendo al agente si hay foco
    if (focusedAgent) {
      const targetPos = focusedAgent.getWorldPosition(
        new THREE.Vector3()
      );

      const offset = new THREE.Vector3(16, 22, 18);
      const camTargetPos = targetPos.clone().add(offset);

      engine.camera.position.lerp(camTargetPos, 0.12);

      const lookAt = new THREE.Vector3(
        targetPos.x,
        targetPos.y + 1.2,
        targetPos.z
      );

      if (engine.controls) {
        engine.controls.target.lerp(lookAt, 0.2);
      } else {
        engine.camera.lookAt(lookAt);
      }
    }
    // ... dentro de engine.onUpdate(dt) DESPUÉS de actualizar al walker ...

    const info = walkerBrain.getDebugInfo();
    if (info.episodes !== lastPolicyEpisode) {
      policyOverlay.updateFromBrain(walkerBrain, walkerGoal);
      lastPolicyEpisode = info.episodes;
    }

  });

  engine.start();

  // window.__CITY3D__ = { engine, city, agents, walkerBrain, carBrain, policyOverlay };
});