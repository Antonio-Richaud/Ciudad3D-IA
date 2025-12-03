// src/main.js
import { createEngine } from "./core/engine.js";
import { createCity, applyCityState } from "./city/cityScene.js";
import { CarAgent } from "./agents/CarAgent.js";
import { WalkerAgent } from "./agents/WalkerAgent.js";
import { QLearningBrain } from "./agents/brains/QLearningBrain.js";

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("app");

  if (!container) {
    throw new Error("No se encontró el contenedor #app");
  }

  const engine = createEngine(container);
  const city = createCity(engine.scene);

  // HUD simple para estado del muñequito
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

  const initialState = {
    buildingHeightMultiplier: 1,
    skyColor: "#5f9df3", // sin alpha
    cityGlowIntensity: 0.7,
  };

  applyCityState(city, initialState, engine.scene);

  const agents = [];

  // 🚗 Carrito
  const car = new CarAgent(city, engine.scene, { speed: 7 });
  agents.push(car);

  // 🧠 Cerebro del muñequito (ruta más corta)
  // const walkerBrain = new ShortestPathBrain(city);
  const walkerBrain = new QLearningBrain(city, {
    alpha: 0.2,
    gamma: 0.95,
    epsilon: 0.4,
    epsilonMin: 0.05,
    epsilonDecay: 0.995,
  });

  // Nodo inicial del muñequito: entrada de la casa (si existe)
  const homePOI = city.pointsOfInterest?.home;
  const walkerStartRoad =
    homePOI?.entranceRoad || { gridX: 9, gridZ: 7 }; // fallback por si acaso

  // 🚶 Muñequito con brain
  const walker = new WalkerAgent(city, engine.scene, walkerBrain, {
    speed: 2.2,
    startRoad: walkerStartRoad,
  });
  agents.push(walker);

  // 🎯 Estado de la misión
  let currentGoal = "shop";
  let tripsToShop = 0;
  let tripsToHome = 0;

  walker.setGoal(currentGoal);
  updateStatus("Objetivo: ir a la tienda");

  engine.onUpdate((dt) => {
    agents.forEach((agent) => agent.update(dt));

    const poi = city.pointsOfInterest?.[currentGoal];
    if (poi && walker.isAtPOI(poi)) {
      if (currentGoal === "shop") {
        tripsToShop += 1;
        currentGoal = "home";
        walker.setGoal(currentGoal);
        updateStatus(
          `Llegó a la tienda (${tripsToShop} veces). Nuevo objetivo: regresar a casa`
        );
      } else {
        tripsToHome += 1;
        currentGoal = "shop";
        walker.setGoal(currentGoal);
        updateStatus(
          `Llegó a casa (${tripsToHome} veces). Nuevo objetivo: ir a la tienda`
        );
      }
    }
  });

  engine.start();

  // Debug opcional
  // window.__CITY3D__ = { engine, city, agents, walkerBrain };
});