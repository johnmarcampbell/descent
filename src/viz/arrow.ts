import * as THREE from 'three';

// A draggable weight-vector gizmo: shaft + head + tip dot, an oversized
// invisible hit sphere at the tip for grabbing, and the unit's translucent
// decision plane (w·x + b = 0). Arrow length encodes |w| at W_SCALE.

export const W_SCALE = 0.55;
const HEAD_LEN = 0.16;

const SHAFT_GEO = new THREE.CylinderGeometry(0.017, 0.017, 1, 10);
const HEAD_GEO = new THREE.ConeGeometry(0.055, HEAD_LEN, 14);
const TIP_GEO = new THREE.SphereGeometry(0.045, 12, 10);
const HIT_GEO = new THREE.SphereGeometry(0.2, 10, 8);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const WHITE = new THREE.Color('#ffffff');

export class ArrowGizmo {
  readonly group = new THREE.Group();
  readonly hit: THREE.Mesh;
  private readonly shaft: THREE.Mesh;
  private readonly head: THREE.Mesh;
  private readonly tip: THREE.Mesh;
  private readonly plane: THREE.Mesh;
  private readonly mat: THREE.MeshBasicMaterial;
  private readonly planeMat: THREE.MeshBasicMaterial;
  private readonly baseColor: THREE.Color;
  private readonly basePlaneOpacity: number;
  private readonly dir = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private planeEnabled = true;
  private highlighted = false;
  private planeGeomOk = false;

  constructor(color: string, planeSize: number, planeOpacity = 0.08) {
    this.baseColor = new THREE.Color(color);
    this.basePlaneOpacity = planeOpacity;

    this.mat = new THREE.MeshBasicMaterial({ color: color });
    this.shaft = new THREE.Mesh(SHAFT_GEO, this.mat);
    this.head = new THREE.Mesh(HEAD_GEO, this.mat);
    this.tip = new THREE.Mesh(TIP_GEO, this.mat);

    this.planeMat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: planeOpacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(planeSize, planeSize), this.planeMat);

    this.hit = new THREE.Mesh(
      HIT_GEO,
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );

    this.group.add(this.shaft, this.head, this.tip, this.plane, this.hit);
  }

  update(w: ArrayLike<number>, b: number): void {
    const wl = Math.hypot(w[0], w[1], w[2]);
    if (wl > 1e-6) this.dir.set(w[0], w[1], w[2]).divideScalar(wl);
    else this.dir.set(1, 0, 0);

    const len = Math.max(wl * W_SCALE, 0.1);
    this.q.setFromUnitVectors(Y_AXIS, this.dir);

    const shaftLen = Math.max(len - HEAD_LEN, 0.02);
    this.shaft.scale.set(1, shaftLen, 1);
    this.shaft.position.copy(this.dir).multiplyScalar(shaftLen / 2);
    this.shaft.quaternion.copy(this.q);

    this.head.position.copy(this.dir).multiplyScalar(len - HEAD_LEN / 2);
    this.head.quaternion.copy(this.q);

    this.tip.position.copy(this.dir).multiplyScalar(len);
    this.hit.position.copy(this.tip.position);

    if (wl < 0.2) {
      this.planeGeomOk = false;
    } else {
      const off = -b / (wl * wl);
      this.plane.position.set(w[0] * off, w[1] * off, w[2] * off);
      this.planeGeomOk = this.plane.position.length() < 2.6;
      this.plane.quaternion.setFromUnitVectors(Z_AXIS, this.dir);
    }
    this.syncPlaneVisibility();
  }

  /** Master switch; a disabled plane still shows while its arrow is dragged. */
  setPlaneEnabled(on: boolean): void {
    this.planeEnabled = on;
    this.syncPlaneVisibility();
  }

  private syncPlaneVisibility(): void {
    this.plane.visible = (this.planeEnabled || this.highlighted) && this.planeGeomOk;
  }

  setHighlight(on: boolean): void {
    this.highlighted = on;
    this.mat.color.copy(this.baseColor);
    if (on) this.mat.color.lerp(WHITE, 0.4);
    this.planeMat.opacity = on
      ? Math.min(this.basePlaneOpacity * 2.4, 0.3)
      : this.basePlaneOpacity;
    this.tip.scale.setScalar(on ? 1.5 : 1);
    this.syncPlaneVisibility();
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    this.mat.dispose();
    this.planeMat.dispose();
    (this.hit.material as THREE.Material).dispose();
    this.plane.geometry.dispose();
  }
}
