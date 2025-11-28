// src/data/sources/dummyDataSource.js

let step = 0;

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

export class DummyDataSource {
  async init() {
    step = 0;
  }

  async fetchData() {
    step += 1;

    // Oscilaciones suaves tipo "onda"
    const price = clamp01(0.5 + 0.4 * Math.sin(step / 5));
    const volume = clamp01(0.5 + 0.5 * Math.sin(step / 7 + 1));
    const users_online = clamp01(0.5 + 0.5 * Math.cos(step / 9));

    let market_state = "neutral";
    if (price > 0.7) market_state = "bull";
    else if (price < 0.3) market_state = "bear";

    return {
      price,
      volume,
      users_online,
      market_state,
    };
  }
}