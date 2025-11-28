// src/main.js
import { createEngine } from "./core/engine.js";
import { createCity, applyCityState } from "./city/cityScene.js";
import { createDataSource } from "./data/index.js";
import { mapDataToCityState } from "./data/dataMapper.js";

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("app");

  if (!container) {
    throw new Error("No se encontró el contenedor #app");
  }

  (async () => {
    const engine = createEngine(container);
    const city = createCity(engine.scene);

    const dataSource = createDataSource("dummy");
    await dataSource.init();

    async function updateData() {
      try {
        const metrics = await dataSource.fetchData();
        const cityState = mapDataToCityState(metrics);
        applyCityState(city, cityState, engine.scene);

        // Debug opcional
        // console.log("metrics:", metrics, "cityState:", cityState);
      } catch (err) {
        console.error("Error actualizando datos:", err);
      }
    }

    // Primera actualización inmediata
    await updateData();

    // Actualizar cada 3 segundos
    setInterval(updateData, 3000);

    engine.start();
  })();
});