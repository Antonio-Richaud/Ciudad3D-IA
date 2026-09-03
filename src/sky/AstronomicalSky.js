import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import * as Astronomy from "astronomy-engine";

import { BRIGHT_STARS } from "./starCatalog.js";
import {
  FALLBACK_OBSERVER,
  apparentAngularRadius,
  clamp01,
  equatorialToUnitVector,
  getDaylightFactor,
  getNightFactor,
  getTwilightFactor,
  getTwilightPhase,
  horizontalToWorld,
  magnitudeToRelativeBrightness,
  smoothstep,
} from "./skyMath.js";

const SKY_DISTANCE = 1_600;
const STAR_DISTANCE = 680;
const PLANET_DISTANCE = 640;
const SUN_DISTANCE = 610;
const MOON_DISTANCE = 590;
const SUN_RADIUS_KM = 695_700;
const MOON_RADIUS_KM = 1_737.4;
const ASTRONOMY_UPDATE_SECONDS = 1;

const PLANETS = Object.freeze([
  { key: "Mercury", body: Astronomy.Body.Mercury, color: 0xd9d0c1 },
  { key: "Venus", body: Astronomy.Body.Venus, color: 0xfff3c4 },
  { key: "Mars", body: Astronomy.Body.Mars, color: 0xff9b70 },
  { key: "Jupiter", body: Astronomy.Body.Jupiter, color: 0xffe0b3 },
  { key: "Saturn", body: Astronomy.Body.Saturn, color: 0xf3d89b },
]);

const PHASE_LABELS = Object.freeze({
  day: "Día",
  "civil-twilight": "Crepúsculo civil",
  "nautical-twilight": "Crepúsculo náutico",
  "astronomical-twilight": "Crepúsculo astronómico",
  night: "Noche",
});

function colorTexture(size = 128) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.15, "rgba(255,255,255,0.95)");
  gradient.addColorStop(0.5, "rgba(255,255,255,0.28)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function cloudTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const puffs = [
    [74, 72, 48],
    [110, 55, 56],
    [148, 65, 50],
    [182, 78, 37],
    [126, 83, 62],
  ];

  for (const [x, y, r] of puffs) {
    const gradient = ctx.createRadialGradient(x, y, 2, x, y, r);
    gradient.addColorStop(0, "rgba(255,255,255,0.95)");
    gradient.addColorStop(0.58, "rgba(255,255,255,0.68)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0xffffffff;
  };
}

function setObjectDirection(object, horizontal, distance) {
  const world = horizontalToWorld(
    horizontal.azimuth,
    horizontal.altitude,
    distance
  );
  object.position.set(world.x, world.y, world.z);
  return new THREE.Vector3(world.x, world.y, world.z).normalize();
}

function createMoonMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      sunDirection: { value: new THREE.Vector3(0, 1, 0) },
      moonColor: { value: new THREE.Color(0xf4f1e5) },
      earthshine: { value: 0.035 },
    },
    vertexShader: `
      varying vec3 vWorldNormal;

      void main() {
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 sunDirection;
      uniform vec3 moonColor;
      uniform float earthshine;
      varying vec3 vWorldNormal;

      void main() {
        float lit = smoothstep(-0.018, 0.018, dot(normalize(vWorldNormal), normalize(sunDirection)));
        vec3 darkSide = vec3(0.025, 0.03, 0.045) * earthshine * 8.0;
        vec3 color = mix(darkSide, moonColor, lit);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    toneMapped: false,
  });
}

function bodyHorizontal(body, date, observer) {
  const equatorial = Astronomy.Equator(body, date, observer, true, true);
  const horizontal = Astronomy.Horizon(
    date,
    observer,
    equatorial.ra,
    equatorial.dec,
    "normal"
  );
  const geometric = Astronomy.Horizon(
    date,
    observer,
    equatorial.ra,
    equatorial.dec,
    null
  );

  return { equatorial, horizontal, geometric };
}

function illuminationFor(body, date) {
  try {
    return Astronomy.Illumination(body, date);
  } catch {
    return null;
  }
}

export class AstronomicalSky {
  constructor({ engine, container }) {
    this.engine = engine;
    this.scene = engine.scene;
    this.container = container;

    // Todo el firmamento sigue la posición de la cámara para mantener distancia
    // angular infinita y evitar paralaje artificial al recorrer la ciudad.
    this.celestialRoot = new THREE.Group();
    this.celestialRoot.name = "celestial-sphere";
    this.scene.add(this.celestialRoot);

    this.observerInfo = { ...FALLBACK_OBSERVER };
    this.observer = new Astronomy.Observer(
      this.observerInfo.latitude,
      this.observerInfo.longitude,
      this.observerInfo.height
    );
    this.elapsedSinceAstronomyUpdate = Infinity;
    this.state = null;
    this.solarEvents = null;
    this.solarEventsKey = null;

    this.createAtmosphere();
    this.createSun();
    this.createMoon();
    this.createPlanets();
    this.createStars();
    this.createClouds();
    this.createHud();

    this.updateAstronomy(new Date());
    this.requestGeolocation();
  }

  createAtmosphere() {
    this.scene.background = new THREE.Color(0x02040b);

    this.sky = new Sky();
    this.sky.scale.setScalar(SKY_DISTANCE);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1000;
    this.celestialRoot.add(this.sky);

    const uniforms = this.sky.material.uniforms;
    uniforms.turbidity.value = 7.5;
    uniforms.rayleigh.value = 1.8;
    uniforms.mieCoefficient.value = 0.004;
    uniforms.mieDirectionalG.value = 0.82;
  }

  createSun() {
    const geometry = new THREE.SphereGeometry(1, 32, 20);
    const material = new THREE.MeshBasicMaterial({
      color: 0xfff2cd,
      toneMapped: false,
    });
    this.sun = new THREE.Mesh(geometry, material);
    this.sun.frustumCulled = false;
    this.sun.renderOrder = 10;
    this.celestialRoot.add(this.sun);

    this.sunGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: colorTexture(),
        color: 0xffc36b,
        transparent: true,
        opacity: 0.68,
        depthWrite: false,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.sunGlow.frustumCulled = false;
    this.sunGlow.renderOrder = 9;
    this.celestialRoot.add(this.sunGlow);
  }

  createMoon() {
    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(1, 40, 24),
      createMoonMaterial()
    );
    this.moon.frustumCulled = false;
    this.moon.renderOrder = 20;
    this.celestialRoot.add(this.moon);
  }

  createPlanets() {
    this.planetTexture = colorTexture(64);
    this.planets = new Map();

    for (const definition of PLANETS) {
      const material = new THREE.SpriteMaterial({
        map: this.planetTexture,
        color: definition.color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      sprite.frustumCulled = false;
      sprite.renderOrder = 15;
      this.celestialRoot.add(sprite);
      this.planets.set(definition.key, { definition, sprite, state: null });
    }
  }

  createStars() {
    const layerDefinitions = [
      { maxMagnitude: 0.5, size: 3.4 },
      { maxMagnitude: 1.4, size: 2.7 },
      { maxMagnitude: 2.2, size: 2.0 },
      { maxMagnitude: Infinity, size: 1.4 },
    ];

    let previousMagnitude = -Infinity;
    this.starLayers = layerDefinitions.map((layerDefinition) => {
      const stars = BRIGHT_STARS.filter(
        (star) =>
          star.mag > previousMagnitude &&
          star.mag <= layerDefinition.maxMagnitude
      ).map((star) => ({
        star,
        eqj: equatorialToUnitVector(star.ra, star.dec),
      }));
      previousMagnitude = layerDefinition.maxMagnitude;

      const positions = new Float32Array(stars.length * 3);
      const colors = new Float32Array(stars.length * 3);
      const color = new THREE.Color();

      stars.forEach(({ star }, index) => {
        color.set(star.color);
        colors[index * 3] = color.r;
        colors[index * 3 + 1] = color.g;
        colors[index * 3 + 2] = color.b;
      });

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

      const material = new THREE.PointsMaterial({
        size: layerDefinition.size,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        vertexColors: true,
        toneMapped: false,
      });

      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false;
      points.renderOrder = 5;
      this.celestialRoot.add(points);

      return { ...layerDefinition, stars, geometry, material, points };
    });
  }

  createClouds() {
    this.cloudTexture = cloudTexture();
    this.clouds = [];
    const random = seededRandom(0x51c1dad);

    for (let index = 0; index < 14; index++) {
      const material = new THREE.SpriteMaterial({
        map: this.cloudTexture,
        color: 0xffffff,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        toneMapped: false,
      });
      const cloud = new THREE.Sprite(material);
      cloud.position.set(
        (random() - 0.5) * 300,
        58 + random() * 48,
        (random() - 0.5) * 300
      );
      const width = 30 + random() * 38;
      cloud.scale.set(width, width * (0.32 + random() * 0.12), 1);
      cloud.userData.velocityX = 0.35 + random() * 0.28;
      cloud.userData.velocityZ = (random() - 0.5) * 0.12;
      cloud.renderOrder = 25;
      cloud.frustumCulled = false;
      this.scene.add(cloud);
      this.clouds.push(cloud);
    }
  }

  createHud() {
    if (!this.container) return;

    this.hud = document.createElement("div");
    this.hud.id = "real-sky-status";
    this.hud.style.position = "absolute";
    this.hud.style.left = "10px";
    this.hud.style.top = "48px";
    this.hud.style.padding = "7px 10px";
    this.hud.style.background = "rgba(5, 9, 18, 0.62)";
    this.hud.style.backdropFilter = "blur(6px)";
    this.hud.style.border = "1px solid rgba(255,255,255,0.12)";
    this.hud.style.borderRadius = "8px";
    this.hud.style.color = "#fff";
    this.hud.style.font = "11px/1.45 system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    this.hud.style.pointerEvents = "none";
    this.hud.style.zIndex = "8";
    this.hud.style.maxWidth = "310px";
    this.container.appendChild(this.hud);
  }

  requestGeolocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, altitude, accuracy } = position.coords;
        this.observerInfo = {
          latitude,
          longitude,
          height: Number.isFinite(altitude) ? altitude : 0,
          accuracy,
          label: "Ubicación GPS",
          source: "geolocation",
        };
        this.observer = new Astronomy.Observer(
          latitude,
          longitude,
          this.observerInfo.height
        );
        this.elapsedSinceAstronomyUpdate = Infinity;
        this.solarEventsKey = null;
      },
      () => {
        // El cielo continúa funcionando con Puebla como ubicación de respaldo.
      },
      {
        enableHighAccuracy: false,
        timeout: 7000,
        maximumAge: 6 * 60 * 60 * 1000,
      }
    );
  }

  update(deltaSeconds) {
    this.celestialRoot.position.copy(this.engine.camera.position);
    this.updateCloudMotion(deltaSeconds);
    this.elapsedSinceAstronomyUpdate += deltaSeconds;

    if (this.elapsedSinceAstronomyUpdate >= ASTRONOMY_UPDATE_SECONDS) {
      this.elapsedSinceAstronomyUpdate = 0;
      this.updateAstronomy(new Date());
    }
  }

  updateCloudMotion(deltaSeconds) {
    const limit = 185;

    for (const cloud of this.clouds) {
      cloud.position.x += cloud.userData.velocityX * deltaSeconds;
      cloud.position.z += cloud.userData.velocityZ * deltaSeconds;

      if (cloud.position.x > limit) cloud.position.x = -limit;
      if (cloud.position.x < -limit) cloud.position.x = limit;
      if (cloud.position.z > limit) cloud.position.z = -limit;
      if (cloud.position.z < -limit) cloud.position.z = limit;
    }
  }

  updateAstronomy(date) {
    const sunState = bodyHorizontal(Astronomy.Body.Sun, date, this.observer);
    const moonState = bodyHorizontal(Astronomy.Body.Moon, date, this.observer);
    const moonIllumination = illuminationFor(Astronomy.Body.Moon, date);
    // El crepúsculo se clasifica con la altura geométrica del centro
    // solar; la posición visual conserva refracción atmosférica.
    const sunAltitude = sunState.geometric.altitude;
    const daylight = getDaylightFactor(sunAltitude);
    const night = getNightFactor(sunAltitude);
    const twilight = getTwilightFactor(sunAltitude);
    const phase = getTwilightPhase(sunAltitude);
    this.updateSolarEvents(date);

    const sunDirection = this.updateSun(sunState);
    this.updateMoon(moonState, moonIllumination, sunDirection, night);
    this.updatePlanets(date, sunAltitude);
    this.updateStars(date, sunAltitude);
    this.updateAtmosphere({
      sunAltitude,
      daylight,
      night,
      twilight,
      sunDirection,
      moonState,
      moonIllumination,
    });

    this.state = {
      date,
      phase,
      observer: { ...this.observerInfo },
      solarEvents: this.solarEvents
        ? { ...this.solarEvents }
        : null,
      sun: {
        altitude: sunState.horizontal.altitude,
        azimuth: sunState.horizontal.azimuth,
      },
      moon: {
        altitude: moonState.horizontal.altitude,
        azimuth: moonState.horizontal.azimuth,
        phaseFraction: moonIllumination?.phase_fraction ?? 0,
      },
      planets: Object.fromEntries(
        [...this.planets.entries()].map(([key, planet]) => [key, planet.state])
      ),
    };

    this.updateHud();
  }

  updateSun(sunState) {
    const direction = setObjectDirection(
      this.sun,
      sunState.horizontal,
      SUN_DISTANCE
    );
    this.sunGlow.position.copy(this.sun.position);

    const angularRadius = apparentAngularRadius(
      SUN_RADIUS_KM,
      sunState.equatorial.dist
    );
    const worldRadius = SUN_DISTANCE * Math.sin(angularRadius);
    this.sun.scale.setScalar(Math.max(0.01, worldRadius));
    this.sunGlow.scale.setScalar(Math.max(4, worldRadius * 7.5));

    const angularRadiusDeg = THREE.MathUtils.radToDeg(angularRadius);
    // El disco aparece cuando su borde superior cruza el horizonte aparente.
    const visible = sunState.horizontal.altitude > -angularRadiusDeg;
    this.sun.visible = visible;
    this.sunGlow.visible = visible;

    return direction;
  }

  updateMoon(moonState, moonIllumination, sunDirection, nightFactor) {
    setObjectDirection(this.moon, moonState.horizontal, MOON_DISTANCE);

    const angularRadius = apparentAngularRadius(
      MOON_RADIUS_KM,
      moonState.equatorial.dist
    );
    const worldRadius = MOON_DISTANCE * Math.sin(angularRadius);
    this.moon.scale.setScalar(Math.max(0.01, worldRadius));
    const angularRadiusDeg = THREE.MathUtils.radToDeg(angularRadius);
    this.moon.visible = moonState.horizontal.altitude > -angularRadiusDeg;

    this.moon.material.uniforms.sunDirection.value.copy(sunDirection);
    const phase = moonIllumination?.phase_fraction ?? 0;
    this.moon.material.uniforms.earthshine.value =
      0.025 + nightFactor * (0.025 + (1 - phase) * 0.04);
  }

  updatePlanets(date, sunAltitude) {
    for (const [key, planet] of this.planets) {
      const { definition, sprite } = planet;
      const bodyState = bodyHorizontal(definition.body, date, this.observer);
      const illumination = illuminationFor(definition.body, date);
      const altitude = bodyState.horizontal.altitude;
      const magnitude = illumination?.mag ?? 6;
      const phaseFraction = illumination?.phase_fraction ?? 1;

      setObjectDirection(sprite, bodyState.horizontal, PLANET_DISTANCE);

      const altitudeVisibility = smoothstep(-1.5, 4, altitude);
      const daylightCutoff =
        key === "Venus"
          ? 1 - smoothstep(-4, 10, sunAltitude)
          : 1 - smoothstep(-8, 3, sunAltitude);
      const photometric = magnitudeToRelativeBrightness(magnitude);
      const brightness = clamp01(Math.log10(photometric + 1) / 1.15);
      const opacity = clamp01(
        altitudeVisibility * daylightCutoff * (0.34 + brightness * 0.66)
      );
      const apparentSize = 1.15 + brightness * 2.1;

      sprite.material.opacity = opacity;
      sprite.scale.set(apparentSize, apparentSize, 1);
      sprite.visible = opacity > 0.015;

      planet.state = {
        altitude,
        azimuth: bodyState.horizontal.azimuth,
        magnitude,
        phaseFraction,
        visible: sprite.visible,
      };
    }
  }

  updateStars(date, sunAltitude) {
    const astroTime = new Astronomy.AstroTime(date);
    const rotation = Astronomy.Rotation_EQJ_HOR(astroTime, this.observer);

    for (const layer of this.starLayers) {
      const positionAttribute = layer.geometry.getAttribute("position");

      layer.stars.forEach(({ star, eqj }, index) => {
        const source = new Astronomy.Vector(
          eqj.x,
          eqj.y,
          eqj.z,
          astroTime
        );
        const horizontalVector = Astronomy.RotateVector(rotation, source);
        const horizontal = Astronomy.HorizonFromVector(
          horizontalVector,
          "normal"
        );

        if (horizontal.lat <= -1.5) {
          positionAttribute.setXYZ(index, 0, -10_000, 0);
          return;
        }

        const world = horizontalToWorld(
          horizontal.lon,
          horizontal.lat,
          STAR_DISTANCE
        );
        positionAttribute.setXYZ(index, world.x, world.y, world.z);
      });

      positionAttribute.needsUpdate = true;
      const representativeMagnitude = Math.min(layer.maxMagnitude, 2.8);
      const visibility = getStarVisibility(
        sunAltitude,
        representativeMagnitude
      );
      layer.material.opacity = visibility * 0.92;
      layer.points.visible = visibility > 0.01;
    }
  }

  updateAtmosphere({
    sunAltitude,
    daylight,
    night,
    twilight,
    sunDirection,
    moonState,
    moonIllumination,
  }) {
    const uniforms = this.sky.material.uniforms;
    uniforms.sunPosition.value.copy(sunDirection);
    uniforms.turbidity.value = 5.5 + twilight * 5.5;
    uniforms.rayleigh.value = 0.08 + daylight * 2.0 + twilight * 0.55;
    uniforms.mieCoefficient.value = 0.003 + twilight * 0.005;
    uniforms.mieDirectionalG.value = 0.82;

    // Por debajo del crepúsculo astronómico el shader diurno deja paso a un
    // fondo nocturno neutro; así las estrellas mantienen contraste realista.
    this.sky.visible = sunAltitude > -18.5;

    const nightColor = new THREE.Color(0x02040c);
    const dayColor = new THREE.Color(0x6ca9ff);
    const sunsetColor = new THREE.Color(0xc66d4d);
    const background = nightColor.clone().lerp(dayColor, daylight);
    background.lerp(sunsetColor, twilight * 0.28);
    this.scene.background.copy(background);

    if (this.scene.fog) {
      const fogColor = background.clone().multiplyScalar(
        0.56 + daylight * 0.2
      );
      this.scene.fog.color.copy(fogColor);
    }

    const moonAbove = smoothstep(-1, 8, moonState.horizontal.altitude);
    const moonPhase = moonIllumination?.phase_fraction ?? 0;
    const moonlight = night * moonAbove * moonPhase;

    const { lights } = this.engine;
    if (lights?.sun) {
      lights.sun.position.copy(sunDirection).multiplyScalar(140);
      lights.sun.intensity = 1.45 * smoothstep(-3, 10, sunAltitude);
      const warm = new THREE.Color(0xff8b55);
      const neutral = new THREE.Color(0xfff3df);
      lights.sun.color.copy(
        warm.lerp(neutral, smoothstep(-1, 24, sunAltitude))
      );
    }

    if (lights?.hemisphere) {
      lights.hemisphere.intensity =
        0.08 + daylight * 0.78 + twilight * 0.13 + moonlight * 0.05;
      lights.hemisphere.color.copy(
        new THREE.Color(0x182440).lerp(
          new THREE.Color(0x88baff),
          daylight
        )
      );
      lights.hemisphere.groundColor.copy(
        new THREE.Color(0x070b0f).lerp(
          new THREE.Color(0x35543a),
          daylight
        )
      );
    }

    if (lights?.ambient) {
      lights.ambient.intensity =
        0.035 + daylight * 0.2 + twilight * 0.04 + moonlight * 0.04;
    }

    this.engine.renderer.toneMappingExposure =
      0.3 + daylight * 0.72 + twilight * 0.08 + moonlight * 0.035;

    const cloudDay = new THREE.Color(0xffffff);
    const cloudNight = new THREE.Color(0x4a5872);
    const cloudSunset = new THREE.Color(0xffc1a0);
    const cloudColor = cloudNight.clone().lerp(cloudDay, daylight);
    cloudColor.lerp(cloudSunset, twilight * 0.38);
    const cloudOpacity = 0.075 + daylight * 0.24 + twilight * 0.09;

    for (const cloud of this.clouds) {
      cloud.material.color.copy(cloudColor);
      cloud.material.opacity = cloudOpacity;
    }
  }

  updateSolarEvents(date) {
    const minuteKey = `${this.observerInfo.latitude.toFixed(5)}:${this.observerInfo.longitude.toFixed(5)}:${Math.floor(date.getTime() / 60_000)}`;
    if (minuteKey === this.solarEventsKey) return;

    this.solarEventsKey = minuteKey;
    const sunrise = Astronomy.SearchRiseSet(
      Astronomy.Body.Sun,
      this.observer,
      +1,
      date,
      2
    );
    const sunset = Astronomy.SearchRiseSet(
      Astronomy.Body.Sun,
      this.observer,
      -1,
      date,
      2
    );

    this.solarEvents = {
      sunrise: sunrise?.date ?? null,
      sunset: sunset?.date ?? null,
    };
  }

  updateHud() {
    if (!this.hud || !this.state) return;

    const time = new Intl.DateTimeFormat("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(this.state.date);

    const moonPercent = Math.round(this.state.moon.phaseFraction * 100);
    const venus = this.state.planets.Venus;
    const location =
      this.observerInfo.source === "geolocation"
        ? `GPS ${this.observerInfo.latitude.toFixed(2)}°, ${this.observerInfo.longitude.toFixed(2)}°`
        : this.observerInfo.label;
    const formatEventTime = (value) =>
      value
        ? new Intl.DateTimeFormat("es-MX", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }).format(new Date(value))
        : "—";
    const sunriseText = formatEventTime(this.state.solarEvents?.sunrise);
    const sunsetText = formatEventTime(this.state.solarEvents?.sunset);

    const venusText =
      venus && venus.altitude > -1
        ? `Venus ${venus.altitude.toFixed(1)}° · mag ${venus.magnitude.toFixed(1)} · fase ${Math.round(venus.phaseFraction * 100)}%`
        : "Venus bajo el horizonte";

    this.hud.innerHTML = `
      <div style="font-weight:650;">Cielo real · ${time}</div>
      <div>${PHASE_LABELS[this.state.phase]} · Sol ${this.state.sun.altitude.toFixed(1)}° · Luna ${this.state.moon.altitude.toFixed(1)}° (${moonPercent}%)</div>
      <div style="opacity:.86;">Próx. salida ${sunriseText} · puesta ${sunsetText}</div>
      <div style="opacity:.82;">${venusText} · ${location}</div>
    `;
  }

  getDebugInfo() {
    return this.state
      ? JSON.parse(JSON.stringify(this.state))
      : null;
  }
}

export function createAstronomicalSky(options) {
  return new AstronomicalSky(options);
}
