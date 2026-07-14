import type { Session } from '../session';
import type { LayerIndex } from '../session';
import type { Stage } from '../viz/stage';
import type { Unit } from '../network';
import { MAX_UNITS, outSpaceIndex } from '../network';
import { DATASET_NAMES } from '../datasets';
import { UNIT_COLORS, OUT_COLOR } from '../theme';

// Touch-first controls shared by both mobile prototypes: fat sliders,
// chip pickers, and a prototype switcher. An adapter over the session —
// where it's housed (bottom sheet vs. board) is the prototype's business.

export type ProtoName = 'deck' | 'board';

export interface MobileControlsOpts {
  /** Include the score block (the deck shows score in its top bar instead). */
  showScore: boolean;
  proto: ProtoName;
  /** Called after a structure change that opens a new space (first hidden-2 unit). */
  onReveal?: (view: number) => void;
}

const HELP: Record<ProtoName, string> = {
  deck: 'drag an <b>arrow tip</b> to aim a weight · one finger orbits · pinch zooms · <b>‹ ›</b> pages through layers · tap the <b>inset</b> to jump there',
  board: 'drag an <b>arrow tip</b> to aim a weight · one finger orbits · pinch zooms · <b>tabs</b> choose the visible pair',
};

export class MobileControls {
  private readonly layersEl: HTMLElement;
  private readonly accEl: HTMLElement | null;
  private readonly lossEl: HTMLElement | null;
  private readonly solvedEl: HTMLElement | null;

