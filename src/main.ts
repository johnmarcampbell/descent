import './style.css';
import { Session } from './session';
import type { LayerIndex } from './session';
import { Stage } from './viz/stage';
import { DragController } from './drag';
import { LayerWindow } from './layerwindow';
import { History } from './history';
import { Panel } from './ui';
import { DATASET_NAMES } from './datasets';
import { wireLayerNav } from './desktop/nav';
import { wirePointerDrag } from './desktop/pointer';
import { createIntro } from './intro';

// Desktop composition root: construct the modules, wire them together,
// start the loop. A mobile build is a sibling of this file — same session,
// stage, drag controller, and layer window; different adapters and layout.

const session = new Session('rings');

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const viewEls = [0, 1, 2].map((i) => document.getElementById(`view-${i}`)!);
const viewsEl = document.getElementById('views')!;
const navAsc = document.getElementById('nav-asc') as HTMLButtonElement;
const navDesc = document.getElementById('nav-desc') as HTMLButtonElement;

const stage = new Stage(session, canvas, viewEls);
const layers = new LayerWindow(3, 2);
const dragger = new DragController(session, stage);
const history = new History(session);

const panelEl = document.getElementById('panel')!;
const panel = new Panel(panelEl, DATASET_NAMES, session.datasetName, {
  onBias(layer, idx, value) {
    session.setBias(layer as LayerIndex, idx, value);
  },
  onAddUnit(layer) {
    history.mark();
    session.addUnit(layer as 0 | 1);
    // A first hidden-2 unit opens a new space (and the output arrow moves
    // there) — bring it into view.
    if (layer === 1 && session.net.hidden[1].length === 1) layers.reveal(2);
  },
  onRemoveUnit(layer, idx) {
    history.mark();
    session.removeUnit(layer as 0 | 1, idx);
  },
  onDataset(name) {
    history.mark();
    session.setDataset(name);
  },
  onReset() {
    history.mark();
    session.randomize();
  },
  onTogglePlane(kind, on) {
    stage.setPlaneEnabled(kind, on);
  },
  onUndo() {
    history.undo();
  },
  onRedo() {
    history.redo();
  },
});

// A slider gesture (pointer or arrow keys) marks history at its start; the
// dedupe in mark() makes over-calling free.
for (const type of ['pointerdown', 'keydown'] as const) {
  panelEl.addEventListener(
    type,
    (e) => {
      if ((e.target as HTMLInputElement).type === 'range') history.mark();
    },
    true,
  );
}

history.subscribe(() => panel.setHistoryState(history.canUndo, history.canRedo));

window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) history.redo();
    else history.undo();
  }
});

session.subscribe((change) => {
  if (change === 'structure') panel.renderStructure(session.net);
  panel.updateScore(session.res.accuracy, session.res.loss);
  // canUndo depends on how the state compares to the marks, so it can flip
  // on any mutation — not only on history events.
  panel.setHistoryState(history.canUndo, history.canRedo);
});
panel.renderStructure(session.net);
panel.updateScore(session.res.accuracy, session.res.loss);

wireLayerNav(layers, viewsEl, viewEls, navAsc, navDesc);
wirePointerDrag(dragger, stage, viewsEl, { onGrab: () => history.mark() });

// How-to-play splash (first visit + a floating ? to reopen).
document.body.appendChild(createIntro('desktop').button);

stage.start();

// Debug/testing handle (harmless in production; the app has no secrets).
Object.defineProperty(window, '__descent', {
  value: {
    session,
    stage,
    layers,
    dragger,
    history,
    net: session.net,
    vp: stage.vp,
    getEntries: () => stage.entries,
    getResult: () => session.res,
  },
});
