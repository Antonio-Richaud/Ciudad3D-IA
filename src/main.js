// src/main.js
import { createEngine } from "./core/engine.js";
import { createCity, applyCityState } from "./city/cityScene.js";

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("app");

  if (!container) {
    throw new Error("No se encontró el contenedor #app");
  }

  const engine = createEngine(container);
  const city = createCity(engine.scene);

  const initialState = {
    buildingHeightMultiplier: 1,
    skyColor: "#6ca9ff",    // cielo más azulito
    cityGlowIntensity: 0.7, // ventanitas un poco más brillantes
  };

  applyCityState(city, initialState, engine.scene);

  engine.start();

  // Debug en consola si quieres inspeccionar la ciudad:
  // window.__CITY3D__ = { engine, city };
});