// src/main.js
import { createEngine } from "./core/engine.js";
import { createCity, applyCityState } from "./city/cityScene.js";
import { CarAgent } from "./agents/CarAgent.js";
import { WalkerAgent } from "./agents/WalkerAgent.js";
import { ShortestPathBrain } from "./agents/brains/ShortestPathBrain.js";

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("app");

  if (!container) {
    throw new Error("No se encontró el contenedor #app");
  }

  const engine = createEngine(container);
  const city = createCity(engine.scene);

  const initialState = {
    buildingHeightMultiplier: 1,
    skyColor: "#5f9df3",     // 👈 SIN "ff"
    cityGlowIntensity: 0.7,
  };

  applyCityState(city, initialState, engine.scene);

  const agents = [];

  // 🚗 Carrito sigue igual
  const car = new CarAgent(city, engine.scene, { speed: 7 });
  agents.push(car);

  // 🧠 Cerebro del muñequito (ruta más corta)
  const walkerBrain = new ShortestPathBrain(city);

  // Nodo inicial del muñequito: entrada de la casa (si existe)
  const homePOI = city.pointsOfInterest?.home;
  const walkerStartRoad =
    homePOI?.entranceRoad || { gridX: 9, gridZ: 7 }; // fallback por si acaso

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

  // 🎯 Meta inicial: ir a la tienda
  let currentGoal = "shop";
  walker.setGoal(currentGoal);

  engine.onUpdate((dt) => {
    // actualizar todos los agentes
    agents.forEach((agent) => agent.update(dt));

    // lógica de cambio de meta para el muñequito
    const poi = city.pointsOfInterest?.[currentGoal];
    if (poi && walker.isAtPOI(poi)) {
      // cuando llega, alterna entre tienda y casa
      currentGoal = currentGoal === "shop" ? "home" : "shop";
      walker.setGoal(currentGoal);
    }
  });

  engine.start();

  // Debug opcional en consola
  // window.__CITY3D__ = { engine, city, agents, walkerBrain };
});