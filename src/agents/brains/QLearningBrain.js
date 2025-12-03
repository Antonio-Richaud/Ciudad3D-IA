// src/agents/brains/QLearningBrain.js
import { getNeighbors } from "../pathPlanner.js";

/**
 * Cerebro de Q-Learning tabular para el Walker.
 *
 * Estado: (goalId, gridX, gridZ)
 * Acciones: "north", "south", "east", "west"
 */
export class QLearningBrain {
  /**
   * @param {object} city - objeto ciudad
   * @param {object} options - hiperparámetros
   *   { alpha, gamma, epsilon, epsilonMin, epsilonDecay, defaultGoalId }
   */
  constructor(city, options = {}) {
    this.city = city;

    this.alpha = options.alpha ?? 0.2;       // tasa de aprendizaje
    this.gamma = options.gamma ?? 0.95;      // factor de descuento
    this.epsilon = options.epsilon ?? 0.3;   // prob. de explorar
    this.epsilonMin = options.epsilonMin ?? 0.05;
    this.epsilonDecay = options.epsilonDecay ?? 0.995;

    this.currentGoalId = options.defaultGoalId || null;

    // Q[goalId][nodeKey][action] = valor
    this.Q = Object.create(null);

    this.lastTransition = null; // { goalId, fromNode, toNode, action }
    this.totalSteps = 0;
    this.episodeCount = 0;
    this.currentEpisodeReward = 0;
  }

  // ===== Helpers internos =====

  _normGoal(goalId) {
    return goalId || "none";
  }

  _nodeKey(node) {
    return `${node.gridX},${node.gridZ}`;
  }

  _ensureState(goalId, nodeKey) {
    const g = this._normGoal(goalId);
    if (!this.Q[g]) this.Q[g] = Object.create(null);
    if (!this.Q[g][nodeKey]) this.Q[g][nodeKey] = Object.create(null);
    return this.Q[g][nodeKey];
  }

  _getQ(goalId, nodeKey, action) {
    const state = this._ensureState(goalId, nodeKey);
    return state[action] ?? 0;
  }

  _setQ(goalId, nodeKey, action, value) {
    const state = this._ensureState(goalId, nodeKey);
    state[action] = value;
  }

  // ===== API esperada por WalkerAgent =====

  /**
   * Nuevo objetivo de alto nivel (home, shop, etc.).
   * Lo tratamos como inicio de episodio nuevo.
   */
  setGoal(goalId /*, startNode */) {
    this.currentGoalId = goalId || null;
    this.lastTransition = null;
    this.currentEpisodeReward = 0;
  }

  /**
   * Elegir siguiente nodo de calle usando política ε-greedy.
   * @param {{gridX:number, gridZ:number}} currentNode
   */
  chooseNextRoad(currentNode) {
    const neighbors = getNeighbors(this.city, currentNode);
    if (!neighbors || neighbors.length === 0) {
      return null;
    }

    this.totalSteps += 1;

    const goalId = this.currentGoalId || "none";
    const stateKey = this._nodeKey(currentNode);

    let chosenNeighbor;
    let chosenAction;

    // Explorar
    if (Math.random() < this.epsilon) {
      const idx = Math.floor(Math.random() * neighbors.length);
      chosenNeighbor = neighbors[idx];
      chosenAction = neighbors[idx].dir;
    } else {
      // Explotar: elegir acción con mayor Q
      let bestVal = -Infinity;
      const bestCandidates = [];

      for (const n of neighbors) {
        const qVal = this._getQ(goalId, stateKey, n.dir);
        if (qVal > bestVal) {
          bestVal = qVal;
          bestCandidates.length = 0;
          bestCandidates.push(n);
        } else if (qVal === bestVal) {
          bestCandidates.push(n);
        }
      }

      const pick =
        bestCandidates[
          Math.floor(Math.random() * bestCandidates.length)
        ];
      chosenNeighbor = pick;
      chosenAction = pick.dir;
    }

    const toNode = {
      gridX: chosenNeighbor.gridX,
      gridZ: chosenNeighbor.gridZ,
    };

    // Guardamos la transición para actualizar cuando lleguemos
    this.lastTransition = {
      goalId,
      fromNode: { ...currentNode },
      toNode: { ...toNode },
      action: chosenAction,
    };

    return toNode;
  }

  /**
   * Llamado por WalkerAgent cuando termina un segmento y llega a un nodo.
   *
   * @param {object} prevNode
   * @param {object} newNode
   * @param {object} info - { goalId, isGoal, reward }
   */
  onNodeArrived(prevNode, newNode, info = {}) {
    const trans = this.lastTransition;
    if (!trans) return;

    const goalId =
      info.goalId ||
      trans.goalId ||
      this.currentGoalId ||
      "none";
    const reward =
      typeof info.reward === "number" ? info.reward : 0;
    const isGoal = !!info.isGoal;

    this.currentEpisodeReward += reward;

    const fromKey = this._nodeKey(trans.fromNode);
    const toKey = this._nodeKey(newNode);

    const oldQ = this._getQ(goalId, fromKey, trans.action);

    let target;

    if (isGoal) {
      // Si se llegó al objetivo, no hay futuro
      target = reward;
    } else {
      // Valor futuro máximo desde el nuevo estado
      const neighbors = getNeighbors(this.city, newNode);
      let maxFuture = 0;
      if (neighbors && neighbors.length > 0) {
        let best = -Infinity;
        for (const n of neighbors) {
          const v = this._getQ(goalId, toKey, n.dir);
          if (v > best) best = v;
        }
        if (best !== -Infinity) {
          maxFuture = best;
        }
      }
      target = reward + this.gamma * maxFuture;
    }

    const newQ = oldQ + this.alpha * (target - oldQ);
    this._setQ(goalId, fromKey, trans.action, newQ);

    // Si terminó episodio (llegó a goal), actualizamos epsilon y stats
    if (isGoal) {
      this.episodeCount += 1;
      this.epsilon = Math.max(
        this.epsilonMin,
        this.epsilon * this.epsilonDecay
      );
      this.lastTransition = null;
      this.currentEpisodeReward = 0;
    }
  }

  /**
   * Info útil para debug / overlays.
   */
  getDebugInfo() {
    return {
      alpha: this.alpha,
      gamma: this.gamma,
      epsilon: this.epsilon,
      epsilonMin: this.epsilonMin,
      episodes: this.episodeCount,
      totalSteps: this.totalSteps,
      lastTransition: this.lastTransition,
    };
  }
}