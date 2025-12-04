// src/agents/WalkerAgent.js
import * as THREE from "three";
import { gridToWorld } from "../city/cityScene.js";

/**
 * Crea el modelo 3D del muñequito.
 */
function createWalkerMesh() {
  const group = new THREE.Group();

  // Cuerpo
  const bodyGeom = new THREE.CapsuleGeometry(0.25, 0.7, 8, 16);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x2e86de,
    roughness: 0.4,
    metalness: 0.1,
  });
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  body.position.y = 0.7;
  group.add(body);

  // Cabeza
  const headGeom = new THREE.SphereGeometry(0.25, 16, 16);
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xffe0bd,
    roughness: 0.5,
    metalness: 0.05,
  });
  const head = new THREE.Mesh(headGeom, headMat);
  head.castShadow = true;
  head.receiveShadow = true;
  head.position.y = 1.25;
  group.add(head);

  // 👀 Ojitos (esferas pequeñas)
  const eyeGeom = new THREE.SphereGeometry(0.03, 8, 8);
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x000000,
    roughness: 0.5,
    metalness: 0.0,
  });

  const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
  leftEye.position.set(-0.07, 1.3, 0.23);
  leftEye.castShadow = false;
  leftEye.receiveShadow = false;
  group.add(leftEye);

  const rightEye = leftEye.clone();
  rightEye.position.x *= -1; // espejo en X
  group.add(rightEye);

  // 😄 Sonrisita (curva dibujada con Line)
  const smileCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-0.09, 1.2, 0.23),
    new THREE.Vector3(0.0, 1.13, 0.25),
    new THREE.Vector3(0.09, 1.2, 0.23)
  );
  const smilePoints = smileCurve.getPoints(20);
  const smileGeom = new THREE.BufferGeometry().setFromPoints(smilePoints);
  const smileMat = new THREE.LineBasicMaterial({ color: 0x000000 });
  const smile = new THREE.Line(smileGeom, smileMat);
  group.add(smile);

  return group;
}

/**
 * WalkerAgent:
 * - Se mueve sobre banquetas alrededor de las calles.
 * - Usa un "brain" (ShortestPathBrain, QLearningBrain, etc.)
 *   para decidir el siguiente nodo de calle al que moverse.
 */
export class WalkerAgent {
  /**
   * @param {object} city  - objeto retornado por createCity(scene)
   * @param {THREE.Scene} scene
   * @param {object|null} brain - objeto con método chooseNextRoad(currentNode)
   * @param {object} options - { startRoad?: {gridX,gridZ}, speed?: number }
   */
  constructor(city, scene, brain, options = {}) {
    this.city = city;
    this.scene = scene;
    this.brain = brain || null;

    // Nodo de calle actual (grid)
    this.currentRoadNode =
      options.startRoad ||
      this._findDefaultStartRoadNode() || { gridX: 0, gridZ: 0 };

    // Nodo destino de este segmento (grid)
    this.targetRoadNode = null;

    // Movimiento
    this.speed = options.speed || 3; // unidades mundo / segundo
    this.segmentDuration = 1.0; // se ajusta en cada segmento según distancia
    this.segmentElapsed = 0;
    this.moving = false;

    // Posiciones mundo para interpolar
    this.segmentStartPos = new THREE.Vector3();
    this.segmentEndPos = new THREE.Vector3();

    // Altura base del muñequito
    this.baseY = 0.25;

    // Objetivo actual ("home", "shop"...)
    this.currentGoalId = null;

    // Offset desde el centro de la calle hacia la banqueta
    this.sidewalkOffset =
      this.city.sidewalkOffset ||
      this.city.cellSize / 2 + (this.city.sidewalkWidth || 1) / 2 - 0.02;

    // Crear modelo 3D
    this.object3D = createWalkerMesh();
    this.scene.add(this.object3D);

    // Colocarlo inicialmente en el centro de su nodo de calle
    const initialWorld = gridToWorld(
      this.city,
      this.currentRoadNode.gridX,
      this.currentRoadNode.gridZ,
      this.baseY
    );
    this.object3D.position.set(initialWorld.x, this.baseY, initialWorld.z);
    this.object3D.rotation.y = Math.PI; // orientación inicial cualquiera
  }

  /**
   * Si no se especifica startRoad, tratamos de usar la entrada de la casa.
   */
  _findDefaultStartRoadNode() {
    const poiHome = this.city.pointsOfInterest?.home;
    if (poiHome?.entranceRoad) {
      return {
        gridX: poiHome.entranceRoad.gridX,
        gridZ: poiHome.entranceRoad.gridZ,
      };
    }
    // fallback simple: alguna calle del centro
    const mid = Math.floor(this.city.gridSize / 2);
    return { gridX: mid, gridZ: mid };
  }

  /**
   * Setear objetivo de alto nivel (home, shop, etc).
   * Esto delega en el brain, que recalcula la política/plan desde donde esté.
   */
  setGoal(goalId) {
    this.currentGoalId = goalId || null;

    if (this.brain && typeof this.brain.setGoal === "function") {
      const start = this.getCurrentRoadNode();
      this.brain.setGoal(goalId, start);
    }

    this.moving = false;
    this.targetRoadNode = null;
    this.segmentElapsed = 0;
  }

  /**
   * Devuelve el nodo de calle actual.
   */
  getCurrentRoadNode() {
    return {
      gridX: this.currentRoadNode.gridX,
      gridZ: this.currentRoadNode.gridZ,
    };
  }

