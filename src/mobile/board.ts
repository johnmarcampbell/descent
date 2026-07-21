import type { Session } from '../session';
import { Stage } from '../viz/stage';
import { LayerWindow } from '../layerwindow';
import type { History } from '../history';
import { MobileControls } from './controls';
import type { ProtoUI } from './controls';

// Prototype B — BOARD. The cockpit: the two-layer window stacked vertically
// (edit the top pane, watch the bottom pane react), layer tabs to slide the
// window, and the full control board always visible below. Navigation is
// the same LayerWindow machine the desktop uses, with a pane adapter
// instead of a grid adapter.

const NAMES = ['input space', 'latent space 1', 'latent space 2'];
const NUMS = ['01', '02', '03'];
const FORMULAS = ['x ∈ ℝ³', 'a¹ = tanh(W¹x + b¹)', 'a² = tanh(W²a¹ + b²)'];

export function bootBoard(app: HTMLElement, canvas: HTMLCanvasElement, session: Session, history: History): ProtoUI {
  app.innerHTML = `
    <div class="board">
      <nav class="board-tabs" id="b-tabs">
        <span class="brand">DESCENT</span>
        ${NAMES.map((_, i) => `<button class="b-tab" data-t="${i}">${i === 0 ? 'input' : `hidden ${i}`}</button>`).join('')}
      </nav>
      <section class="board-panes" id="b-panes">
        ${[0, 1, 2].map((i) => `
          <div class="cell" data-view="${i}" hidden>
            <span class="cell-head"><span class="num">${NUMS[i]}</span>${NAMES[i]}</span>
            <span class="cell-formula">${FORMULAS[i]}</span>
          </div>`).join('')}
        <span class="board-flow">↓</span>
        <div class="board-hint" id="b-hint" hidden></div>
      </section>
      <div class="board-ctl" id="b-ctl"></div>
    </div>
  `;

  const panes = app.querySelector<HTMLElement>('#b-panes')!;
  const cells = [0, 1, 2].map((i) => panes.querySelector<HTMLElement>(`.cell[data-view="${i}"]`)!);
  const tabs = [...app.querySelectorAll<HTMLButtonElement>('.b-tab')];
  const hint = app.querySelector<HTMLElement>('#b-hint')!;

  const stage = new Stage(session, canvas, cells);
  const layers = new LayerWindow(3, 2);

  function layout(): void {
    cells.forEach((el, i) => {
      const role = layers.roleOf(i);
      const visible = role !== 'offstage';
      el.hidden = !visible;
      if (visible) {
        const pos = i - layers.depth; // 0 = top pane, 1 = bottom pane
        el.style.top = pos === 0 ? '0' : '50%';
        el.style.height = '50%';
      }
    });
    tabs.forEach((tab, i) => {
      tab.classList.toggle('lit', layers.roleOf(i) !== 'offstage');
      tab.classList.toggle('top', i === layers.depth);
    });
    syncHint();
  }

  function syncHint(): void {
    const h2Visible = layers.roleOf(2) !== 'offstage';
    const h2Empty = session.net.hidden[1].length === 0;
    hint.hidden = !(h2Visible && h2Empty);
    if (!hint.hidden) hint.innerHTML = 'empty space — add a <b>hidden-2</b> unit below';
  }

  tabs.forEach((tab, i) => tab.addEventListener('click', () => layers.reveal(i)));
  layers.subscribe(layout);

  new MobileControls(app.querySelector<HTMLElement>('#b-ctl')!, session, stage, {
    showScore: true,
    proto: 'board',
    onGesture: () => history.mark(),
    onReveal: (view) => layers.reveal(view),
  });

  session.subscribe((change) => {
    if (change === 'structure') syncHint();
  });

  layout();
  return { stage };
}
