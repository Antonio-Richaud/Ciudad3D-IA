// src/agents/brains/ShortestPathBrain.js
import { bfsPath, sameNode } from "../pathPlanner.js";

export class ShortestPathBrain {
  /**
   * @param {object} city - objeto retornado por createCity(scene)
   * @param {object} options - { defaultGoalId?: string }
   */
  constructor(city, options = {}) {
    this.city = city;
    this.currentGoalId = options.defaultGoalId || null;

    this.currentPath = null; // array de nodos {gridX, gridZ}
    this.pathIndex = 0;      // siguiente índice a seguir dentro de currentPath

    this.lastStart = null;
    this.lastGoalNode = null;
  }

  /**
   * Establece el objetivo actual (por id de POI: "home", "shop"...)
   * y recalcula la ruta desde startNode hasta ese objetivo.
   *
   * @param {string} goalId
   * @param {{gridX:number, gridZ:number}} startNode
   */
  setGoal(goalId, startNode) {
    this.currentGoalId = goalId;
    this.currentPath = null;
    this.pathIndex = 0;
    this.lastStart = null;
    this.lastGoalNode = null;

    if (!goalId || !startNode) return;

    const poi = this.city.pointsOfInterest?.[goalId];
    if (!poi || !poi.entranceRoad) {
      console.warn(`[ShortestPathBrain] POI "${goalId}" no encontrado o sin entranceRoad.`);
      return;
    }

    const goalNode = {
      gridX: poi.entranceRoad.gridX,
      gridZ: poi.entranceRoad.gridZ,
    };

    const path = bfsPath(this.city, startNode, goalNode);
    if (!path || path.length < 2) {
      console.warn("[ShortestPathBrain] No se encontró camino de", startNode, "a", goalNode);
      return;
    }

    this.currentPath = path;
    this.pathIndex = 1; // el índice 0 es el nodo actual, empezamos en el siguiente
    this.lastStart = { ...startNode };
    this.lastGoalNode = goalNode;
  }

  /**
   * Devuelve el siguiente nodo de calle hacia el objetivo actual.
   *
   * @param {{gridX:number, gridZ:number}} currentNode
   * @returns {{gridX:number, gridZ:number} | null}
   */
  chooseNextRoad(currentNode) {
    if (!this.currentGoalId) return null;

    // Si no hay ruta, la recomputamos desde currentNode
    if (!this.currentPath || this.currentPath.length < 2) {
      this._recomputePathFrom(currentNode);
    }

    if (!this.currentPath || this.currentPath.length < 2) {
      return null;
    }

    // Si el agente se desvió de la ruta, la recalculamos
    const expectedCurrent = this.currentPath[this.pathIndex - 1] || this.currentPath[0];
    if (!sameNode(expectedCurrent, currentNode)) {
      this._recomputePathFrom(currentNode);
      if (!this.currentPath || this.currentPath.length < 2) {
        return null;
      }
    }

    if (this.pathIndex >= this.currentPath.length) {
      // ya llegamos
      return null;
    }

    const nextNode = this.currentPath[this.pathIndex];
    this.pathIndex += 1;
    return { gridX: nextNode.gridX, gridZ: nextNode.gridZ };
  }

  /**
   * Recalcula ruta desde currentNode al goal actual.
   * Usado cuando el agente se sale de la ruta esperada.
   */
  _recomputePathFrom(currentNode) {
    if (!this.currentGoalId) return;

    const poi = this.city.pointsOfInterest?.[this.currentGoalId];
    if (!poi || !poi.entranceRoad) return;

    const goalNode = {
      gridX: poi.entranceRoad.gridX,
      gridZ: poi.entranceRoad.gridZ,
    };

    const path = bfsPath(this.city, currentNode, goalNode);
    if (!path || path.length < 2) {
      this.currentPath = null;
      this.pathIndex = 0;
      return;
    }

    this.currentPath = path;
    this.pathIndex = 1;
    this.lastStart = { ...currentNode };
    this.lastGoalNode = goalNode;
  }

  /**
   * Info para debug / overlays si luego quieres ver la ruta planeada.
   */
  getDebugInfo() {
    return {
      goalId: this.currentGoalId,
      path: this.currentPath,
      pathIndex: this.pathIndex,
      lastStart: this.lastStart,
      lastGoalNode: this.lastGoalNode,
    };
  }
}