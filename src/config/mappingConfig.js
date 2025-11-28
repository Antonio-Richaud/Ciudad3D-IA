// Define cómo se conectan las métricas con la ciudad
export const mappingConfig = {
  buildingHeight: {
    metric: "price",        // métrica que controla altura
    minMultiplier: 0.6,     // mínimo factor de altura
    maxMultiplier: 1.8,     // máximo factor de altura
  },
  skyColor: {
    metric: "market_state", // bull / bear / neutral
  },
  cityGlow: {
    metric: "volume",       // controla el brillo de la ciudad
    min: 0.2,
    max: 1.0,
  },
};