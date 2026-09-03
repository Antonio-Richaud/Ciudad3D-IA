export const AU_KM = 149_597_870.7;

export const FALLBACK_OBSERVER = Object.freeze({
  latitude: 19.0414,
  longitude: -98.2063,
  height: 2140,
  label: "Puebla, México",
  source: "fallback",
});

export function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

export function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function getTwilightPhase(sunAltitudeDeg) {
  if (sunAltitudeDeg >= 0) return "day";
  if (sunAltitudeDeg >= -6) return "civil-twilight";
  if (sunAltitudeDeg >= -12) return "nautical-twilight";
  if (sunAltitudeDeg >= -18) return "astronomical-twilight";
  return "night";
}

export function getDaylightFactor(sunAltitudeDeg) {
  return smoothstep(-6, 12, sunAltitudeDeg);
}

export function getNightFactor(sunAltitudeDeg) {
  return 1 - smoothstep(-18, -4, sunAltitudeDeg);
}

export function getTwilightFactor(sunAltitudeDeg) {
  const rise = smoothstep(-18, -4, sunAltitudeDeg);
  const fall = 1 - smoothstep(-2, 14, sunAltitudeDeg);
  return clamp01(rise * fall);
}

// Three.js usa un sistema diestro con Y hacia arriba. Para mantener una
// convención geográfica coherente definimos +X = Este y -Z = Norte.
export function horizontalToWorld(azimuthDeg, altitudeDeg, radius = 1) {
  const az = (azimuthDeg * Math.PI) / 180;
  const alt = (altitudeDeg * Math.PI) / 180;
  const horizontal = Math.cos(alt) * radius;

  return {
    x: Math.sin(az) * horizontal,
    y: Math.sin(alt) * radius,
    z: -Math.cos(az) * horizontal,
  };
}

export function equatorialToUnitVector(raHours, decDeg) {
  const ra = (raHours * 15 * Math.PI) / 180;
  const dec = (decDeg * Math.PI) / 180;
  const cosDec = Math.cos(dec);

  return {
    x: cosDec * Math.cos(ra),
    y: cosDec * Math.sin(ra),
    z: Math.sin(dec),
  };
}

export function apparentAngularRadius(radiusKm, distanceAu) {
  if (!Number.isFinite(distanceAu) || distanceAu <= 0) return 0;
  const ratio = clamp01(radiusKm / (distanceAu * AU_KM));
  return Math.asin(ratio);
}

export function magnitudeToRelativeBrightness(magnitude) {
  if (!Number.isFinite(magnitude)) return 0;
  return Math.pow(10, -0.4 * magnitude);
}

export function getStarVisibility(sunAltitudeDeg, magnitude) {
  const magnitudeT = clamp01((magnitude + 1.5) / 4.5);
  const firstVisibleSunAltitude = -2.5 - magnitudeT * 4.5;
  return 1 - smoothstep(
    firstVisibleSunAltitude - 8,
    firstVisibleSunAltitude,
    sunAltitudeDeg
  );
}
