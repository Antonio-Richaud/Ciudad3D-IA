// src/agents/brains/QLearningBrain.js
import { getNeighbors } from "../pathPlanner.js";

/**
 * Cerebro Q-Learning tabular para el peatón.
 * - Estado: (goalId, gridX, gridZ)
 * - Acción: ir a un nodo vecino (gridX, gridZ)
 * - Reward:
 *    +1.0 al llegar al objetivo
 *    -0.05 en cada paso normal
 *
 * Para que no tarde años en aprender, limitamos la exploración
 * a un "corredor" alrededor de casa <-> tienda.
 */
export class QLearningBrain {
    constructor(city, options = {}) {
        this.city = city;

        // Hiperparámetros un poco más agresivos para que aprenda más rápido
        this.alpha = options.alpha ?? 0.6;
        this.gamma = options.gamma ?? 0.9;
        this.epsilon = options.epsilon ?? 0.4;
        this.epsilonMin = options.epsilonMin ?? 0.05;
        this.epsilonDecay = options.epsilonDecay ?? 0.985;

        this.maxEpisodeSteps = options.maxEpisodeSteps ?? 70;
        this.maxEpisodeStats = options.maxEpisodeStats ?? 80;

        this.currentGoalId = null;

        // Q-table: Map<stateKey, Map<actionKey, qValue>>
        this.q = new Map();

        this.episodeCount = 0;
        this.totalSteps = 0;
        this.episodeSteps = 0;
        this.episodeStats = [];
        this.lastTransition = null;

        // Corredor de exploración entre home y shop
        this._computeBounds();
    }

    // ----------------- Utilidades internas -----------------