  constructor(
    root: HTMLElement,
    private readonly session: Session,
    stage: Stage,
    opts: MobileControlsOpts,
  ) {
    const chips = Object.entries(DATASET_NAMES)
      .map(([k, label]) => `<button class="chip" data-ds="${k}">${label}</button>`)
      .join('');

    root.classList.add('mc');
    root.innerHTML = `
      ${opts.showScore ? `
      <section class="mc-score-wrap">
        <div class="mc-score">
          <span class="acc" id="mc-acc">—</span>
          <span class="loss">loss <span id="mc-loss">—</span></span>
          <span class="solved" id="mc-solved" hidden>◈ SOLVED</span>
        </div>
      </section>` : ''}
      <section>
        <span class="mc-label">dataset</span>
        <div class="mc-chips" id="mc-datasets">${chips}</div>
      </section>
      <section>
        <span class="mc-label">network</span>
        <div id="mc-layers"></div>
      </section>
      <section>
        <span class="mc-label">display</span>
        <div class="mc-toggles">
          <button class="toggle-chip" data-plane="unit">unit planes</button>
          <button class="toggle-chip on" data-plane="out">decision plane</button>
        </div>
      </section>
      <section>
        <button class="btn" id="mc-reset">↻ randomize weights</button>
      </section>
      <section>
        <span class="mc-label">prototype</span>
        <div class="mc-proto">
          <button class="chip ${opts.proto === 'deck' ? 'on' : ''}" data-proto="deck">A · deck</button>
          <button class="chip ${opts.proto === 'board' ? 'on' : ''}" data-proto="board">B · board</button>
        </div>
      </section>
      <section>
        <p class="mc-help">${HELP[opts.proto]}</p>
      </section>
    `;

    this.layersEl = root.querySelector('#mc-layers')!;
    this.accEl = root.querySelector('#mc-acc');
    this.lossEl = root.querySelector('#mc-loss');
    this.solvedEl = root.querySelector('#mc-solved');

    // dataset chips
    const dsWrap = root.querySelector('#mc-datasets')!;
    const syncChips = (): void => {
      dsWrap.querySelectorAll('.chip').forEach((c) => {
        c.classList.toggle('on', (c as HTMLElement).dataset.ds === session.datasetName);
      });
    };
    syncChips();
    dsWrap.addEventListener('click', (e) => {
      const chip = (e.target as HTMLElement).closest('.chip') as HTMLElement | null;
      if (!chip) return;
      session.setDataset(chip.dataset.ds!);
      syncChips();
    });

    // plane toggles
    root.querySelectorAll<HTMLButtonElement>('.toggle-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const on = !btn.classList.contains('on');
        btn.classList.toggle('on', on);
        stage.setPlaneEnabled(btn.dataset.plane as 'unit' | 'out', on);
      });
    });

    root.querySelector('#mc-reset')!.addEventListener('click', () => session.randomize());

    // prototype switch — same page, different search param
    root.querySelectorAll<HTMLButtonElement>('[data-proto]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.proto !== opts.proto) {
          window.location.search = `?proto=${btn.dataset.proto}`;
        }
      });
    });

    // layer blocks: delegated slider + add/remove events
    this.layersEl.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.type !== 'range') return;
      const v = parseFloat(t.value);
      t.parentElement!.querySelector('output')!.textContent = v.toFixed(2);
      session.setBias(Number(t.dataset.layer) as LayerIndex, Number(t.dataset.idx), v);
    });
    this.layersEl.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('button');
      if (!t) return;
      if (t.classList.contains('add')) {
        const layer = Number(t.dataset.layer) as 0 | 1;
        session.addUnit(layer);
        if (layer === 1 && session.net.hidden[1].length === 1) opts.onReveal?.(2);
      } else if (t.classList.contains('x')) {
        session.removeUnit(Number(t.dataset.layer) as 0 | 1, Number(t.dataset.idx));
      }
    });

    session.subscribe((change) => {
      if (change === 'structure') this.renderLayers();
      this.updateScore();
    });
    this.renderLayers();
    this.updateScore();
  }

  private renderLayers(): void {
    const net = this.session.net;
    const os = outSpaceIndex(net);
    this.layersEl.innerHTML = [
      this.layerBlock('hidden 1', 'reads input', net.hidden[0], 0, 1),
      this.layerBlock('hidden 2', 'reads hidden 1', net.hidden[1], 1, 0),
      `<div class="mc-layer">
        <div class="mc-layer-head"><b>output</b><span class="reads">reads hidden ${os} · sigmoid</span></div>
        ${this.unitRow(net.out, 2, 0, OUT_COLOR, 'out', false)}
      </div>`,
    ].join('');
  }

  private layerBlock(title: string, note: string, units: Unit[], layer: number, min: number): string {
    const rows = units
      .map((u, i) => this.unitRow(u, layer, i, UNIT_COLORS[i], `u${i + 1}`, units.length > min))
      .join('');
    const addBtn = units.length < MAX_UNITS
      ? `<button class="btn add" data-layer="${layer}">+ add unit</button>`
      : '';
    const empty = units.length === 0
      ? `<p class="empty-note">no units — output reads hidden 1</p>`
      : '';
    return `<div class="mc-layer">
      <div class="mc-layer-head"><b>${title}</b><span class="reads">${note}</span></div>
      ${rows}${empty}${addBtn}
    </div>`;
  }

  private unitRow(u: Unit, layer: number, idx: number, color: string, name: string, removable: boolean): string {
    const x = removable
      ? `<button class="x" data-layer="${layer}" data-idx="${idx}">×</button>`
      : `<span class="x-spacer"></span>`;
    return `<div class="unit-row" style="--c:${color}">
      <i class="swatch"></i>
      <span class="uname">${name}</span>
      <input type="range" min="-3" max="3" step="0.01" value="${u.b}"
        data-layer="${layer}" data-idx="${idx}" aria-label="bias of ${name}" />
      <output>${u.b.toFixed(2)}</output>
      ${x}
    </div>`;
  }

  private updateScore(): void {
    if (!this.accEl) return;
    const acc = this.session.res.accuracy;
    this.accEl.textContent = `${(acc * 100).toFixed(1)}%`;
    const t = Math.max(0, Math.min(1, (acc - 0.5) / 0.5));
    (this.accEl as HTMLElement).style.color = `hsl(${Math.round(145 * t)} 75% 62%)`;
    this.lossEl!.textContent = this.session.res.loss.toFixed(3);
    this.solvedEl!.hidden = acc < 0.98;
  }
}
