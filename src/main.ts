import './style.css';
import * as THREE from 'three';
import { Viewports } from './viz/viewports';
import { PointCloud } from './viz/pointcloud';
import { ArrowGizmo, W_SCALE } from './viz/arrow';
import {
  makeNet, forward, allocResult, sanitize, outSpaceIndex, spaceDims, randomUnit,
  MAX_W, MIN_W,
} from './network';
import type { Net, Unit } from './network';
import { generate, DATASET_NAMES, N_POINTS } from './datasets';
import { Panel, UNIT_COLORS, OUT_COLOR, CLASS_COLORS } from './ui';

// ---------- state ----------

let data = generate('rings');
const net: Net = makeNet();
const res = allocResult(N_POINTS);

const classA = new THREE.Color(CLASS_COLORS[0]);
const classB = new THREE.Color(CLASS_COLORS[1]);

// ---------- scenes ----------

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const viewEls = [0, 1, 2].map((i) => document.getElementById(`view-${i}`)!);
const weightsEls = [0, 1, 2].map((i) => document.getElementById(`weights-${i}`)!);
const hint2 = document.getElementById('hint-2')!;
const viewsEl = document.getElementById('views')!;

const vp = new Viewports(canvas, viewEls);

const clouds = [new PointCloud(N_POINTS), new PointCloud(N_POINTS), new PointCloud(N_POINTS)];
clouds.forEach((c, i) => {
  c.setPixelRatio(vp.renderer.getPixelRatio());
  c.setColors(data.y, classA, classB);
  vp.views[i].scene.add(c.object);
});

// ---------- weight gizmos ----------

interface Entry {
  gizmo: ArrowGizmo;
  unit: Unit;
  space: 0 | 1 | 2; // which space the weight vector lives in (drag constraints)
  view: number;
  isOut: boolean;
}

let entries: Entry[] = [];
const showPlanes = { unit: false, out: true };

function addGizmo(unit: Unit, color: string, space: 0 | 1 | 2, view: number, planeSize: number, planeOpacity: number): void {
  const gizmo = new ArrowGizmo(color, planeSize, planeOpacity);
  vp.views[view].scene.add(gizmo.group);
  const isOut = unit === net.out;
  gizmo.setPlaneEnabled(isOut ? showPlanes.out : showPlanes.unit);
  const entry: Entry = { gizmo, unit, space, view, isOut };
  gizmo.hit.userData.entry = entry;
  entries.push(entry);
}

function rebuildGizmos(): void {
  entries.forEach((e) => e.gizmo.dispose());
  entries = [];

  net.hidden[0].forEach((u, i) => addGizmo(u, UNIT_COLORS[i], 0, 0, 3.4, 0.08));
  net.hidden[1].forEach((u, i) => addGizmo(u, UNIT_COLORS[i], 1, 1, 2.4, 0.08));

  const os = outSpaceIndex(net);
  addGizmo(net.out, OUT_COLOR, os, os, 2.4, 0.16);

  const hasH2 = net.hidden[1].length > 0;
  clouds[2].object.visible = hasH2;
  hint2.hidden = hasH2;
  weightsEls[0].textContent = 'arrows: hidden-1 weights';
  weightsEls[1].textContent = hasH2 ? 'arrows: hidden-2 weights' : 'arrow: output weights';
  weightsEls[2].textContent = hasH2 ? 'arrow: output weights' : '';
}

// ---------- forward pass ----------

function recompute(): void {
  sanitize(net);
  forward(net, data.X, data.y, N_POINTS, res);
  clouds[0].setTargets(data.X);
  clouds[1].setTargets(res.h1);
  clouds[2].setTargets(res.h2);
  entries.forEach((e) => e.gizmo.update(e.unit.w, e.unit.b));
  panel.updateScore(res.accuracy, res.loss);
}

// ---------- panel ----------

const panel = new Panel(document.getElementById('panel')!, DATASET_NAMES, 'rings', {
  onBias(layer, idx, value) {
    const unit = layer === 2 ? net.out : net.hidden[layer as 0 | 1][idx];
    unit.b = value;
    recompute();
  },
  onAddUnit(layer) {
    net.hidden[layer as 0 | 1].push(randomUnit());
    structureChanged();
    // A first hidden-2 unit opens a new space (and the output arrow moves
    // there) — bring it into view.
    if (layer === 1 && net.hidden[1].length === 1) setDepth(1);
  },
  onRemoveUnit(layer, idx) {
    net.hidden[layer as 0 | 1].splice(idx, 1);
    structureChanged();
  },
  onDataset(name) {
    data = generate(name);
    clouds.forEach((c) => c.setColors(data.y, classA, classB));
    recompute();
  },
  onReset() {
    for (const layer of net.hidden) {
      layer.forEach((u, i) => { layer[i] = randomUnit(); });
    }
    net.out = randomUnit();
    structureChanged();
  },
  onTogglePlane(kind, on) {
    showPlanes[kind] = on;
    entries.forEach((e) => {
      if (e.isOut === (kind === 'out')) e.gizmo.setPlaneEnabled(on);
    });
  },
});

function structureChanged(): void {
  sanitize(net);
  rebuildGizmos();
  panel.renderStructure(net);
  recompute();
}

// ---------- layer navigation & focus ----------
// Two consecutive spaces are on screen at a time: [depth, depth + 1]. In
// focus mode one of them fills the area and the other becomes a minimap.

const navAsc = document.getElementById('nav-asc') as HTMLButtonElement;
const navDesc = document.getElementById('nav-desc') as HTMLButtonElement;
let depth = 0;
let focusPos: 0 | 1 | null = null; // offset of the focused view in the window

