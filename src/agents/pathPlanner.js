// src/agents/pathPlanner.js

/**
 * Llave única para un nodo de calle en el roadMap.
 */
export function roadKey(gridX, gridZ) {
  return `${gridX},${gridZ}`;
}

/**
 * Devuelve true si hay calle en (gridX, gridZ).
 */
export function hasRoadAt(city, gridX, gridZ) {
  return city.roadMap.has(roadKey(gridX, gridZ));
}

/**
 * Vecinos (N, S, E, O) que también son celdas de calle.
 * node = { gridX, gridZ }
 */
export function getNeighbors(city, node) {
  const { gridX, gridZ } = node;
  const candidates = [
    { gridX: gridX + 1, gridZ, dir: "east" },
    { gridX: gridX - 1, gridZ, dir: "west" },
    { gridX, gridZ: gridZ + 1, dir: "south" },
    { gridX, gridZ: gridZ - 1, dir: "north" },
  ];

  const neighbors = [];
  for (const n of candidates) {
    if (hasRoadAt(city, n.gridX, n.gridZ)) {
      neighbors.push({ gridX: n.gridX, gridZ: n.gridZ, dir: n.dir });
    }
  }
  return neighbors;
}

/**
 * Compara dos nodos de calle.
 */
export function sameNode(a, b) {
  return a && b && a.gridX === b.gridX && a.gridZ === b.gridZ;
}

/**
 * BFS simple para encontrar un camino más corto entre dos celdas de calle.
 * start y goal: { gridX, gridZ }
 *
 * Retorna:
 * - array de nodos [{gridX,gridZ}, ...] incluyendo start y goal
 * - o null si no hay camino
 */
export function bfsPath(city, start, goal) {
  if (!start || !goal) return null;
  if (!hasRoadAt(city, start.gridX, start.gridZ)) return null;
  if (!hasRoadAt(city, goal.gridX, goal.gridZ)) return null;

  const startKey = roadKey(start.gridX, start.gridZ);
  const goalKey = roadKey(goal.gridX, goal.gridZ);

  const queue = [start];
  const visited = new Set([startKey]);
  const parent = new Map(); // key -> {gridX, gridZ}

  while (queue.length > 0) {
    const current = queue.shift();
    const currentKey = roadKey(current.gridX, current.gridZ);

    if (currentKey === goalKey) {
      // reconstruir camino
      const path = [];
      let node = current;
      while (node) {
        path.push({ gridX: node.gridX, gridZ: node.gridZ });
        const key = roadKey(node.gridX, node.gridZ);
        node = parent.get(key) || null;
      }
      path.reverse();
      return path;
    }

    const neighbors = getNeighbors(city, current);
    for (const n of neighbors) {
      const key = roadKey(n.gridX, n.gridZ);
      if (visited.has(key)) continue;
      visited.add(key);
      parent.set(key, current);
      queue.push(n);
    }
  }

  // sin camino
  return null;
}