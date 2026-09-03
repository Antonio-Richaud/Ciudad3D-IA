// src/agents/WalkerAgent.js
import * as THREE from "three";
import { gridToWorld } from "../city/cityScene.js";

function createWalkerMesh() {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.25, 0.7, 8, 16),
    new THREE.MeshStandardMaterial({
      color: 0x2e86de,
      roughness: 0.4,
      metalness: 0.1,
    })
  );
  body.castShadow = true;
  body.receiveShadow = true;
  body.position.y = 0.7;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 16, 16),
    new THREE.MeshStandardMaterial({
      color: 0xffe0bd,
      roughness: 0.5,
      metalness: 0.05,
    })
  );
  head.castShadow = true;
  head.receiveShadow = true;
  head.position.y = 1.25;
  group.add(head);

  const eyeGeometry = new THREE.SphereGeometry(0.03, 8, 8);
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });

  for (const x of [-0.07, 0.07]) {
    const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    eye.position.set(x, 1.3, 0.23);
    group.add(eye);
  }

  const smileCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-0.09, 1.2, 0.23),
    new THREE.Vector3(0, 1.13, 0.25),
    new THREE.Vector3(0.09, 1.2, 0.23)
  );
  const smile = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(smileCurve.getPoints(20)),
    new THREE.LineBasicMaterial({ color: 0x000000 })
  );
  group.add(smile);

  return group;
}

export class WalkerAgent {
  constructor(city, scene, brain = null, options = {}) {
    this.city = city;
    this.scene = scene;
    this.brain = brain;

    this.currentRoadNode =
      options.startRoad || this._findDefaultStartRoadNode();
    this.targetRoadNode = null;
    this.currentGoalId = null;

    this.speed = options.speed ?? 3;
    this.segmentDuration = 1;
    this.segmentElapsed = 0;
    this.moving = false;

    this.segmentStartPos = new THREE.Vector3();
    this.segmentEndPos = new THREE.Vector3();
    this.baseY = 0.25;

    this.sidewalkOffset =
      this.city.sidewalkOffset ??
      this.city.cellSize / 2 + (this.city.sidewalkWidth ?? 1) / 2 - 0.02;

    this.object3D = createWalkerMesh();
    this.scene.add(this.object3D);

    const initialWorld = gridToWorld(
      this.city,
      this.currentRoadNode.gridX,
      this.currentRoadNode.gridZ,
      this.baseY
    );

    this.object3D.position.set(initialWorld.x, this.baseY, initialWorld.z);
    this.object3D.rotation.y = Math.PI;
  }

  _findDefaultStartRoadNode() {
    const homeEntrance = this.city.pointsOfInterest?.home?.entranceRoad;
    if (homeEntrance) return { ...homeEntrance };

    const firstRoad = this.city.roadMap.values().next().value;
    if (!firstRoad) {
      throw new Error("[WalkerAgent] La ciudad no contiene nodos de calle.");
    }

    return { gridX: firstRoad.gridX, gridZ: firstRoad.gridZ };
  }

  setGoal(goalId) {
    this.currentGoalId = goalId || null;
    this.brain?.setGoal?.(this.currentGoalId, this.getCurrentRoadNode());

    this.moving = false;
    this.targetRoadNode = null;
    this.segmentElapsed = 0;
  }

  getCurrentRoadNode() {
    return { ...this.currentRoadNode };
  }

  getWorldPosition(target = new THREE.Vector3()) {
    return target.copy(this.object3D.position);
  }

  isAtRoadNode(node) {
    return Boolean(
      node &&
        this.currentRoadNode.gridX === node.gridX &&
        this.currentRoadNode.gridZ === node.gridZ
    );
  }

  isAtPOI(poi) {
    return Boolean(poi?.entranceRoad && this.isAtRoadNode(poi.entranceRoad));
  }

  update(dt) {
    if (!this.moving) this._startNextSegment();
    if (!this.moving) return;

    this.segmentElapsed += dt;
    const t = Math.min(1, this.segmentElapsed / this.segmentDuration);

    this.object3D.position.lerpVectors(
      this.segmentStartPos,
      this.segmentEndPos,
      t
    );
    this.object3D.position.y =
      this.segmentStartPos.y + Math.sin(t * Math.PI * 2) * 0.03;

    if (t < 1) return;

    const previousNode = { ...this.currentRoadNode };
    this.currentRoadNode = { ...this.targetRoadNode };
    this.targetRoadNode = null;
    this.moving = false;
    this.segmentElapsed = 0;
    this.object3D.position.y = this.segmentEndPos.y;

    const poi = this.currentGoalId
      ? this.city.pointsOfInterest?.[this.currentGoalId]
      : null;
    const isGoal = Boolean(poi && this.isAtPOI(poi));

    this.brain?.onNodeArrived?.(previousNode, this.currentRoadNode, {
      goalId: this.currentGoalId,
      isGoal,
    });
  }

  _startNextSegment() {
    const currentNode = this.getCurrentRoadNode();
    const nextNode = this.brain?.chooseNextRoad?.(currentNode) || null;

    if (!nextNode) return;

    const dx = nextNode.gridX - currentNode.gridX;
    const dz = nextNode.gridZ - currentNode.gridZ;

    if (Math.abs(dx) + Math.abs(dz) !== 1) {
      console.warn("[WalkerAgent] El brain devolvió un nodo no adyacente.", {
        currentNode,
        nextNode,
      });
      return;
    }

    const axis = Math.abs(dx) === 1 ? "horizontal" : "vertical";
    const startPos = this.getWorldPosition(new THREE.Vector3());
    const endPos = this._computeSidewalkPositionForAxis(nextNode, axis);

    this.segmentStartPos.copy(startPos);
    this.segmentEndPos.copy(endPos);

    const direction = endPos.clone().sub(startPos);
    direction.y = 0;
    direction.normalize();
    this.object3D.rotation.y = Math.atan2(direction.x, direction.z);

    this.segmentDuration = Math.max(
      Number.EPSILON,
      startPos.distanceTo(endPos) / this.speed
    );
    this.segmentElapsed = 0;
    this.targetRoadNode = { ...nextNode };
    this.moving = true;
  }

  _computeSidewalkPositionForAxis(node, axis) {
    const world = gridToWorld(
      this.city,
      node.gridX,
      node.gridZ,
      this.baseY
    );
    const position = new THREE.Vector3(world.x, this.baseY, world.z);

    if (axis === "horizontal") {
      position.z -= this.sidewalkOffset;
    } else {
      position.x += this.sidewalkOffset;
    }

    return position;
  }
}
