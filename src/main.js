// src/main.js
import { createEngine } from "./core/engine.js";
import { createCity, applyCityState } from "./city/cityScene.js";
import { CarAgent } from "./agents/CarAgent.js";
import { WalkerAgent } from "./agents/WalkerAgent.js";

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("app");

  if (!container) {
    throw new Error("No se encontró el contenedor #app");
  }

  const engine = createEngine(container);
  const city = createCity(engine.scene);

  const initialState = {
    buildingHeightMultiplier: 1,
    skyColor: "#6ca9ff",
    cityGlowIntensity: 0.7,
  };

  applyCityState(city, initialState, engine.scene);

  const agents = [];

  const car = new CarAgent(city, engine.scene, { speed: 7 });
  agents.push(car);

  const walker = new WalkerAgent(city, engine.scene, { speed: 2.2 });
  agents.push(walker);

  engine.onUpdate((dt) => {
    agents.forEach((agent) => agent.update(dt));
  });

  engine.start();

  // window.__CITY3D__ = { engine, city, agents };
});