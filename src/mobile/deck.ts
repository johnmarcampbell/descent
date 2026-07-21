import type { Session, LayerIndex } from '../session';
import { Stage } from '../viz/stage';
import type { StageEntry } from '../viz/stage';
import type { History } from '../history';
import { MAX_UNITS } from '../network';
import { UNIT_COLORS, OUT_COLOR } from '../theme';
import { MobileControls } from './controls';
import type { ProtoUI } from './controls';

// Prototype A — DECK. One layer fills the screen; the adjacent layer runs
// live in a minimap inset (tap it to jump there). Chevrons page through the
// three spaces; controls live in a pull-up sheet. The three 3D cells are
// *reparented* between the fullscreen stage, the minimap frame, and an
// offstage stash — the Stage only ever sees their rects.

const NAMES = ['input space', 'latent space 1', 'latent space 2'];
const NUMS = ['01', '02', '03'];
const FORMULAS = ['x ∈ ℝ³', 'a¹ = tanh(W¹x + b¹)', 'a² = tanh(W²a¹ + b²)'];

/** Which space previews in the inset: the downstream one when it exists. */
function miniOf(s: number): number {
  return s < 2 ? s + 1 : 1;
}

export function bootDeck(app: HTMLElement, canvas: HTMLCanvasElement, session: Session, history: History): ProtoUI {
  app.innerHTML = `
    <div class="deck-stagearea" id="deck-stage" style="position:fixed;inset:0;"></div>
    <div class="deck-stash" hidden></div>

    <header class="deck-top">
      <div class="deck-title">
        <span class="num" id="deck-num">01</span>
        <h1 id="deck-name">input space</h1>
        <div class="formula" id="deck-formula">x ∈ ℝ³</div>
        <div class="deck-dots" id="deck-dots"><i class="on"></i><i></i><i></i></div>
      </div>
      <div class="deck-right">
        <div class="pill deck-score" id="deck-score">—<small>ACCURACY</small></div>
      </div>
    </header>

    <div class="deck-qc" id="deck-qc">
      <button class="pill deck-ubtn" id="deck-undo" disabled>↩</button>
      <button class="pill deck-ubtn" id="deck-redo" disabled>↪</button>
      <div class="qc-sel pill" id="qc-sel" hidden>
        <i class="swatch"></i>
        <span class="qc-name" id="qc-name">—</span>
        <input type="range" min="-3" max="3" step="0.01" id="qc-bias" aria-label="bias of selected vector" />
        <output id="qc-val">0.00</output>
        <button class="qc-x" id="qc-x">×</button>
      </div>
      <button class="qc-add pill" id="qc-add" title="add a vector to this space">+</button>
    </div>

    <button class="chev-btn deck-prev" id="deck-prev" hidden>‹</button>
    <button class="chev-btn deck-next" id="deck-next">›</button>

    <div class="deck-hint" id="deck-hint" hidden></div>

    <div class="deck-mini" id="deck-mini">
      <div class="frame" id="deck-mini-frame"></div>
      <div class="mini-bar" id="deck-mini-bar">
        <span class="tag" id="deck-mini-tag"></span>
        <button class="mini-roll" id="deck-mini-roll">▾</button>
      </div>
    </div>

    <div class="deck-sheet" id="deck-sheet">
      <button class="deck-grab" id="deck-grab">
        <span class="arrow">▲</span> controls · <span class="acc-mini" id="deck-acc-mini">—</span>
      </button>
      <div class="deck-sheet-body" id="deck-sheet-body"></div>
    </div>
  `;

  const $ = (id: string): HTMLElement => app.querySelector(`#${id}`)!;
  const stageArea = $('deck-stage');
  const stash = app.querySelector<HTMLElement>('.deck-stash')!;
  const miniFrame = $('deck-mini-frame');

  // The three 3D cells, created loose and reparented by layout().
  const cells = [0, 1, 2].map((i) => {
    const el = document.createElement('div');
    el.className = 'cell';
    el.dataset.view = String(i);
    el.style.inset = '0';
    stash.appendChild(el);
    return el;
  });

  const stage = new Stage(session, canvas, cells);

  let s = 0; // the space filling the screen

  function layout(): void {
    const m = miniOf(s);
    cells.forEach((el, i) => {
      const home = i === s ? stageArea : i === m ? miniFrame : stash;
      if (el.parentElement !== home) home.appendChild(el);
    });

    $('deck-num').textContent = NUMS[s];
    $('deck-name').textContent = NAMES[s];
    $('deck-formula').textContent = FORMULAS[s];
    $('deck-dots').querySelectorAll('i').forEach((dot, i) => {
      dot.classList.toggle('on', i === s);
    });
    ($('deck-prev') as HTMLButtonElement).hidden = s === 0;
    ($('deck-next') as HTMLButtonElement).hidden = s === 2;

    const dir = m > s ? '↳' : '↖';
    $('deck-mini-tag').innerHTML = `${dir} <b>${NUMS[m]}</b> ${NAMES[m].replace('latent space', 'latent')}`;
    syncHint();
  }

  function syncHint(): void {
    const h2Empty = session.net.hidden[1].length === 0;
    const hint = $('deck-hint');
    hint.hidden = !(s === 2 && h2Empty);
    if (!hint.hidden) hint.innerHTML = 'this space is empty<br/>add a <b>hidden-2</b> unit below';
  }

  function setS(next: number): void {
    s = Math.max(0, Math.min(2, next));
    layout();
    renderQC(); // the + button targets the layer reading the current space
  }

  $('deck-prev').addEventListener('click', () => setS(s - 1));
  $('deck-next').addEventListener('click', () => setS(s + 1));
  miniFrame.addEventListener('click', () => setS(miniOf(s)));

  // --- minimap placement: drag by the bar, snap to a corner, roll up ---

  const mini = $('deck-mini');
  const miniBar = $('deck-mini-bar');
  const miniRoll = $('deck-mini-roll') as HTMLButtonElement;
  let miniCorner = localStorage.getItem('descent.miniCorner') ?? 'br';
  let miniRolled = localStorage.getItem('descent.miniRolled') === '1';

  // env(safe-area-inset-bottom) isn't readable directly; measure it once.
  const sabProbe = document.createElement('div');
  sabProbe.style.cssText = 'position:fixed;height:var(--sab);visibility:hidden;';
  document.body.appendChild(sabProbe);
  const sab = sabProbe.offsetHeight;
  sabProbe.remove();

  function placeMini(): void {
    mini.classList.toggle('rolled', miniRolled);
    miniRoll.textContent = miniRolled ? '▴' : '▾';
    const margin = 12;
    const topY = app.querySelector('#deck-qc')!.getBoundingClientRect().bottom + 8;
    const botY = window.innerHeight - (58 + sab + margin) - mini.offsetHeight;
    mini.style.left = `${miniCorner.includes('l') ? margin : window.innerWidth - mini.offsetWidth - margin}px`;
    mini.style.top = `${miniCorner.includes('t') ? topY : botY}px`;
  }

  let miniDrag: { sx: number; sy: number; bx: number; by: number; moved: boolean } | null = null;

  miniBar.addEventListener('pointerdown', (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('.mini-roll')) return;
    e.stopPropagation();
    e.preventDefault();
    miniDrag = { sx: e.clientX, sy: e.clientY, bx: mini.offsetLeft, by: mini.offsetTop, moved: false };
    mini.classList.add('dragging');
  });
  // Window-level tracking: a fast finger leaves the bar long before the
  // browser would deliver the next move event to it.
  window.addEventListener('pointermove', (e: PointerEvent) => {
    if (!miniDrag) return;
    const dx = e.clientX - miniDrag.sx;
    const dy = e.clientY - miniDrag.sy;
    if (Math.hypot(dx, dy) > 8) miniDrag.moved = true;
    if (miniDrag.moved) {
      mini.style.left = `${miniDrag.bx + dx}px`;
      mini.style.top = `${miniDrag.by + dy}px`;
    }
  });
  const miniDrop = (): void => {
    if (!miniDrag) return;
    mini.classList.remove('dragging');
    if (miniDrag.moved) {
      const r = mini.getBoundingClientRect();
      miniCorner =
        (r.top + r.height / 2 < window.innerHeight / 2 ? 't' : 'b') +
        (r.left + r.width / 2 < window.innerWidth / 2 ? 'l' : 'r');
      localStorage.setItem('descent.miniCorner', miniCorner);
      placeMini();
    } else {
      setS(miniOf(s)); // a plain tap on the bar jumps, like the frame
    }
    miniDrag = null;
  };
  window.addEventListener('pointerup', miniDrop);
  window.addEventListener('pointercancel', miniDrop);

  miniRoll.addEventListener('click', () => {
    miniRolled = !miniRolled;
    localStorage.setItem('descent.miniRolled', miniRolled ? '1' : '0');
    placeMini();
  });

  window.addEventListener('resize', placeMini);

  // pull-up sheet — tap outside closes it (and swallows the tap so it
  // can't orbit or grab a vector behind the sheet)
  const sheet = $('deck-sheet');
  $('deck-grab').addEventListener('click', () => sheet.classList.toggle('open'));
  app.addEventListener(
    'pointerdown',
    (e: PointerEvent) => {
      if (!sheet.classList.contains('open')) return;
      if ((e.target as HTMLElement).closest('.deck-sheet')) return;
      sheet.classList.remove('open');
      e.stopImmediatePropagation();
      e.preventDefault();
    },
    true,
  );

  new MobileControls($('deck-sheet-body'), session, stage, {
    showScore: false,
    proto: 'deck',
    onGesture: () => history.mark(),
    onReveal: (view) => {
      setS(view);
      sheet.classList.remove('open');
    },
  });

  // undo / redo
  const undoBtn = $('deck-undo') as HTMLButtonElement;
  const redoBtn = $('deck-redo') as HTMLButtonElement;
  undoBtn.addEventListener('click', () => history.undo());
  redoBtn.addEventListener('click', () => history.redo());
  const syncHistoryBtns = (): void => {
    undoBtn.disabled = !history.canUndo;
    redoBtn.disabled = !history.canRedo;
  };
  // canUndo can flip on any mutation, not only on history events.
  history.subscribe(syncHistoryBtns);
  session.subscribe(syncHistoryBtns);

  // score pill + grab-bar accuracy
  const score = $('deck-score');
  const accMini = $('deck-acc-mini');
  const updateScore = (): void => {
    const acc = session.res.accuracy;
    const pct = `${(acc * 100).toFixed(1)}%`;
    const t = Math.max(0, Math.min(1, (acc - 0.5) / 0.5));
    score.innerHTML = `${pct}<small>ACCURACY</small>`;
    score.style.color = `hsl(${Math.round(145 * t)} 75% 62%)`;
    accMini.textContent = pct;
  };
  session.subscribe(() => {
    updateScore();
    syncHint();
  });
  updateScore();

  // --- selection & quick controls ---
  // Grabbing a vector selects it; the quick bar under the title edits the
  // selected vector's bias and deletes it, and + adds a sibling.

  let sel: { layer: LayerIndex; idx: number } | null = null;
  const qcSel = $('qc-sel');
  const qcBias = $('qc-bias') as HTMLInputElement;
  const qcVal = $('qc-val');
  const qcX = $('qc-x') as HTMLButtonElement;
  const qcAdd = $('qc-add') as HTMLButtonElement;

  const qcColor = (l: LayerIndex, i: number): string => (l === 2 ? OUT_COLOR : UNIT_COLORS[i]);

  function addTarget(): 0 | 1 | null {
    if (sel && sel.layer < 2) return sel.layer as 0 | 1;
    return s < 2 ? (s as 0 | 1) : null; // units *reading* the current space
  }

  function applyHighlight(): void {
    stage.entries.forEach((en) => {
      en.gizmo.setHighlight(sel !== null && en.layer === sel.layer && en.idx === sel.idx);
    });
  }

  function renderQC(): void {
    if (sel) {
      const unit = session.unitAt(sel.layer, sel.idx);
      qcSel.hidden = false;
      qcSel.style.setProperty('--c', qcColor(sel.layer, sel.idx));
      $('qc-name').textContent = sel.layer === 2 ? 'out' : `h${sel.layer + 1}·u${sel.idx + 1}`;
      qcBias.value = String(unit.b);
      qcVal.textContent = unit.b.toFixed(2);
      qcX.hidden = sel.layer === 2; // the output unit can't be deleted
    } else {
      qcSel.hidden = true;
    }
    const target = addTarget();
    qcAdd.disabled = target === null || session.net.hidden[target].length >= MAX_UNITS;
  }

  function select(layer: LayerIndex, idx: number): void {
    sel = { layer, idx };
    applyHighlight();
    renderQC();
  }

  qcBias.addEventListener('pointerdown', () => history.mark());
  qcBias.addEventListener('input', () => {
    if (!sel) return;
    const v = parseFloat(qcBias.value);
    qcVal.textContent = v.toFixed(2);
    session.setBias(sel.layer, sel.idx, v);
  });

  qcX.addEventListener('click', () => {
    if (!sel || sel.layer === 2) return;
    history.mark();
    const dead = sel;
    sel = null;
    session.removeUnit(dead.layer as 0 | 1, dead.idx);
  });

  qcAdd.addEventListener('click', () => {
    const layer = addTarget();
    if (layer === null || session.net.hidden[layer].length >= MAX_UNITS) return;
    history.mark();
    session.addUnit(layer);
    const idx = session.net.hidden[layer].length - 1;
    // A first hidden-2 unit opens a new space — bring it into view.
    if (layer === 1 && idx === 0) setS(2);
    select(layer, idx);
  });

  session.subscribe((change) => {
    if (change === 'structure') {
      // The selected address may have died with the structure change.
      if (sel && sel.layer !== 2 && sel.idx >= session.net.hidden[sel.layer].length) sel = null;
      applyHighlight(); // gizmos were rebuilt
    }
    renderQC(); // bias may have changed under us (undo, sheet slider)
  });

  layout();
  renderQC();
  placeMini();
  return {
    stage,
    onGrab: (entry: StageEntry) => select(entry.layer, entry.idx),
    // The drag controller un-highlights on release; selection persists.
    onRelease: () => applyHighlight(),
  };
}
