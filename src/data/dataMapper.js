// src/data/dataMapper.js
import { mappingConfig } from "../config/mappingConfig.js";

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mapMarketStateToColor(state) {
  switch (state) {
    case "bull":
      return "#1aff7a"; // verde
    case "bear":
      return "#ff3b3b"; // rojo
    default:
      return "#4b6cff"; // azul neutro
  }
}

// Recibe métricas "crudas" y devuelve algo que la ciudad entiende
export function mapDataToCityState(metrics) {
  const { buildingHeight, skyColor, cityGlow } = mappingConfig;

  const tPrice = clamp01(metrics[buildingHeight.metric] ?? 0.5);
  const tVolume = clamp01(metrics[cityGlow.metric] ?? 0.3);

  const buildingHeightMultiplier = lerp(
    buildingHeight.minMultiplier,
    buildingHeight.maxMultiplier,
    tPrice
  );

  const skyColorValue = mapMarketStateToColor(
    metrics[skyColor.metric] ?? "neutral"
  );

  const cityGlowIntensity = lerp(cityGlow.min, cityGlow.max, tVolume);

  return {
    buildingHeightMultiplier,
    skyColor: skyColorValue,
    cityGlowIntensity,
  };
}