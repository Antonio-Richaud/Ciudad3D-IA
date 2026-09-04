const FULL_TURN = Math.PI * 2;

function mix32(value) {
  let x = value | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
}

function hash01(a, b, salt = 0) {
  const seed =
    Math.imul(a + 17, 0x1f123bb5) ^
    Math.imul(b + 31, 0x5f356495) ^
    Math.imul(salt + 47, 0x6c8e9cf5);
  return mix32(seed) / 0xffffffff;
}

function normalizeAngle(angle) {
  const normalized = angle % FULL_TURN;
  return normalized < 0 ? normalized + FULL_TURN : normalized;
}

function requirePositive(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number.`);
  }
}

export function getForestModelFit(
  size,
  cellSize = 7,
  {
    targetLongSideCells = 7.25,
    maxHeightCells = 4.2,
  } = {}
) {
  const x = Number(size?.x);
  const y = Number(size?.y);
  const z = Number(size?.z);

  requirePositive(x, "size.x");
  requirePositive(y, "size.y");
  requirePositive(z, "size.z");
  requirePositive(cellSize, "cellSize");
  requirePositive(targetLongSideCells, "targetLongSideCells");
  requirePositive(maxHeightCells, "maxHeightCells");

  const longAxisIsX = x >= z;
  const sourceWidth = longAxisIsX ? x : z;
  const sourceDepth = longAxisIsX ? z : x;
  const targetWidth = cellSize * targetLongSideCells;
  const maxHeight = cellSize * maxHeightCells;
  const scale = Math.min(targetWidth / sourceWidth, maxHeight / y);

  return {
    rotationY: longAxisIsX ? 0 : Math.PI / 2,
    scale,
    width: sourceWidth * scale,
    depth: sourceDepth * scale,
    height: y * scale,
  };
}

export function createForestRingLayout({
  halfGround,
  cellSize,
  tileWidth,
  tileDepth,
  layers = 4,
  tangentialOverlap = 0.18,
  innerGapCells = 0,
  minLayerSpacingCells = 1.55,
}) {
  requirePositive(halfGround, "halfGround");
  requirePositive(cellSize, "cellSize");
  requirePositive(tileWidth, "tileWidth");
  requirePositive(tileDepth, "tileDepth");

  if (!Number.isInteger(layers) || layers < 1) {
    throw new RangeError("layers must be a positive integer.");
  }
  if (
    !Number.isFinite(tangentialOverlap) ||
    tangentialOverlap < 0 ||
    tangentialOverlap >= 0.5
  ) {
    throw new RangeError("tangentialOverlap must be between 0 and 0.5.");
  }

  const tangentialSpacing = tileWidth * (1 - tangentialOverlap);
  const radialSpacing = Math.max(
    tileDepth * 0.64,
    cellSize * minLayerSpacingCells
  );
  const firstRadius =
    halfGround + cellSize * innerGapCells + tileDepth / 2;
  const placements = [];

  const sides = [
    {
      name: "north",
      baseRotation: 0,
      position: (along, radius, radialJitter) => ({
        x: along,
        z: -radius - radialJitter,
      }),
    },
    {
      name: "south",
      baseRotation: Math.PI,
      position: (along, radius, radialJitter) => ({
        x: along,
        z: radius + radialJitter,
      }),
    },
    {
      name: "east",
      baseRotation: Math.PI / 2,
      position: (along, radius, radialJitter) => ({
        x: radius + radialJitter,
        z: along,
      }),
    },
    {
      name: "west",
      baseRotation: -Math.PI / 2,
      position: (along, radius, radialJitter) => ({
        x: -radius - radialJitter,
        z: along,
      }),
    },
  ];

  for (let layer = 0; layer < layers; layer++) {
    const radius = firstRadius + layer * radialSpacing;
    const tangentExtent = radius + tileWidth * 0.72;
    const halfCount = Math.ceil(tangentExtent / tangentialSpacing) + 1;
    const stagger = layer % 2 === 0 ? 0 : tangentialSpacing * 0.5;

    for (let sideIndex = 0; sideIndex < sides.length; sideIndex++) {
      const side = sides[sideIndex];

      for (let index = -halfCount; index <= halfCount; index++) {
        const along = index * tangentialSpacing + stagger;
        const radialRoll = hash01(index, layer, sideIndex * 17 + 3);
        // La primera capa solapa ligeramente el borde de la ciudad para que
        // nunca aparezca una franja vacía entre el suelo urbano y el bosque.
        const radialJitter =
          layer === 0 && innerGapCells === 0
            ? -tileDepth * (0.025 + radialRoll * 0.025)
            : (radialRoll - 0.5) * tileDepth * 0.1;
        const rotationJitter =
          (hash01(index, layer, sideIndex * 19 + 7) - 0.5) * 0.045;
        const flip = (index + layer + sideIndex) % 2 === 0 ? 0 : Math.PI;
        const heightScale =
          0.92 + hash01(index, layer, sideIndex * 23 + 11) * 0.18;
        const position = side.position(along, radius, radialJitter);

        placements.push({
          side: side.name,
          layer,
          index,
          x: position.x,
          z: position.z,
          rotationY: normalizeAngle(
            side.baseRotation + flip + rotationJitter
          ),
          heightScale,
          castShadow: layer === 0,
        });
      }
    }
  }

  return {
    placements,
    tangentialSpacing,
    radialSpacing,
    firstRadius,
    outerRadius: firstRadius + (layers - 1) * radialSpacing,
  };
}
