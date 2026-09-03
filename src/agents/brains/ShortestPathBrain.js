// src/agents/brains/ShortestPathBrain.js
import { bfsPath, sameNode } from "../pathPlanner.js";

/**
 * Generic deterministic brain that follows a shortest BFS path to a POI.
 * Kept as a reusable baseline for agents and future algorithm comparisons.
 */
export class ShortestPathBrain {
  constructor(city, options = {}) {
    this.city = city;
    this.currentGoalId = options.defaultGoalId || null;
    this.currentPath = [];
    this.pathIndex = 0;
    this.lastStart = null;
    this.lastGoalNode = null;
  }

  setGoal(goalId, startNode) {
    this.currentGoalId = goalId || null;
    this._recomputePathFrom(startNode);
  }

  chooseNextRoad(currentNode) {
    if (!this.currentGoalId || !currentNode) return null;

    if (this.currentPath.length === 0) {
      this._recomputePathFrom(currentNode);
    }

    if (this.currentPath.length === 0) return null;

    const expectedNode = this.currentPath[this.pathIndex];
    if (!sameNode(expectedNode, currentNode)) {
      this._recomputePathFrom(currentNode);
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

  _recomputePathFrom(startNode) {
    this.currentPath = [];
    this.pathIndex = 0;
    this.lastStart = startNode ? { ...startNode } : null;
    this.lastGoalNode = null;

    if (!this.currentGoalId || !startNode) return;

    const entranceRoad =
      this.city.pointsOfInterest?.[this.currentGoalId]?.entranceRoad;
    if (!entranceRoad) return;

    this.lastGoalNode = { ...entranceRoad };
    this.currentPath =
      bfsPath(this.city, startNode, this.lastGoalNode) || [];
  }

  getDebugInfo() {
    return {
      type: "shortest-path",
      goalId: this.currentGoalId,
      path: this.currentPath.slice(),
      pathLength: this.currentPath.length,
      pathIndex: this.pathIndex,
      remainingSteps: Math.max(
        0,
        this.currentPath.length - this.pathIndex - 1
      ),
      lastStart: this.lastStart,
      lastGoalNode: this.lastGoalNode,
    };
  }
}