    _computeBounds() {
        const poiHome = this.city.pointsOfInterest?.home;
        const poiShop = this.city.pointsOfInterest?.shop;

        if (poiHome?.entranceRoad && poiShop?.entranceRoad) {
            const xs = [
                poiHome.entranceRoad.gridX,
                poiShop.entranceRoad.gridX,
            ];
            const zs = [
                poiHome.entranceRoad.gridZ,
                poiShop.entranceRoad.gridZ,
            ];
            const margin = 2;
            const size = this.city.gridSize ?? 16;

            this.bounds = {
                minX: Math.max(0, Math.min(...xs) - margin),
                maxX: Math.min(size - 1, Math.max(...xs) + margin),
                minZ: Math.max(0, Math.min(...zs) - margin),
                maxZ: Math.min(size - 1, Math.max(...zs) + margin),
            };
        } else {
            this.bounds = null;
        }
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

    _getNeighborsBounded(node) {
        const neighbors = getNeighbors(this.city, node) || [];
        if (!this.bounds) return neighbors;
        return neighbors.filter((nb) => this._inBounds(nb));
    }

    _stateKey(node, goalId) {
        if (!node || goalId == null) return "";
        return `${goalId}|${node.gridX},${node.gridZ}`;
    }

    _ensureState(stateKey) {
        if (!this.q.has(stateKey)) {
            this.q.set(stateKey, new Map());
        }
    }

    // ----------------- API usada por el Walker -----------------

    /**
     * Cambiamos el objetivo de alto nivel (home / shop).
     */
    setGoal(goalId, _startNode) {
        this.currentGoalId = goalId;
        this.episodeSteps = 0;
        // Si más adelante metemos park y otros goals, aquí podríamos
        // volver a calcular bounds según el objetivo.
    }

    /**
     * Política epsilon-greedy sobre los vecinos del nodo actual.
     * Devuelve {gridX, gridZ} del siguiente nodo de calle.
     */
    chooseNextRoad(currentNode) {
        const goalId = this.currentGoalId;
        if (!goalId || !currentNode) return null;

        const neighbors = this._getNeighborsBounded(currentNode);
        if (!neighbors || neighbors.length === 0) return null;

        const stateKey = this._stateKey(currentNode, goalId);
        this._ensureState(stateKey);
        const row = this.q.get(stateKey);

        // Aseguramos que todas las acciones existan en la fila
        neighbors.forEach((nb) => {
            const aKey = `${nb.gridX},${nb.gridZ}`;
            if (!row.has(aKey)) row.set(aKey, 0);
        });

        // Exploración
        if (Math.random() < this.epsilon) {
            const pick =
                neighbors[Math.floor(Math.random() * neighbors.length)];
            return { gridX: pick.gridX, gridZ: pick.gridZ };
        }

        // Explotación: acción con mayor Q
        let best = null;
        let bestQ = -Infinity;
        for (const nb of neighbors) {
            const aKey = `${nb.gridX},${nb.gridZ}`;
            const qv = row.get(aKey) ?? 0;
            if (qv > bestQ) {
                bestQ = qv;
                best = nb;
            }
        }

        if (!best) {
            const pick =
                neighbors[Math.floor(Math.random() * neighbors.length)];
            return { gridX: pick.gridX, gridZ: pick.gridZ };
        }

        return { gridX: best.gridX, gridZ: best.gridZ };
    }

    /**
     * Llamado por el WalkerAgent cada vez que termina un segmento.
     * Aquí actualizamos la Q-table.
     */
    onNodeArrived(prevNode, newNode, info = {}) {
        const goalId = info.goalId || this.currentGoalId;
        if (!goalId || !prevNode || !newNode) return;

        let isGoal = !!info.isGoal;
        const poi = this.city.pointsOfInterest?.[goalId];
        const goalRoad = poi?.entranceRoad || null;

        if (goalRoad && !isGoal) {
            if (
                goalRoad.gridX === newNode.gridX &&
                goalRoad.gridZ === newNode.gridZ
            ) {
                isGoal = true;
            }
        }

        // Reward simple: lo que ya te funcionaba
        const reward = isGoal ? 1.0 : -0.05;

        const statePrev = this._stateKey(prevNode, goalId);
        const stateNew = this._stateKey(newNode, goalId);

        this._ensureState(statePrev);
        this._ensureState(stateNew);

        const rowPrev = this.q.get(statePrev);
        const rowNew = this.q.get(stateNew);

        // Aseguramos acciones del nuevo estado
        const neighborsNext = this._getNeighborsBounded(newNode) || [];
        neighborsNext.forEach((nb) => {
            const k = `${nb.gridX},${nb.gridZ}`;
            if (!rowNew.has(k)) rowNew.set(k, 0);
        });

        const actionKey = `${newNode.gridX},${newNode.gridZ}`;
        const oldQ = rowPrev.get(actionKey) ?? 0;

        let maxNext = 0;
        if (!isGoal && neighborsNext.length > 0) {
            maxNext = -Infinity;
            for (const nb of neighborsNext) {
                const k = `${nb.gridX},${nb.gridZ}`;
                const qv = rowNew.get(k) ?? 0;
                if (qv > maxNext) maxNext = qv;
            }
            if (maxNext === -Infinity) maxNext = 0;
        }

        const updatedQ =
            oldQ +
            this.alpha * (reward + this.gamma * maxNext - oldQ);

        rowPrev.set(actionKey, updatedQ);

        this.lastTransition = {
            prevNode,
            newNode,
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

    _endEpisode(isGoal) {
        this.episodeStats.push({
            episode: this.episodeCount,
            steps: this.episodeSteps,
            reachedGoal: !!isGoal,
        });
        if (this.episodeStats.length > this.maxEpisodeStats) {
            this.episodeStats.shift();
        }

        this.episodeCount += 1;
        this.episodeSteps = 0;

        // Decaimiento de epsilon
        if (this.epsilon > this.epsilonMin) {
            this.epsilon *= this.epsilonDecay;
            if (this.epsilon < this.epsilonMin) {
                this.epsilon = this.epsilonMin;
            }
        }
    }

    // ----------------- API para UI / overlays -----------------

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
            episodeStats: this.episodeStats.slice(),
        };
    }

    /**
     * Snapshot de la Q-table para un goalId concreto.
     */
    getQSnapshot(goalId) {
        const result = new Map();
        const targetGoal = goalId || this.currentGoalId;
        if (!targetGoal) return result;

        const prefix = `${targetGoal}|`;
        for (const [stateKey, row] of this.q.entries()) {
            if (!stateKey.startsWith(prefix)) continue;
            result.set(stateKey, new Map(row));
        }
        return result;
    }

    /**
     * Alias para overlays que esperen este nombre.
     */
    getPolicySnapshot(goalId) {
        return this.getQSnapshot(goalId);
    }
}