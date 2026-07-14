import './style.css';
import * as THREE from 'three';
import { Stage } from './viz/stage';
import { DragController } from './drag';
import { LayerWindow } from './layerwindow';
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
    if (layer === 1 && session.net.hidden[1].length === 1) layers.reveal(2);
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

// ---------- layer navigation & focus: desktop adapter over LayerWindow ----------

const navAsc = document.getElementById('nav-asc') as HTMLButtonElement;
const navDesc = document.getElementById('nav-desc') as HTMLButtonElement;
const layers = new LayerWindow(3, 2);

const FOCUS_BTN: Record<string, [string, string]> = {
  focused: ['⊟', 'back to split view'],
  minimap: ['⤢', 'swap focus'],
  default: ['⛶', 'focus this layer'],
};

function applyLayout(): void {
  viewsEl.classList.toggle('focus', layers.focused);
  viewEls.forEach((el, i) => {
    const role = layers.roleOf(i);
    el.classList.toggle('offstage', role === 'offstage');
    el.classList.toggle('minimap', role === 'minimap');
    if (role === 'second') el.dataset.pos = 'second';
    else delete el.dataset.pos;

    const btn = el.querySelector<HTMLButtonElement>('.focus-btn')!;
    const [glyph, title] = FOCUS_BTN[role] ?? FOCUS_BTN.default;
    btn.textContent = glyph;
    btn.title = title;
  });
  navAsc.hidden = !layers.canAscend;
  navDesc.hidden = !layers.canDescend;
}

layers.subscribe(applyLayout);

navAsc.addEventListener('click', () => layers.ascend());
navDesc.addEventListener('click', () => layers.descend());

viewEls.forEach((el, i) => {
  const btn = el.querySelector<HTMLButtonElement>('.focus-btn')!;
  // Keep the press from reaching OrbitControls on the cell.
  btn.addEventListener('pointerdown', (e) => e.stopPropagation());
  btn.addEventListener('click', () => layers.toggleFocus(i));
});

window.addEventListener('keydown', (e) => {
  const tag = (document.activeElement as HTMLElement | null)?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT') return; // sliders use arrow keys
  if (e.key === 'ArrowLeft') layers.ascend();
  else if (e.key === 'ArrowRight') layers.descend();
});

// ---------- dragging: desktop pointer adapter over DragController ----------

const dragger = new DragController(session, stage);

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
    if (!dragger.begin(view, e.clientX, e.clientY)) return;

    e.stopPropagation();
    document.body.style.cursor = 'grabbing';
  },
  true,
);

window.addEventListener('pointermove', (e: PointerEvent) => {
  if (dragger.active) {
    dragger.move(e.clientX, e.clientY);
    return;
  }

  // Hover affordance.
  if ((e.target as HTMLElement).closest?.('button')) return;
  const view = viewIndexOf(e);
  if (view >= 0) {
    viewEls[view].style.cursor = dragger.pick(view, e.clientX, e.clientY) ? 'grab' : '';
  }
});

window.addEventListener('pointerup', () => {
  if (!dragger.active) return;
  dragger.end();
  document.body.style.cursor = '';
});

// ---------- boot & render loop ----------

panel.renderStructure(session.net);
panel.updateScore(session.res.accuracy, session.res.loss);
applyLayout();

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