  /**
   * Devuelve la posición mundo actual del muñequito.
   */
  getWorldPosition(target = new THREE.Vector3()) {
    return target.copy(this.object3D.position);
  }

  /**
   * Devuelve true si el walker está exactamente en el nodo de calle dado.
   */
  isAtRoadNode(node) {
    if (!node) return false;
    return (
      this.currentRoadNode.gridX === node.gridX &&
      this.currentRoadNode.gridZ === node.gridZ
    );
  }

  /**
   * Útil para lógica externa: verificar si llegó a un POI.
   */
  isAtPOI(poi) {
    if (!poi?.entranceRoad) return false;
    return this.isAtRoadNode(poi.entranceRoad);
  }

  /**
   * Update por frame.
   * @param {number} dt - delta time en segundos
   */
  update(dt) {
    if (!this.moving) {
      this._startNextSegment();
    }

    if (!this.moving) return;

    this.segmentElapsed += dt;
    let t = this.segmentElapsed / this.segmentDuration;
    if (t >= 1) t = 1;

    // Interpolamos posición
    this.object3D.position.lerpVectors(
      this.segmentStartPos,
      this.segmentEndPos,
      t
    );

    // Pequeño bob de caminata
    const bob = Math.sin(t * Math.PI * 2) * 0.03;
    this.object3D.position.y = this.segmentStartPos.y + bob;

    if (t >= 1) {
      // Llegamos al nodo destino
      const prevNode = { ...this.currentRoadNode };
      this.currentRoadNode = { ...this.targetRoadNode };

      this.moving = false;
      this.segmentElapsed = 0;
      this.targetRoadNode = null;

      // Piso estable
      this.object3D.position.y = this.segmentEndPos.y;

      // 🔥 Hook de aprendizaje: avisar al brain (si lo soporta)
      if (this.brain && typeof this.brain.onNodeArrived === "function") {
        const goalId = this.currentGoalId;
        const poi =
          goalId && this.city.pointsOfInterest
            ? this.city.pointsOfInterest[goalId]
            : null;

        let isGoal = false;
        if (poi?.entranceRoad) {
          isGoal =
            this.currentRoadNode.gridX === poi.entranceRoad.gridX &&
            this.currentRoadNode.gridZ === poi.entranceRoad.gridZ;
        }

        // Reward más fuerte:
        // - cada paso: castigo moderado
        // - llegar a la meta: recompensa grande
        const reward = isGoal ? 5.0 : -0.1;

        this.brain.onNodeArrived(prevNode, this.currentRoadNode, {
          goalId,
          isGoal,
          reward,
        });
      }
    }
  }

  /**
   * Inicia un nuevo segmento de movimiento pidiéndole al brain
   * el siguiente nodo de calle. Si no hay brain, se queda quieto.
   */
  _startNextSegment() {
    const currentNode = this.getCurrentRoadNode();

    // Preguntamos al brain
    let nextNode = null;
    if (this.brain && typeof this.brain.chooseNextRoad === "function") {
      nextNode = this.brain.chooseNextRoad(currentNode);
    }

    if (!nextNode) {
      this.moving = false;
      return;
    }

    const dx = nextNode.gridX - currentNode.gridX;
    const dz = nextNode.gridZ - currentNode.gridZ;
    const dist = Math.abs(dx) + Math.abs(dz);
    if (dist !== 1) {
      console.warn(
        "[WalkerAgent] nextNode no es vecino directo:",
        currentNode,
        nextNode
      );
      this.moving = false;
      return;
    }

    const axis = Math.abs(dx) === 1 ? "horizontal" : "vertical";

    // Inicio = donde está AHORITA el mono
    const startPos = this.getWorldPosition(new THREE.Vector3());
    // Fin = posición ideal en la banqueta para el nodo destino
    const endPos = this._computeSidewalkPositionForAxis(nextNode, axis);

    this.segmentStartPos.copy(startPos);
    this.segmentEndPos.copy(endPos);

    // Orientar al muñequito hacia la dirección del movimiento
    const dirVec = new THREE.Vector3(
      endPos.x - startPos.x,
      0,
      endPos.z - startPos.z
    );
    dirVec.normalize();
    const angle = Math.atan2(dirVec.x, dirVec.z);
    this.object3D.rotation.y = angle;

    const distance = startPos.distanceTo(endPos);
    this.segmentDuration = distance / this.speed;
    this.segmentElapsed = 0;
    this.moving = true;

    this.targetRoadNode = { ...nextNode };
  }

  /**
   * Dado un nodo de calle y el eje de movimiento (horizontal/vertical),
   * devolvemos la posición mundo donde debería pisar el muñequito en la banqueta.
   *
   * Convención:
   * - Movimiento horizontal (este/oeste) -> banqueta del lado "norte" (z-)
   * - Movimiento vertical (norte/sur)    -> banqueta del lado "este"  (x+)
   */
  _computeSidewalkPositionForAxis(node, axis) {
    const base = gridToWorld(
      this.city,
      node.gridX,
      node.gridZ,
      this.baseY
    );

    const pos = new THREE.Vector3(base.x, this.baseY, base.z);

    if (axis === "horizontal") {
      // banqueta al norte de la calle
      pos.z -= this.sidewalkOffset;
    } else {
      // eje vertical -> banqueta al este de la calle
      pos.x += this.sidewalkOffset;
    }

    return pos;
  }
}