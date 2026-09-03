// src/agents/brains/QLearningBrain.js
import { getNeighbors } from "../pathPlanner.js";

/**
 * Tabular Q-learning brain for the pedestrian agent.
 *
 * State:  (goalId, gridX, gridZ)
 * Action: move to one adjacent road node
 */
export class QLearningBrain {
  constructor(city, options = {}) {
    this.city = city;

    this.alpha = options.alpha ?? 0.6;
    this.gamma = options.gamma ?? 0.9;
    this.epsilon = options.epsilon ?? 0.4;
    this.epsilonMin = options.epsilonMin ?? 0.05;
    this.epsilonDecay = options.epsilonDecay ?? 0.985;

    this.goalReward = options.goalReward ?? 1;
    this.stepReward = options.stepReward ?? -0.05;

    this.maxEpisodeSteps = options.maxEpisodeSteps ?? 70;
    this.maxEpisodeStats = options.maxEpisodeStats ?? 80;

    this.currentGoalId = null;
    this.q = new Map();

    this.episodeCount = 0;
    this.totalSteps = 0;
    this.episodeSteps = 0;
    this.episodeStats = [];
    this.lastTransition = null;

    this._computeBounds();
  }

  _computeBounds() {
    const home = this.city.pointsOfInterest?.home?.entranceRoad;
    const shop = this.city.pointsOfInterest?.shop?.entranceRoad;

    if (!home || !shop) {
      this.bounds = null;
      return;
    }

    const margin = 2;
    const size = this.city.gridSize;

    this.bounds = {
      minX: Math.max(0, Math.min(home.gridX, shop.gridX) - margin),
      maxX: Math.min(size - 1, Math.max(home.gridX, shop.gridX) + margin),
      minZ: Math.max(0, Math.min(home.gridZ, shop.gridZ) - margin),
      maxZ: Math.min(size - 1, Math.max(home.gridZ, shop.gridZ) + margin),
    };
  }

  _inBounds(node) {
    if (!this.bounds) return true;

    const { minX, maxX, minZ, maxZ } = this.bounds;
    return (
      node.gridX >= minX &&
      node.gridX <= maxX &&
      node.gridZ >= minZ &&
      node.gridZ <= maxZ
    );
  }

  _getNeighbors(node) {
    return getNeighbors(this.city, node).filter((neighbor) =>
      this._inBounds(neighbor)
    );
  }

  _stateKey(node, goalId = this.currentGoalId) {
    if (!node || !goalId) return "";
    return `${goalId}|${node.gridX},${node.gridZ}`;
  }

  _ensureState(stateKey) {
    if (!this.q.has(stateKey)) {
      this.q.set(stateKey, new Map());
    }
    return this.q.get(stateKey);
  }

  _ensureActions(row, neighbors) {
    for (const neighbor of neighbors) {
      const actionKey = `${neighbor.gridX},${neighbor.gridZ}`;
      if (!row.has(actionKey)) row.set(actionKey, 0);
    }
  }

  setGoal(goalId) {
    this.currentGoalId = goalId || null;
    this.episodeSteps = 0;
  }

  chooseNextRoad(currentNode) {
    if (!this.currentGoalId || !currentNode) return null;

    const neighbors = this._getNeighbors(currentNode);
    if (neighbors.length === 0) return null;

    const row = this._ensureState(
      this._stateKey(currentNode, this.currentGoalId)
    );
    this._ensureActions(row, neighbors);

    if (Math.random() < this.epsilon) {
      const randomNeighbor =
        neighbors[Math.floor(Math.random() * neighbors.length)];
      return {
        gridX: randomNeighbor.gridX,
        gridZ: randomNeighbor.gridZ,
      };
    }

    let bestNeighbor = neighbors[0];
    let bestQ = row.get(`${bestNeighbor.gridX},${bestNeighbor.gridZ}`) ?? 0;

    for (let index = 1; index < neighbors.length; index += 1) {
      const neighbor = neighbors[index];
      const qValue = row.get(`${neighbor.gridX},${neighbor.gridZ}`) ?? 0;

      if (qValue > bestQ) {
        bestQ = qValue;
        bestNeighbor = neighbor;
      }
    }

    return {
      gridX: bestNeighbor.gridX,
      gridZ: bestNeighbor.gridZ,
    };
  }

  onNodeArrived(previousNode, newNode, info = {}) {
    const goalId = info.goalId || this.currentGoalId;
    if (!goalId || !previousNode || !newNode) return;

    const goalRoad = this.city.pointsOfInterest?.[goalId]?.entranceRoad;
    const isGoal = Boolean(
      info.isGoal ||
        (goalRoad &&
          goalRoad.gridX === newNode.gridX &&
          goalRoad.gridZ === newNode.gridZ)
    );
    const reward = isGoal ? this.goalReward : this.stepReward;

    const previousRow = this._ensureState(
      this._stateKey(previousNode, goalId)
    );
    const newRow = this._ensureState(this._stateKey(newNode, goalId));
    const nextNeighbors = this._getNeighbors(newNode);

    this._ensureActions(newRow, nextNeighbors);

    const actionKey = `${newNode.gridX},${newNode.gridZ}`;
    const oldQ = previousRow.get(actionKey) ?? 0;

    let maxNextQ = 0;
    if (!isGoal && nextNeighbors.length > 0) {
      maxNextQ = Math.max(
        ...nextNeighbors.map(
          (neighbor) =>
            newRow.get(`${neighbor.gridX},${neighbor.gridZ}`) ?? 0
        )
      );
    }

    const updatedQ =
      oldQ + this.alpha * (reward + this.gamma * maxNextQ - oldQ);

    previousRow.set(actionKey, updatedQ);

    this.lastTransition = {
      previousNode: { ...previousNode },
      newNode: { ...newNode },
      goalId,
      isGoal,
      reward,
      oldQ,
      updatedQ,
    };

    this.episodeSteps += 1;
    this.totalSteps += 1;

    if (isGoal || this.episodeSteps >= this.maxEpisodeSteps) {
      this._endEpisode(isGoal);
    }
  }

  _endEpisode(reachedGoal) {
    this.episodeCount += 1;
    this.episodeStats.push({
      episode: this.episodeCount,
      steps: this.episodeSteps,
      reachedGoal: Boolean(reachedGoal),
    });

    if (this.episodeStats.length > this.maxEpisodeStats) {
      this.episodeStats.shift();
    }

    this.episodeSteps = 0;
    this.epsilon = Math.max(
      this.epsilonMin,
      this.epsilon * this.epsilonDecay
    );
  }

  getDebugInfo() {
    return {
      type: "q-learning",
      goalId: this.currentGoalId,
      alpha: this.alpha,
      gamma: this.gamma,
      epsilon: this.epsilon,
      epsilonMin: this.epsilonMin,
      goalReward: this.goalReward,
      stepReward: this.stepReward,
      episodes: this.episodeCount,
      totalSteps: this.totalSteps,
      episodeSteps: this.episodeSteps,
      lastTransition: this.lastTransition,
      episodeStats: this.episodeStats.slice(),
    };
  }

  getQSnapshot(goalId = this.currentGoalId) {
    const snapshot = new Map();
    if (!goalId) return snapshot;

    const prefix = `${goalId}|`;

    for (const [stateKey, row] of this.q.entries()) {
      if (stateKey.startsWith(prefix)) {
        snapshot.set(stateKey, new Map(row));
      }
    }

    return snapshot;
  }

  getPolicySnapshot(goalId) {
    return this.getQSnapshot(goalId);
  }
}
