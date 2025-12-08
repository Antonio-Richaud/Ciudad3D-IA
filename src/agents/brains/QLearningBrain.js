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
   *   {
   *     alpha, gamma,
   *     epsilon, epsilonMin, epsilonDecay,
   *     defaultGoalId,
   *     maxEpisodeStats,
   *     maxEpisodeSteps
   *   }
   */
  constructor(city, options = {}) {
    this.city = city;

    this.alpha = options.alpha ?? 0.4;       // más agresivo
    this.gamma = options.gamma ?? 0.9;
    this.epsilon = options.epsilon ?? 0.3;
    this.epsilonMin = options.epsilonMin ?? 0.02;
    this.epsilonDecay = options.epsilonDecay ?? 0.99;

    this.currentGoalId = options.defaultGoalId || null;

    // Q[goalId][nodeKey][action] = valor
    this.Q = Object.create(null);

    this.lastTransition = null; // { goalId, fromNode, toNode, action }
    this.totalSteps = 0;
    this.episodeCount = 0;
    this.currentEpisodeReward = 0;
    this.episodeSteps = 0;

    // Historial para gráficas
    this.episodeStats = []; // { episode, steps, totalReward, goalId, timeout }
    this.maxEpisodeStats = options.maxEpisodeStats ?? 100;

    // Máximo de pasos por episodio antes de cortarlo
    this.maxEpisodeSteps = options.maxEpisodeSteps ?? 60;

    // Para penalizar vueltas: cuántas veces se ha visitado cada nodo en el episodio
    this.visitedThisEpisode = new Map();
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

  _startNewEpisode(goalId) {
    this.currentGoalId = goalId || this.currentGoalId || null;
    this.lastTransition = null;
    this.currentEpisodeReward = 0;
    this.episodeSteps = 0;
    this.visitedThisEpisode.clear();
  }

  // ===== API esperada por WalkerAgent =====

  /**
   * Nuevo objetivo de alto nivel (home, shop, etc.).
   * Lo tratamos como inicio de un nuevo episodio.
   */
  setGoal(goalId /*, startNode */) {
    this._startNewEpisode(goalId);
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

    const baseReward =
      typeof info.reward === "number" ? info.reward : 0;
    const isGoal = !!info.isGoal;

    // Penalizar revisitar nodos en el mismo episodio (para evitar vueltas)
    const nodeKeyNew = this._nodeKey(newNode);
    const prevCount = this.visitedThisEpisode.get(nodeKeyNew) ?? 0;
    this.visitedThisEpisode.set(nodeKeyNew, prevCount + 1);

    let extraLoopPenalty = 0;
    if (prevCount >= 1) {
      // Ya visitamos antes este nodo en este episodio → penaliza fuerte
      extraLoopPenalty = -0.5;
    }

    const reward = baseReward + extraLoopPenalty;

    this.currentEpisodeReward += reward;
    this.episodeSteps += 1;

    const fromKey = this._nodeKey(trans.fromNode);

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
          const v = this._getQ(goalId, nodeKeyNew, n.dir);
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

    // Timeout por episodio demasiado largo
    const timeout =
      !isGoal &&
      this.maxEpisodeSteps &&
      this.episodeSteps >= this.maxEpisodeSteps;

    // Si terminó episodio (llegó a goal o timeout), guardamos stats y bajamos epsilon
    if (isGoal || timeout) {
      this.episodeCount += 1;

      this.episodeStats.push({
        episode: this.episodeCount,
        steps: this.episodeSteps,
        totalReward: this.currentEpisodeReward,
        goalId,
        timeout,
      });
      if (this.episodeStats.length > this.maxEpisodeStats) {
        this.episodeStats.shift();
      }

      // Decaer epsilon (menos exploración con el tiempo)
      this.epsilon = Math.max(
        this.epsilonMin,
        this.epsilon * this.epsilonDecay
      );

      // Reset episodio
      this._startNewEpisode(this.currentGoalId);
    }
  }

  /**
   * Info útil para debug / overlays / gráficas.
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
      episodeSteps: this.episodeSteps,
      episodeStats: this.episodeStats,
    };
  }

  /**
   * Snapshot de la política para un objetivo:
   * regresa, para cada nodo conocido, la mejor acción y su Q.
   *
   * @param {string} goalId
   * @returns {Array<{gridX, gridZ, bestDir, bestQ}>}
   */
  getPolicySnapshot(goalId) {
    const g = this._normGoal(goalId || this.currentGoalId);
    const table = this.Q[g];
    if (!table) return [];

    const result = [];

    for (const nodeKey of Object.keys(table)) {
      const actions = table[nodeKey];
      const actionKeys = Object.keys(actions);
      if (actionKeys.length === 0) continue;

      let bestDir = null;
      let bestQ = -Infinity;
      for (const dir of actionKeys) {
        const qVal = actions[dir];
        if (qVal > bestQ) {
          bestQ = qVal;
          bestDir = dir;
        }
      }

      if (!bestDir || !Number.isFinite(bestQ)) continue;

      const [xStr, zStr] = nodeKey.split(",");
      const gridX = parseInt(xStr, 10);
      const gridZ = parseInt(zStr, 10);

      result.push({ gridX, gridZ, bestDir, bestQ });
    }

    return result;
  }
}