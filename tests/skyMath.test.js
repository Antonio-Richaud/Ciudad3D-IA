import test from "node:test";
import assert from "node:assert/strict";

import {
  apparentAngularRadius,
  equatorialToUnitVector,
  getDaylightFactor,
  getNightFactor,
  getTwilightPhase,
  horizontalToWorld,
} from "../src/sky/skyMath.js";

test("horizontal coordinates preserve cardinal directions in Three.js world", () => {
  const north = horizontalToWorld(0, 0, 10);
  const east = horizontalToWorld(90, 0, 10);
  const zenith = horizontalToWorld(0, 90, 10);

  assert.ok(Math.abs(north.x) < 1e-9);
  assert.ok(Math.abs(north.z + 10) < 1e-9);
  assert.ok(Math.abs(east.x - 10) < 1e-9);
  assert.ok(Math.abs(east.z) < 1e-9);
  assert.ok(Math.abs(zenith.y - 10) < 1e-9);
});

test("twilight phases follow standard civil, nautical and astronomical limits", () => {
  assert.equal(getTwilightPhase(12), "day");
  assert.equal(getTwilightPhase(-3), "civil-twilight");
  assert.equal(getTwilightPhase(-8), "nautical-twilight");
  assert.equal(getTwilightPhase(-15), "astronomical-twilight");
  assert.equal(getTwilightPhase(-22), "night");
});

test("daylight and night factors transition monotonically around the horizon", () => {
  assert.ok(getDaylightFactor(25) > getDaylightFactor(0));
  assert.ok(getDaylightFactor(0) > getDaylightFactor(-12));
  assert.ok(getNightFactor(-25) > getNightFactor(-8));
  assert.ok(getNightFactor(-8) > getNightFactor(5));
});

test("equatorial unit vectors remain normalized", () => {
  const vector = equatorialToUnitVector(6.7525, -16.7161);
  const length = Math.hypot(vector.x, vector.y, vector.z);
  assert.ok(Math.abs(length - 1) < 1e-12);
});

test("apparent angular radius scales inversely with distance", () => {
  const near = apparentAngularRadius(1737.4, 0.0024);
  const far = apparentAngularRadius(1737.4, 0.0028);
  assert.ok(near > far);
  assert.ok(near > 0);
});
