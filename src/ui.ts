import type { Net, Unit } from './network';
import { MAX_UNITS, outSpaceIndex } from './network';
import { UNIT_COLORS, OUT_COLOR } from './theme';

export interface UICallbacks {
  /** layer 0 | 1 = hidden layers, 2 = output unit (idx ignored). */
  onBias(layer: number, idx: number, value: number): void;
  onAddUnit(layer: number): void;
  onRemoveUnit(layer: number, idx: number): void;
  onDataset(name: string): void;
  onReset(): void;
  onTogglePlane(kind: 'unit' | 'out', on: boolean): void;
}

export class Panel {
  private readonly accEl: HTMLElement;
  private readonly lossEl: HTMLElement;
  private readonly solvedEl: HTMLElement;
  private readonly layersEl: HTMLElement;

  constructor(
    root: HTMLElement,
    datasets: Record<string, string>,
    initialDataset: string,
    private readonly cb: UICallbacks,
  ) {
    const options = Object.entries(datasets)
      .map(([k, label]) => `<option value="${k}"${k === initialDataset ? ' selected' : ''}>${label}</option>`)
      .join('');

    root.innerHTML = `
      <header class="brand">
        <h1>DESCENT</h1>
        <span class="ver">hand-built neural nets · proto 0.1</span>
      </header>
      <section class="score">
        <div class="metric main">
          <label>accuracy</label>
          <output id="p-acc">—</output>
        </div>
        <div class="metric">
          <label>log loss</label>
          <output id="p-loss">—</output>
        </div>
        <div class="solved" id="p-solved" hidden>◈ solved</div>
      </section>
      <section class="block">
        <label class="block-label" for="p-data">dataset</label>
        <div class="select-wrap">
          <select id="p-data">${options}</select>
        </div>
      </section>
      <section class="block">
        <label class="block-label">display</label>
        <div class="toggles">
          <label class="toggle"><input type="checkbox" id="p-plane-unit" /> unit planes</label>
          <label class="toggle"><input type="checkbox" id="p-plane-out" checked /> decision plane</label>
        </div>
      </section>
      <div id="p-layers"></div>
      <section class="block foot">
        <button class="btn" id="p-reset">↻ randomize weights</button>
        <p class="help">
          drag an arrow tip to aim &amp; scale a weight · drag empty space to
          orbit · scroll to zoom · <b>‹ ›</b> move between layers · the
          <b>gold</b> plane is the decision boundary
        </p>
      </section>
    `;

    this.accEl = root.querySelector('#p-acc')!;
    this.lossEl = root.querySelector('#p-loss')!;
    this.solvedEl = root.querySelector('#p-solved')!;
    this.layersEl = root.querySelector('#p-layers')!;

    root.querySelector<HTMLSelectElement>('#p-data')!.addEventListener('change', (e) => {
      this.cb.onDataset((e.target as HTMLSelectElement).value);
    });
    root.querySelector('#p-reset')!.addEventListener('click', () => this.cb.onReset());

    for (const kind of ['unit', 'out'] as const) {
      root.querySelector<HTMLInputElement>(`#p-plane-${kind}`)!.addEventListener('change', (e) => {
        this.cb.onTogglePlane(kind, (e.target as HTMLInputElement).checked);
      });
    }

    this.layersEl.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.type !== 'range') return;
      const v = parseFloat(t.value);
      t.nextElementSibling!.textContent = v.toFixed(2);
      this.cb.onBias(Number(t.dataset.layer), Number(t.dataset.idx), v);
    });

    this.layersEl.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('button');
      if (!t) return;
      if (t.classList.contains('add')) this.cb.onAddUnit(Number(t.dataset.layer));
      else if (t.classList.contains('x')) {
        this.cb.onRemoveUnit(Number(t.dataset.layer), Number(t.dataset.idx));
      }
    });
  }

  renderStructure(net: Net): void {
    const os = outSpaceIndex(net);
    this.layersEl.innerHTML = [
      this.layerBlock('hidden 1', 'reads input space', net.hidden[0], 0, 1),
      this.layerBlock('hidden 2', 'reads hidden 1', net.hidden[1], 1, 0),
      `<section class="block layer">
        <div class="layer-head">
          <span class="block-label">output</span>
          <span class="reads">reads hidden ${os} · sigmoid</span>
        </div>
        <div class="units">${this.unitRow(net.out, 2, 0, OUT_COLOR, 'out', false)}</div>
      </section>`,
    ].join('');
  }

  private layerBlock(title: string, note: string, units: Unit[], layer: number, min: number): string {
    const rows = units
      .map((u, i) => this.unitRow(u, layer, i, UNIT_COLORS[i], `u${i + 1}`, units.length > min))
      .join('');
    const addBtn =
      units.length < MAX_UNITS
        ? `<button class="btn add" data-layer="${layer}">+ add unit</button>`
        : '';
    const empty = units.length === 0 ? `<p class="empty-note">no units — output reads hidden 1</p>` : '';
    return `<section class="block layer">
      <div class="layer-head">
        <span class="block-label">${title}</span>
        <span class="reads">${note}</span>
      </div>
      <div class="units">${rows}</div>
      ${empty}${addBtn}
    </section>`;
  }

  private unitRow(u: Unit, layer: number, idx: number, color: string, name: string, removable: boolean): string {
    const x = removable
      ? `<button class="x" data-layer="${layer}" data-idx="${idx}" title="remove unit">×</button>`
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

  updateScore(acc: number, loss: number): void {
    this.accEl.textContent = `${(acc * 100).toFixed(1)}%`;
    const t = Math.max(0, Math.min(1, (acc - 0.5) / 0.5));
    this.accEl.style.color = `hsl(${Math.round(145 * t)} 75% 62%)`;
    this.lossEl.textContent = loss.toFixed(3);
    this.solvedEl.hidden = acc < 0.98;
  }
}
