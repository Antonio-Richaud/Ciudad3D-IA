// src/agents/pathPlanner.js

/**
 * Builds the unique key used by city.roadMap for a road node.
 */
export function roadKey(gridX, gridZ) {
  return `${gridX},${gridZ}`;
}

/**
 * Returns whether a road exists at the given grid coordinates.
 */
export function hasRoadAt(city, gridX, gridZ) {
  return city.roadMap.has(roadKey(gridX, gridZ));
}

/**
 * Returns the orthogonal road neighbors for a node.
 */
export function getNeighbors(city, node) {
  if (!node) return [];

  const { gridX, gridZ } = node;
  const candidates = [
    { gridX: gridX + 1, gridZ, dir: "east" },
    { gridX: gridX - 1, gridZ, dir: "west" },
    { gridX, gridZ: gridZ + 1, dir: "south" },
    { gridX, gridZ: gridZ - 1, dir: "north" },
  ];

  return candidates.filter((candidate) =>
    hasRoadAt(city, candidate.gridX, candidate.gridZ)
  );
}

/**
 * Compares two grid nodes.
 */
export function sameNode(a, b) {
  return Boolean(
    a &&
      b &&
      a.gridX === b.gridX &&
      a.gridZ === b.gridZ
  );
}

/**
 * Finds a shortest path between two road nodes using BFS.
 *
 * Returns an array including both start and goal, or null when no route exists.
 */
export function bfsPath(city, start, goal) {
  if (!start || !goal) return null;
  if (!hasRoadAt(city, start.gridX, start.gridZ)) return null;
  if (!hasRoadAt(city, goal.gridX, goal.gridZ)) return null;

  const startKey = roadKey(start.gridX, start.gridZ);
  const goalKey = roadKey(goal.gridX, goal.gridZ);

  if (startKey === goalKey) {
    return [{ gridX: start.gridX, gridZ: start.gridZ }];
  }

  const queue = [{ gridX: start.gridX, gridZ: start.gridZ }];
  let queueIndex = 0;
  const visited = new Set([startKey]);
  const parent = new Map();

  while (queueIndex < queue.length) {
    const current = queue[queueIndex];
    queueIndex += 1;

    for (const neighbor of getNeighbors(city, current)) {
      const neighborKey = roadKey(neighbor.gridX, neighbor.gridZ);
      if (visited.has(neighborKey)) continue;

      visited.add(neighborKey);
      parent.set(neighborKey, current);

      if (neighborKey === goalKey) {
        const path = [{ gridX: neighbor.gridX, gridZ: neighbor.gridZ }];
        let node = current;

        while (node) {
          path.push({ gridX: node.gridX, gridZ: node.gridZ });
          node = parent.get(roadKey(node.gridX, node.gridZ)) || null;
        }

        path.reverse();
        return path;
      }

      queue.push({ gridX: neighbor.gridX, gridZ: neighbor.gridZ });
    }
  }

  return null;
}
