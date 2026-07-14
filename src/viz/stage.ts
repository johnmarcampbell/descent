import * as THREE from 'three';
import { Viewports } from './viewports';
import { PointCloud } from './pointcloud';
import { ArrowGizmo } from './arrow';
import type { Unit } from '../network';
import { outSpaceIndex } from '../network';
import type { Session, LayerIndex } from '../session';
import { N_POINTS } from '../datasets';
import { UNIT_COLORS, OUT_COLOR, CLASS_COLORS } from '../theme';

// The whole 3D presentation as one unit: scissored viewports, one point
// cloud per activation space, one arrow gizmo per network unit, and the
// render loop. Subscribes to the session and keeps the scenes in sync;
// which DOM cells it draws into is constructor input, so desktop and
// mobile layouts can share it unchanged.

/** One gizmo on stage, addressed back to its unit in the session. */
export interface StageEntry {
  gizmo: ArrowGizmo;
  unit: Unit;
  layer: LayerIndex; // session address of the unit …
  idx: number;       // … within its layer
  view: number;
  isOut: boolean;
}

export class Stage {
  readonly vp: Viewports;
  readonly cells: HTMLElement[];

  private readonly session: Session;
  private readonly clouds: PointCloud[];
  private entriesList: StageEntry[] = [];
  private readonly showPlanes = { unit: false, out: true };
  private readonly classA = new THREE.Color(CLASS_COLORS[0]);
  private readonly classB = new THREE.Color(CLASS_COLORS[1]);
  // Optional per-cell chrome; skipped when a layout doesn't include it.
  private readonly captionEls: (HTMLElement | null)[];
  private readonly hintEl: HTMLElement | null;

  constructor(session: Session, canvas: HTMLCanvasElement, cells: HTMLElement[]) {
    this.session = session;
    this.cells = cells;
    this.vp = new Viewports(canvas, cells);
    this.captionEls = cells.map((el) => el.querySelector<HTMLElement>('.view-weights'));
    this.hintEl = cells[2]?.querySelector<HTMLElement>('.view-hint') ?? null;

    this.clouds = cells.map((_, i) => {
      const c = new PointCloud(N_POINTS);
      c.setPixelRatio(this.vp.renderer.getPixelRatio());
      this.vp.views[i].scene.add(c.object);
      return c;
    });
    this.recolor();

    session.subscribe((change) => {
      if (change === 'structure') this.syncStructure();
      else if (change === 'dataset') this.recolor();
      this.syncValues();
    });
    this.syncStructure();
    this.syncValues();
  }

  get entries(): readonly StageEntry[] {
    return this.entriesList;
  }

  // --- DragSurface ---

  cellRect(view: number): DOMRect {
    return this.cells[view].getBoundingClientRect();
  }

  camera(view: number): THREE.Camera {
    return this.vp.views[view].camera;
  }

  setViewInteraction(view: number, on: boolean): void {
    this.vp.views[view].controls.enabled = on;
  }

  /** Master plane visibility for hidden units ('unit') or the output ('out'). */
  setPlaneEnabled(kind: 'unit' | 'out', on: boolean): void {
    this.showPlanes[kind] = on;
    this.entriesList.forEach((e) => {
      if (e.isOut === (kind === 'out')) e.gizmo.setPlaneEnabled(on);
    });
  }

  /** Start the render loop. Points ease toward their targets (~70 ms
   * exponential smoothing) unless the user prefers reduced motion. */
  start(): void {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const clock = new THREE.Clock();
    const loop = (): void => {
      const dt = Math.min(clock.getDelta(), 0.1);
      this.frame(reduceMotion ? 1 : 1 - Math.exp(-dt / 0.07));
      requestAnimationFrame(loop);
    };
    loop();
  }

  /** Advance animations and draw. k = easing factor for point motion, 0..1. */
  frame(k: number): void {
    this.clouds.forEach((c, i) => {
      c.tick(k);
      const h = this.cells[i].clientHeight;
      c.setSizeScale(h > 0 ? Math.sqrt(Math.min(1, h / window.innerHeight)) : 1);
    });
    this.vp.views.forEach((v) => v.controls.update());
    this.vp.render();
  }

  private addGizmo(layer: LayerIndex, idx: number, color: string, view: number, planeSize: number, planeOpacity: number): void {
    const gizmo = new ArrowGizmo(color, planeSize, planeOpacity);
    this.vp.views[view].scene.add(gizmo.group);
    const isOut = layer === 2;
    gizmo.setPlaneEnabled(isOut ? this.showPlanes.out : this.showPlanes.unit);
    const entry: StageEntry = { gizmo, unit: this.session.unitAt(layer, idx), layer, idx, view, isOut };
    gizmo.hit.userData.entry = entry;
    this.entriesList.push(entry);
  }

  private syncStructure(): void {
    this.entriesList.forEach((e) => e.gizmo.dispose());
    this.entriesList = [];

    const net = this.session.net;
    net.hidden[0].forEach((_, i) => this.addGizmo(0, i, UNIT_COLORS[i], 0, 3.4, 0.08));
    net.hidden[1].forEach((_, i) => this.addGizmo(1, i, UNIT_COLORS[i], 1, 2.4, 0.08));

    const os = outSpaceIndex(net);
    this.addGizmo(2, 0, OUT_COLOR, os, 2.4, 0.16);

    const hasH2 = net.hidden[1].length > 0;
    this.clouds[2].object.visible = hasH2;
    if (this.hintEl) this.hintEl.hidden = hasH2;
    const captions = [
      'arrows: hidden-1 weights',
      hasH2 ? 'arrows: hidden-2 weights' : 'arrow: output weights',
      hasH2 ? 'arrow: output weights' : '',
    ];
    this.captionEls.forEach((el, i) => { if (el) el.textContent = captions[i]; });
  }

  private syncValues(): void {
    this.clouds[0].setTargets(this.session.data.X);
    this.clouds[1].setTargets(this.session.res.h1);
    this.clouds[2].setTargets(this.session.res.h2);
    this.entriesList.forEach((e) => e.gizmo.update(e.unit.w, e.unit.b));
  }

  private recolor(): void {
    this.clouds.forEach((c) => c.setColors(this.session.data.y, this.classA, this.classB));
  }
}
