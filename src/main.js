// src/main.js
import { createEngine } from "./core/engine.js";
import { createCity, applyCityState } from "./city/cityScene.js";
import { CarAgent } from "./agents/CarAgent.js";
import { WalkerAgent } from "./agents/WalkerAgent.js";
import { QLearningBrain } from "./agents/brains/QLearningBrain.js";
// Si quieres seguir usando el brain clásico, cambia la línea de arriba
// por: import { ShortestPathBrain } from "./agents/brains/ShortestPathBrain.js";

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("app");

  if (!container) {
    throw new Error("No se encontró el contenedor #app");
  }

  const engine = createEngine(container);
  const city = createCity(engine.scene);

  // HUD simple para estado del muñequito (abajo izquierda)
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

  // Canvas para la gráfica (abajo derecha)
  const chartCanvas = document.createElement("canvas");
  chartCanvas.id = "learning-chart";
  chartCanvas.width = 240;
  chartCanvas.height = 140;
  chartCanvas.style.position = "absolute";
  chartCanvas.style.right = "10px";
  chartCanvas.style.bottom = "10px";
  chartCanvas.style.background = "rgba(0,0,0,0.6)";
  chartCanvas.style.borderRadius = "8px";
  chartCanvas.style.pointerEvents = "none";
  container.appendChild(chartCanvas);
  const chartCtx = chartCanvas.getContext("2d");

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
      ctx.fillText("Esperando episodios...", 10, 28);
      return;
    }

    const padding = 24;
    const innerW = w - padding * 2;
    const innerH = h - padding * 2;

    // Eje X: episodio (últimos N)
    // Eje Y: número de pasos (queremos ver si baja)
    const stepsArr = stats.map((s) => s.steps);
    const minSteps = Math.min(...stepsArr);
    const maxSteps = Math.max(...stepsArr);
    const range = Math.max(1, maxSteps - minSteps);

    // Ejes
    ctx.strokeStyle = "#888888";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, h - padding);
    ctx.lineTo(w - padding, h - padding);
    ctx.stroke();

    // Curva de pasos
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

    // Info de epsilon y episodios
    ctx.fillStyle = "#cccccc";
    ctx.font = "9px system-ui, -apple-system";
    ctx.fillText(
      `eps: ${info.epsilon.toFixed(3)}  ep: ${info.episodes}`,
      10,
      h - 8
    );
  };

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
    alpha: 0.25,
    gamma: 0.95,
    epsilon: 0.4,
    epsilonMin: 0.05,
    epsilonDecay: 0.995,
    maxEpisodeStats: 80,
    maxEpisodeSteps: 120, 
  });

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
  updateStatus("Objetivo: ir a la tienda");

  const SIM_SPEED = 20; // 1 = tiempo real, 4 = 4x más rápido (ajusta al gusto)

  engine.onUpdate((dt) => {
    const scaledDt = dt * SIM_SPEED;

    agents.forEach((agent) => agent.update(scaledDt));

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

    if (walkerBrain && typeof walkerBrain.getDebugInfo === "function") {
      const info = walkerBrain.getDebugInfo();
      drawLearningChart(info);
    }
  });

  engine.start();

  // Debug opcional
  // window.__CITY3D__ = { engine, city, agents, walkerBrain };
});