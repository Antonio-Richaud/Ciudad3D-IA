// src/agents/brains/CarShortestPathBrain.js
import { bfsPath, sameNode } from "../pathPlanner.js";

/**
 * Deterministic shortest-path brain for road vehicles.
 */
export class CarShortestPathBrain {
  constructor(city, options = {}) {
    this.city = city;
    this.currentGoalId = options.defaultGoalId || null;
    this.currentPath = [];
    this.pathIndex = 0;
  }

  _getGoalRoadNode(goalId = this.currentGoalId) {
    if (!goalId) return null;

    const poi = this.city.pointsOfInterest?.[goalId];
    if (!poi?.entranceRoad) return null;

    return {
      gridX: poi.entranceRoad.gridX,
      gridZ: poi.entranceRoad.gridZ,
    };
  }

  setGoal(goalId, startNode) {
    this.currentGoalId = goalId || null;
    this._recomputePath(startNode);
  }

  _recomputePath(startNode) {
    this.currentPath = [];
    this.pathIndex = 0;

    const goalNode = this._getGoalRoadNode();
    if (!startNode || !goalNode) return;

    const path = bfsPath(this.city, startNode, goalNode);
    this.currentPath = path || [];
  }

  chooseNextRoad(currentNode) {
    if (!this.currentGoalId || !currentNode) return null;

    if (this.currentPath.length === 0) {
      this._recomputePath(currentNode);
    }

    if (this.currentPath.length === 0) return null;

    const expectedNode = this.currentPath[this.pathIndex];
    if (!sameNode(expectedNode, currentNode)) {
      this._recomputePath(currentNode);
    }

    if (this.currentPath.length === 0) return null;
    if (this.pathIndex >= this.currentPath.length - 1) return null;

    this.pathIndex += 1;
    const nextNode = this.currentPath[this.pathIndex];

    return {
      gridX: nextNode.gridX,
      gridZ: nextNode.gridZ,
    };
  }

  onNodeArrived() {
    // Deterministic brain: no learning update required.
  }

  getDebugInfo() {
    return {
      type: "shortest-path",
      goalId: this.currentGoalId,
      pathLength: this.currentPath.length,
      currentIndex: this.pathIndex,
      remainingSteps: Math.max(
        0,
        this.currentPath.length - this.pathIndex - 1
      ),
    };
  }
}
