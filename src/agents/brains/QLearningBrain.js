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

    _manhattan(a, b) {
        if (!a || !b) return 0;
        return (
            Math.abs(a.gridX - b.gridX) +
            Math.abs(a.gridZ - b.gridZ)
        );
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
        const goalId = info.goalId || this.currentGoalId;
        if (!goalId || !prevNode || !newNode) return;

        const poi =
            this.city.pointsOfInterest &&
            this.city.pointsOfInterest[goalId];
        const goalRoad = poi?.entranceRoad || null;

        // --- Nuevo cálculo de reward ---
        let reward;

        if (info.isGoal && goalRoad) {
            // Llegó al objetivo → recompensa grande
            reward = 5.0;
        } else if (goalRoad) {
            const dPrev = this._manhattan(prevNode, goalRoad);
            const dNew = this._manhattan(newNode, goalRoad);
            const diff = dPrev - dNew; // > 0 = se acercó, < 0 = se alejó

            // Coste base por paso + shaping por distancia
            // Si se acerca: diff > 0 → reward menos negativo o incluso positivo.
            // Si se aleja: diff < 0 → castigo extra.
            reward = -0.10 + 0.08 * diff;
        } else {
            // Por si algún día hay un goal sin entranceRoad
            reward = info.reward ?? -0.05;
        }

        // A partir de aquí, deja tu lógica igual, pero usando `reward`
        // en lugar de `info.reward`.
        //
        // Ejemplo genérico (ajústalo a tus nombres):
        //
        const stateKeyPrev = this._stateKey(prevNode, goalId);
        const stateKeyNew = this._stateKey(newNode, goalId);

        const neighborsNext = getNeighbors(this.city, newNode) || [];
        this._ensureState(stateKeyPrev);
        this._ensureState(stateKeyNew);
        const rowPrev = this.q.get(stateKeyPrev);
        const rowNew = this.q.get(stateKeyNew);

        const actionKey = `${newNode.gridX},${newNode.gridZ}`;
        const oldQ = rowPrev.get(actionKey) ?? 0;

        let maxNext = 0;
        if (!info.isGoal && neighborsNext.length > 0) {
            maxNext = Math.max(
                ...neighborsNext.map((nb) => {
                    const aKey = `${nb.gridX},${nb.gridZ}`;
                    return rowNew.get(aKey) ?? 0;
                })
            );
        }

        const updatedQ =
            oldQ +
            this.alpha * (reward + this.gamma * maxNext - oldQ);

        rowPrev.set(actionKey, updatedQ);

        // estadísticas / episodios (usa lo que ya tenías)
        this.lastTransition = {
            prevNode,
            newNode,
            goalId,
            isGoal: info.isGoal,
            reward,
            oldQ,
            updatedQ,
        };

        this.episodeSteps += 1;
        this.totalSteps += 1;

        if (info.isGoal || this.episodeSteps >= this.maxEpisodeSteps) {
            this._endEpisode(goalId);
            this._startNewEpisode(newNode);
        }
    }

    /**
     * Info útil para debug / overlays / gráficas.
     */
    getDebugInfo() {
        return {
            type: "q-learning",
            goalId: this.currentGoalId,
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