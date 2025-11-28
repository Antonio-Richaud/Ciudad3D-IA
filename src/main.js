// src/main.js
import { createEngine } from "./core/engine.js";
import { createCity } from "./city/cityScene.js";

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("app");

  if (!container) {
    throw new Error("No se encontró el contenedor #app");
  }

  const engine = createEngine(container);
  createCity(engine.scene);

  engine.start();
});