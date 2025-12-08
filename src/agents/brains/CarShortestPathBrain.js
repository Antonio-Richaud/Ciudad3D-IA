// src/agents/brains/CarShortestPathBrain.js
import { getNeighbors } from "../pathPlanner.js";

/**
 * CarShortestPathBrain:
 * - Planea la ruta más corta sobre las calles usando BFS.
 * - No aprende, solo recalcula cuando cambias el objetivo
 *   o cuando el carro se “sale” de la ruta planeada.
 */
export class CarShortestPathBrain {
  /**
   * @param {object} city
   * @param {object} options  { defaultGoalId?: string }
   */
  constructor(city, options = {}) {
    this.city = city;
    this.currentGoalId = options.defaultGoalId || null;

    this.currentPath = []; // [{gridX, gridZ}, ...] desde start hasta goal
    this.pathIndex = 0;
  }

  _nodeKey(node) {
    return `${node.gridX},${node.gridZ}`;
  }

  _getGoalRoadNode(goalId) {
    const gId = goalId || this.currentGoalId;
    if (!gId) return null;

    const poi = this.city.pointsOfInterest?.[gId];
    if (!poi?.entranceRoad) return null;

    return {
      gridX: poi.entranceRoad.gridX,
      gridZ: poi.entranceRoad.gridZ,
    };
  }

  /**
   * Fija un nuevo objetivo de alto nivel (home, shop, etc.)
   * y opcionalmente un nodo de inicio para recalcular la ruta.
   */
  setGoal(goalId, startNode) {
    this.currentGoalId = goalId || this.currentGoalId || null;
    this._recomputePath(startNode || null);
  }

  /**
   * BFS simple sobre el grafo de calles usando getNeighbors.
   */
  _recomputePath(startNode) {
    this.currentPath = [];
    this.pathIndex = 0;

    const goalNode = this._getGoalRoadNode(this.currentGoalId);
    if (!goalNode || !startNode) return;

    const startKey = this._nodeKey(startNode);
    const goalKey = this._nodeKey(goalNode);

    const queue = [];
    const visited = new Set();
    const parent = new Map();

    queue.push(startNode);
    visited.add(startKey);

    let found = false;

    while (queue.length > 0) {
      const node = queue.shift();
      const key = this._nodeKey(node);

      if (key === goalKey) {
        found = true;
        break;
      }

      const neighbors = getNeighbors(this.city, node);
      if (!neighbors) continue;

      for (const nb of neighbors) {
        const nNode = { gridX: nb.gridX, gridZ: nb.gridZ };
        const nKey = this._nodeKey(nNode);
        if (visited.has(nKey)) continue;
        visited.add(nKey);
        parent.set(nKey, node);
        queue.push(nNode);
      }
    }

    if (!found) return;

    const path = [];
    let cur = goalNode;
    let curKey = goalKey;

    while (curKey !== startKey) {
      path.push({ gridX: cur.gridX, gridZ: cur.gridZ });
      const prev = parent.get(curKey);
      if (!prev) break;
      cur = prev;
      curKey = this._nodeKey(cur);
    }
    path.push({ gridX: startNode.gridX, gridZ: startNode.gridZ });
    path.reverse(); // start -> goal

    this.currentPath = path;
    this.pathIndex = 0;
  }

  /**
   * Devuelve el siguiente nodo de calle a seguir según la ruta más corta.
   */
  chooseNextRoad(currentNode) {
    if (!this.currentGoalId) {
      return null;
    }

    if (!this.currentPath || this.currentPath.length < 2) {
      this._recomputePath(currentNode);
    }

    if (!this.currentPath || this.currentPath.length < 2) {
      return null;
    }

    const curFromPath = this.currentPath[this.pathIndex];
    if (
      !curFromPath ||
      curFromPath.gridX !== currentNode.gridX ||
      curFromPath.gridZ !== currentNode.gridZ
    ) {
      // El carro no está donde esperábamos -> recalcular
      this._recomputePath(currentNode);
      if (!this.currentPath || this.currentPath.length < 2) {
        return null;
      }
      this.pathIndex = 0;
    }

    if (this.pathIndex >= this.currentPath.length - 1) {
      // Ya estamos en el objetivo
      return null;
    }

    this.pathIndex += 1;
    const next = this.currentPath[this.pathIndex];
    return { gridX: next.gridX, gridZ: next.gridZ };
  }

  /**
   * Hook para compatibilidad con WalkerAgent. Aquí no necesitamos nada.
   */
  onNodeArrived(_prevNode, _newNode, _info = {}) {
    // Cerebro determinista, no aprende.
  }

  /**
   * Info para el panel derecho.
   */
  getDebugInfo() {
    return {
      type: "shortest-path",
      goalId: this.currentGoalId,
      pathLength: this.currentPath ? this.currentPath.length : 0,
      currentIndex: this.pathIndex,
      remainingSteps: this.currentPath
        ? Math.max(0, this.currentPath.length - this.pathIndex - 1)
        : 0,
    };
  }
}