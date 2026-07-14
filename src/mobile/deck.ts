import type { Session } from '../session';
import { Stage } from '../viz/stage';
import { MobileControls } from './controls';

// Prototype A — DECK. One layer fills the screen; the adjacent layer runs
// live in a minimap inset (tap it to jump there). Chevrons page through the
// three spaces; controls live in a pull-up sheet. The three 3D cells are
// *reparented* between the fullscreen stage, the minimap frame, and an
// offstage stash — the Stage only ever sees their rects.

const NAMES = ['input space', 'hidden layer 1', 'hidden layer 2'];
const NUMS = ['01', '02', '03'];
const FORMULAS = ['x ∈ ℝ³', 'a¹ = tanh(W¹x + b¹)', 'a² = tanh(W²a¹ + b²)'];

/** Which space previews in the inset: the downstream one when it exists. */
function miniOf(s: number): number {
  return s < 2 ? s + 1 : 1;
}

export function bootDeck(app: HTMLElement, canvas: HTMLCanvasElement, session: Session): Stage {
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
      <div class="pill deck-score" id="deck-score">—<small>ACCURACY</small></div>
    </header>

    <button class="chev-btn deck-prev" id="deck-prev" hidden>‹</button>
    <button class="chev-btn deck-next" id="deck-next">›</button>

    <div class="deck-hint" id="deck-hint" hidden></div>

    <div class="deck-mini" id="deck-mini">
      <div class="frame" id="deck-mini-frame"></div>
      <span class="tag" id="deck-mini-tag"></span>
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
    $('deck-mini-tag').innerHTML = `${dir} <b>${NUMS[m]}</b> ${NAMES[m].replace('hidden layer', 'hidden')}`;
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
  }

  $('deck-prev').addEventListener('click', () => setS(s - 1));
  $('deck-next').addEventListener('click', () => setS(s + 1));
  $('deck-mini').addEventListener('click', () => setS(miniOf(s)));

  // pull-up sheet
  const sheet = $('deck-sheet');
  $('deck-grab').addEventListener('click', () => sheet.classList.toggle('open'));

  new MobileControls($('deck-sheet-body'), session, stage, {
    showScore: false,
    proto: 'deck',
    onReveal: (view) => {
      setS(view);
      sheet.classList.remove('open');
    },
  });

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

  layout();
  return stage;
}
