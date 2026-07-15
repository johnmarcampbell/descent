// The game session — owns the network, the dataset, and the forward-pass
// result, and is the only place game state mutates. No DOM, no three.js, so
// any frontend (desktop, mobile, tests) can drive the same game.

import type { Net, Unit, ForwardResult } from './network';
import {
  makeNet, forward, allocResult, sanitize, spaceDims, outSpaceIndex,
  randomUnit, MAX_UNITS, MAX_W, MIN_W,
} from './network';
import type { Dataset } from './datasets';
import { generate, N_POINTS } from './datasets';

/**
 * What a mutation changed. 'structure' also implies values changed;
 * 'dataset' also implies values changed. Listeners refresh accordingly.
 */
export type SessionChange = 'values' | 'structure' | 'dataset';
export type SessionListener = (change: SessionChange) => void;

/** A full game state: the whole network plus which dataset it's played on. */
export interface Snapshot {
  hidden: [Unit[], Unit[]];
  out: Unit;
  dataset: string;
}

function cloneUnit(u: Unit): Unit {
  return { w: [u.w[0], u.w[1], u.w[2]], b: u.b };
}

/** Address of a unit: hidden layers are 0 | 1, the output unit is layer 2. */
export type LayerIndex = 0 | 1 | 2;

export class Session {
  readonly net: Net = makeNet();
  readonly res: ForwardResult = allocResult(N_POINTS);
  private _data: Dataset;
  private _datasetName: string;
  private readonly listeners: SessionListener[] = [];

  constructor(datasetName = 'rings') {
    this._datasetName = datasetName;
    this._data = generate(datasetName);
    this.recompute();
  }

  get data(): Dataset {
    return this._data;
  }

  get datasetName(): string {
    return this._datasetName;
  }

  unitAt(layer: LayerIndex, idx: number): Unit {
    return layer === 2 ? this.net.out : this.net.hidden[layer][idx];
  }

  /** Which activation space the unit's weight vector lives in. */
  spaceOf(layer: LayerIndex): 0 | 1 | 2 {
    return layer === 2 ? outSpaceIndex(this.net) : layer;
  }

  subscribe(fn: SessionListener): () => void {
    this.listeners.push(fn);
    return () => {
      const i = this.listeners.indexOf(fn);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  setBias(layer: LayerIndex, idx: number, value: number): void {
    this.unitAt(layer, idx).b = value;
    this.recompute();
    this.notify('values');
  }

  /**
   * Set a unit's weight vector from a raw (unconstrained) candidate: dims the
   * unit's input space doesn't have are zeroed, ‖w‖ is clamped to
   * [MIN_W, MAX_W]. A near-zero candidate is ignored — there's no direction
   * to preserve.
   */
  setWeight(layer: LayerIndex, idx: number, w: ArrayLike<number>): void {
    const dims = spaceDims(this.net, this.spaceOf(layer));
    const c = [w[0], w[1], w[2]];
    for (let d = dims; d < 3; d++) c[d] = 0;
    const norm = Math.hypot(c[0], c[1], c[2]);
    if (norm < 1e-4) return;
    const s = Math.max(MIN_W, Math.min(MAX_W, norm)) / norm;
    const unit = this.unitAt(layer, idx);
    unit.w[0] = c[0] * s;
    unit.w[1] = c[1] * s;
    unit.w[2] = c[2] * s;
    this.recompute();
    this.notify('values');
  }

  addUnit(layer: 0 | 1): void {
    if (this.net.hidden[layer].length >= MAX_UNITS) return;

    // The first hidden-2 unit *promotes* the output unit: the player tuned
    // that vector against hidden-1's space, and this transition is the only
    // thing that changes which space the output reads. The tuned vector
    // becomes the new hidden unit and the output restarts on the fresh
    // 1-dim axis with b = 0 — sign-preserving (p > ½ ⇔ same z > 0 as
    // before), so predictions and accuracy carry over exactly.
    if (layer === 1 && this.net.hidden[1].length === 0) {
      this.net.hidden[1].push({ w: [...this.net.out.w], b: this.net.out.b });
      this.net.out = { w: [1.6, 0, 0], b: 0 };
    } else {
      this.net.hidden[layer].push(randomUnit());
    }

    this.recompute();
    this.notify('structure');
  }

  removeUnit(layer: 0 | 1, idx: number): void {
    this.net.hidden[layer].splice(idx, 1);
    this.recompute();
    this.notify('structure');
  }

  setDataset(name: string): void {
    this._datasetName = name;
    this._data = generate(name);
    this.recompute();
    this.notify('dataset');
  }

  /** Deep copy of the current game state, safe to hold across mutations. */
  snapshot(): Snapshot {
    return {
      hidden: [this.net.hidden[0].map(cloneUnit), this.net.hidden[1].map(cloneUnit)],
      out: cloneUnit(this.net.out),
      dataset: this._datasetName,
    };
  }

  /** Restore a snapshot taken earlier (the basis of undo/redo). */
  restore(s: Snapshot): void {
    const datasetChanged = s.dataset !== this._datasetName;
    if (datasetChanged) {
      this._datasetName = s.dataset;
      this._data = generate(s.dataset);
    }
    this.net.hidden[0].splice(0, Infinity, ...s.hidden[0].map(cloneUnit));
    this.net.hidden[1].splice(0, Infinity, ...s.hidden[1].map(cloneUnit));
    this.net.out = cloneUnit(s.out);
    this.recompute();
    if (datasetChanged) this.notify('dataset');
    this.notify('structure');
  }

  /** Re-randomize every weight and bias; the layer structure is kept. */
  randomize(): void {
    for (const layer of this.net.hidden) {
      layer.forEach((_, i) => { layer[i] = randomUnit(); });
    }
    this.net.out = randomUnit();
    this.recompute();
    this.notify('structure');
  }

  private recompute(): void {
    sanitize(this.net);
    forward(this.net, this._data.X, this._data.y, this._data.n, this.res);
  }

  private notify(change: SessionChange): void {
    for (const fn of [...this.listeners]) fn(change);
  }
}
