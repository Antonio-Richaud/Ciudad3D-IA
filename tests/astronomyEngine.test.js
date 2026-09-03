import test from "node:test";
import assert from "node:assert/strict";
import * as Astronomy from "astronomy-engine";

const observer = new Astronomy.Observer(19.0414, -98.2063, 2140);

function getHorizontal(body, date) {
  const equatorial = Astronomy.Equator(body, date, observer, true, true);
  return Astronomy.Horizon(
    date,
    observer,
    equatorial.ra,
    equatorial.dec,
    "normal"
  );
}

test("Sun is above Puebla horizon around local midday", () => {
  const horizontal = getHorizontal(
    Astronomy.Body.Sun,
    new Date("2026-09-03T18:00:00Z")
  );

  assert.ok(horizontal.altitude > 55);
  assert.ok(horizontal.altitude <= 90);
});

test("Sun is below Puebla horizon around local midnight", () => {
  const horizontal = getHorizontal(
    Astronomy.Body.Sun,
    new Date("2026-09-04T06:00:00Z")
  );

  assert.ok(horizontal.altitude < -30);
});

test("Venus illumination exposes a physical phase and apparent magnitude", () => {
  const illumination = Astronomy.Illumination(
    Astronomy.Body.Venus,
    new Date("2026-09-03T18:00:00Z")
  );

  assert.ok(illumination.phase_fraction >= 0);
  assert.ok(illumination.phase_fraction <= 1);
  assert.ok(Number.isFinite(illumination.mag));
});

test("real equatorial coordinates transform to a finite local horizon", () => {
  const horizontal = getHorizontal(
    Astronomy.Body.Moon,
    new Date("2026-09-03T18:00:00Z")
  );

  assert.ok(Number.isFinite(horizontal.azimuth));
  assert.ok(Number.isFinite(horizontal.altitude));
  assert.ok(horizontal.azimuth >= 0 && horizontal.azimuth < 360);
  assert.ok(horizontal.altitude >= -90 && horizontal.altitude <= 90);
});

test("J2000 stellar vectors rotate into the observer horizon", () => {
  const time = new Astronomy.AstroTime(new Date("2026-09-03T18:00:00Z"));
  const rotation = Astronomy.Rotation_EQJ_HOR(time, observer);

  // Sirius: vector unitario aproximado desde sus coordenadas J2000.
  const ra = (6.7525 * 15 * Math.PI) / 180;
  const dec = (-16.7161 * Math.PI) / 180;
  const source = new Astronomy.Vector(
    Math.cos(dec) * Math.cos(ra),
    Math.cos(dec) * Math.sin(ra),
    Math.sin(dec),
    time
  );
  const rotated = Astronomy.RotateVector(rotation, source);
  const horizontal = Astronomy.HorizonFromVector(rotated, "normal");

  assert.ok(Number.isFinite(horizontal.lon));
  assert.ok(Number.isFinite(horizontal.lat));
  assert.ok(horizontal.lon >= 0 && horizontal.lon < 360);
  assert.ok(horizontal.lat >= -90 && horizontal.lat <= 90);
});
