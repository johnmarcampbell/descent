import './style.css';
import * as THREE from 'three';
import { Stage } from './viz/stage';
import type { StageEntry } from './viz/stage';
import { W_SCALE } from './viz/arrow';
import { DATASET_NAMES } from './datasets';
import { Session } from './session';
import type { LayerIndex } from './session';
import { Panel } from './ui';

// ---------- session & stage ----------

const session = new Session('rings');

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const viewEls = [0, 1, 2].map((i) => document.getElementById(`view-${i}`)!);
const viewsEl = document.getElementById('views')!;

const stage = new Stage(session, canvas, viewEls);

// ---------- panel ----------

const panel = new Panel(document.getElementById('panel')!, DATASET_NAMES, session.datasetName, {
  onBias(layer, idx, value) {
    session.setBias(layer as LayerIndex, idx, value);
  },
  onAddUnit(layer) {
    session.addUnit(layer as 0 | 1);
    // A first hidden-2 unit opens a new space (and the output arrow moves
    // there) — bring it into view.
    if (layer === 1 && session.net.hidden[1].length === 1) setDepth(1);
  },
  onRemoveUnit(layer, idx) {
    session.removeUnit(layer as 0 | 1, idx);
  },
  onDataset(name) {
    session.setDataset(name);
  },
  onReset() {
    session.randomize();
  },
  onTogglePlane(kind, on) {
    stage.setPlaneEnabled(kind, on);
  },
});

session.subscribe((change) => {
  if (change === 'structure') panel.renderStructure(session.net);
  panel.updateScore(session.res.accuracy, session.res.loss);
});

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

let drag: StageEntry | null = null;

function raycastEntries(view: number, e: PointerEvent): StageEntry | null {
  const rect = viewEls[view].getBoundingClientRect();
  ndc.set(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(ndc, stage.vp.views[view].camera);
  const hits = stage.entries.filter((en) => en.view === view).map((en) => en.gizmo.hit);
  const found = raycaster.intersectObjects(hits, false);
  return found.length > 0 ? (found[0].object.userData.entry as StageEntry) : null;
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
    stage.vp.views.forEach((v) => { v.controls.autoRotate = false; });
    const view = viewIndexOf(e);
    if (view < 0) return;
    const entry = raycastEntries(view, e);
    if (!entry) return;

    e.stopPropagation();
    drag = entry;
    stage.vp.views[view].controls.enabled = false;
    stage.vp.views[view].camera.getWorldDirection(camDir);
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
    raycaster.setFromCamera(ndc, stage.vp.views[view].camera);
    if (!raycaster.ray.intersectPlane(dragPlane, hitPoint)) return;

    // Tip position → raw weight candidate; the session constrains it to the
    // dims this space has and clamps ‖w‖.
    session.setWeight(drag.layer, drag.idx, [
      hitPoint.x / W_SCALE, hitPoint.y / W_SCALE, hitPoint.z / W_SCALE,
    ]);
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
  stage.vp.views[drag.view].controls.enabled = true;
  drag = null;
  document.body.style.cursor = '';
});

// ---------- boot & render loop ----------

panel.renderStructure(session.net);
panel.updateScore(session.res.accuracy, session.res.loss);
setDepth(0);

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clock = new THREE.Clock();

function frame(): void {
  const dt = Math.min(clock.getDelta(), 0.1);
  const k = reduceMotion ? 1 : 1 - Math.exp(-dt / 0.07);
  stage.frame(k);
  requestAnimationFrame(frame);
}

frame();

// Debug/testing handle (harmless in production; the app has no secrets).
Object.defineProperty(window, '__descent', {
  value: {
    session,
    stage,
    net: session.net,
    vp: stage.vp,
    getEntries: () => stage.entries,
    getResult: () => session.res,
  },
});