function updateLayout(): void {
  viewsEl.classList.toggle('focus', focusPos !== null);
  viewEls.forEach((el, i) => {
    const visible = i === depth || i === depth + 1;
    el.classList.toggle('offstage', !visible);
    const isMinimap = focusPos !== null && visible && i - depth !== focusPos;
    el.classList.toggle('minimap', isMinimap);

    if (visible && i === depth + 1 && focusPos === null) el.dataset.pos = 'second';
    else delete el.dataset.pos;

    const btn = el.querySelector<HTMLButtonElement>('.focus-btn')!;
    if (focusPos === null) {
      btn.textContent = '⛶';
      btn.title = 'focus this layer';
    } else if (isMinimap) {
      btn.textContent = '⤢';
      btn.title = 'swap focus';
    } else {
      btn.textContent = '⊟';
      btn.title = 'back to split view';
    }
  });
  navAsc.hidden = depth === 0;
  navDesc.hidden = depth === 1;
}

function setDepth(d: number): void {
  depth = Math.max(0, Math.min(1, d));
  updateLayout();
}

navAsc.addEventListener('click', () => setDepth(depth - 1));
navDesc.addEventListener('click', () => setDepth(depth + 1));

viewEls.forEach((el, i) => {
  const btn = el.querySelector<HTMLButtonElement>('.focus-btn')!;
  // Keep the press from reaching OrbitControls on the cell.
  btn.addEventListener('pointerdown', (e) => e.stopPropagation());
  btn.addEventListener('click', () => {
    const pos = (i - depth) as 0 | 1;
    focusPos = focusPos === pos ? null : pos;
    updateLayout();
  });
});

window.addEventListener('keydown', (e) => {
  const tag = (document.activeElement as HTMLElement | null)?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT') return; // sliders use arrow keys
  if (e.key === 'ArrowLeft') setDepth(depth - 1);
  else if (e.key === 'ArrowRight') setDepth(depth + 1);
});

// ---------- dragging ----------

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const dragPlane = new THREE.Plane();
const camDir = new THREE.Vector3();
const hitPoint = new THREE.Vector3();

let drag: Entry | null = null;

function raycastEntries(view: number, e: PointerEvent): Entry | null {
  const rect = viewEls[view].getBoundingClientRect();
  ndc.set(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(ndc, vp.views[view].camera);
  const hits = entries.filter((en) => en.view === view).map((en) => en.gizmo.hit);
  const found = raycaster.intersectObjects(hits, false);
  return found.length > 0 ? (found[0].object.userData.entry as Entry) : null;
}

function viewIndexOf(e: Event): number {
  const cell = (e.target as HTMLElement).closest?.('.view') as HTMLElement | null;
  return cell ? Number(cell.dataset.view) : -1;
}

// Capture phase on the container so a gizmo grab can stop the event before
// the cell's OrbitControls sees it.
viewsEl.addEventListener(
  'pointerdown',
  (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    vp.views.forEach((v) => { v.controls.autoRotate = false; });
    const view = viewIndexOf(e);
    if (view < 0) return;
    const entry = raycastEntries(view, e);
    if (!entry) return;

    e.stopPropagation();
    drag = entry;
    vp.views[view].controls.enabled = false;
    vp.views[view].camera.getWorldDirection(camDir);
    dragPlane.setFromNormalAndCoplanarPoint(camDir, entry.gizmo.hit.position);
    entry.gizmo.setHighlight(true);
    document.body.style.cursor = 'grabbing';
  },
  true,
);

window.addEventListener('pointermove', (e: PointerEvent) => {
  if (drag) {
    const view = drag.view;
    const rect = viewEls[view].getBoundingClientRect();
    ndc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, vp.views[view].camera);
    if (!raycaster.ray.intersectPlane(dragPlane, hitPoint)) return;

    // Tip position → weight vector, constrained to the dims this space has.
    const dims = spaceDims(net, drag.space);
    const w: number[] = [hitPoint.x / W_SCALE, hitPoint.y / W_SCALE, hitPoint.z / W_SCALE];
    for (let d = dims; d < 3; d++) w[d] = 0;
    let norm = Math.hypot(w[0], w[1], w[2]);
    if (norm < 1e-4) return;
    const clamped = Math.max(MIN_W, Math.min(MAX_W, norm));
    const s = clamped / norm;
    drag.unit.w[0] = w[0] * s;
    drag.unit.w[1] = w[1] * s;
    drag.unit.w[2] = w[2] * s;
    recompute();
    return;
  }

  // Hover affordance.
  if ((e.target as HTMLElement).closest?.('button')) return;
  const view = viewIndexOf(e);
  if (view >= 0) {
    viewEls[view].style.cursor = raycastEntries(view, e) ? 'grab' : '';
  }
});

window.addEventListener('pointerup', () => {
  if (!drag) return;
  drag.gizmo.setHighlight(false);
  vp.views[drag.view].controls.enabled = true;
  drag = null;
  document.body.style.cursor = '';
});

// ---------- boot & render loop ----------

panel.renderStructure(net);
rebuildGizmos();
recompute();
setDepth(0);

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clock = new THREE.Clock();

function frame(): void {
  const dt = Math.min(clock.getDelta(), 0.1);
  const k = reduceMotion ? 1 : 1 - Math.exp(-dt / 0.07);
  clouds.forEach((c, i) => {
    c.tick(k);
    const h = viewEls[i].clientHeight;
    c.setSizeScale(h > 0 ? Math.sqrt(Math.min(1, h / window.innerHeight)) : 1);
  });
  vp.views.forEach((v) => v.controls.update());
  vp.render();
  requestAnimationFrame(frame);
}

frame();

// Debug/testing handle (harmless in production; the app has no secrets).
Object.defineProperty(window, '__descent', {
  value: { net, vp, getEntries: () => entries, getResult: () => res },
});
