// The tutorial as data: five levels, each a starting Snapshot, a goal, and a few
// guiding steps whose `done` predicates read only the Session. Start weights are
// worked out from the dataset geometry in src/datasets.ts; the scripted walks in
// levels.test.ts prove each level winnable.

import type { LayerIndex, Session, Snapshot } from '../session';
import type { Unit, Vec3 } from '../network';
import { separable } from './separable';

/** What the spotlight ring sits on: a unit's arrow tip or bias slider, or an add button. */
export type Target =
  | { unit: [LayerIndex, number]; part: 'tip' | 'bias' }
  | { ctl: 'add'; layer: 0 | 1 };

/** Controls a level can hide, by their data-ctl marker. Dataset, planes and reset always are. */
export type Ctl = 'bias' | 'add' | 'h2' | 'out';

/** What the coach shows while a step is current. */
export interface Prompt {
  say: string;
  target?: Target;
  hint?: string; // shown after the player stalls on this step
}

/** A guiding step: current until `done`, judged against the state it began in. */
export interface Step extends Prompt {
  done(s: Session, stepStart: Snapshot): boolean;
}

export interface Level {
  id: string;
  title: string;
  start: Snapshot;
  hide: Ctl[];
  goal: number; // accuracy that wins the level
  aha: string;  // shown on the win card
  steps: Step[];
  last: Prompt; // current once every step is done, until the win
}

type Done = Step['done'];

const u = (w: Vec3, b = 0): Unit => ({ w, b });
const arrow = (layer: LayerIndex, idx = 0): Target => ({ unit: [layer, idx], part: 'tip' });
const slider = (layer: LayerIndex, idx = 0): Target => ({ unit: [layer, idx], part: 'bias' });
const addButton = (layer: 0 | 1): Target => ({ ctl: 'add', layer });

const weightOf = (s: Snapshot, layer: LayerIndex, idx: number): Vec3 =>
  layer === 2 ? s.out.w : s.hidden[layer][idx].w;

const unitCount = (layer: 0 | 1, n: number): Done => (s) => s.net.hidden[layer].length >= n;

/** The arrow moved deliberately, not just a grab-and-release. */
const weightChanged = (layer: LayerIndex, idx = 0): Done => (s, from) => {
  const [a, b] = [s.unitAt(layer, idx).w, weightOf(from, layer, idx)];
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 0.1;
};

/** ‖w‖ changed by at least 35%. */
const stretched = (layer: LayerIndex, idx = 0): Done => (s, from) =>
  Math.abs(Math.hypot(...s.unitAt(layer, idx).w) / Math.hypot(...weightOf(from, layer, idx)) - 1)
    >= 0.35;

/**
 * One plane in this latent space could reach `acc`: the layer before it did its job. Points
 * count only by which side of each wall they fall on, so a wall that merely leans the right
 * way does not pass.
 */
const separates = (space: 1 | 2, acc: number): Done => (s) =>
  separable(Float32Array.from(space === 1 ? s.res.h1 : s.res.h2, Math.sign), s.data.y, acc);

const GOLD = u([1.6, 0, 0]); // the output unit's fresh-axis default

function aim(): Level {
  return {
    id: 'aim', title: 'AIM', goal: 0.97,
    hide: ['bias', 'add', 'h2', 'out'],
    start: { dataset: 'split', caps: [1, 0], hidden: [[u([0.433, 1.404, 0.633])], []], out: GOLD },
    steps: [
      { say: 'Drag the arrow tip toward orange.', target: arrow(0),
        hint: "Grab the bright dot at the arrow's end.", done: weightChanged(0) },
    ],
    last: { say: 'The wall turns with it. Reach 97%.', hint: 'Orbit the view: drag empty space.' },
    aha: 'The arrow points at orange. Its wall stands square to it.',
  };
}

function bias(): Level {
  return {
    id: 'bias', title: 'BIAS', goal: 0.97,
    hide: ['add', 'h2', 'out'],
    start: { dataset: 'offset', caps: [1, 0], hidden: [[u([0, 1.503, 0.549])], []], out: GOLD },
    steps: [
      { say: 'Stretch or shrink the arrow. Does the wall move?', target: arrow(0),
        done: stretched(0) },
    ],
    last: { say: 'The wall stays put. Slide the bias to move it.', target: slider(0),
      hint: 'Slide left to push the wall along the arrow.' },
    aha: 'Length sets sharpness. Bias slides the wall without turning it.',
  };
}

function twoWalls(): Level {
  const goal = 0.97;
  const below = u([-0.147, -2.388, -0.724], 1.06); // wall between the top blue disc and orange
  return {
    id: 'two-walls', title: 'TWO WALLS', goal,
    hide: ['h2'],
    start: { dataset: 'sandwich', caps: [2, 0], hidden: [[below], []], out: GOLD },
    steps: [
      { say: "One wall can't trap orange. Add a unit.", target: addButton(0),
        done: unitCount(0, 2) },
      { say: 'Wall off the other side of orange.', target: arrow(0, 1),
        hint: 'Point it opposite the first, then slide its bias.', done: separates(1, goal) },
    ],
    last: { say: 'In latent space 1, orange owns a corner. Aim the gold arrow at it.',
      target: arrow(2), hint: "Then slide gold's bias to cut off just that corner." },
    aha: 'Two walls fold space into a square. Gold slices the square.',
  };
}

function enclose(): Level {
  const goal = 0.95;
  // Inward-facing walls 0.4 from the rod's axis, at 90° and 210° around it.
  const walls = [u([0, 0, -4], 1.6), u([3.464, 0, 2], 1.6)];
  return {
    id: 'enclose', title: 'ENCLOSE', goal,
    hide: ['h2'],
    start: { dataset: 'core', caps: [3, 0], hidden: [walls, []], out: u([2, 2, 0], -1.8) },
    steps: [
      { say: 'Two walls leak. Add a third.', target: addButton(0), done: unitCount(0, 3) },
      { say: 'Close the triangle around orange.', target: arrow(0, 2),
        hint: 'Face it inward, then slide its bias.', done: separates(1, goal) },
    ],
    last: { say: 'The square became a cube. Tilt gold to the orange corner.', target: arrow(2),
      hint: "Lower gold's bias until only that corner is cut off." },
    aha: 'Three walls fence a region. Each unit adds a dimension.',
  };
}

function descend(): Level {
  const goal = 0.96;
  const axes = [u([3.2, 0, 0]), u([0, 3.2, 0])]; // four clumps at the square's corners
  return {
    id: 'descend', title: 'DESCEND', goal,
    hide: [],
    start: { dataset: 'checker', caps: [2, 2], hidden: [axes, []], out: u([1.5, 1.5, 0], -1.5) },
    steps: [
      { say: 'Drag gold. Can one wall split the diagonal?', target: arrow(2),
        done: weightChanged(2) },
      { say: "It can't. Add a unit to hidden 2.", target: addButton(1), done: unitCount(1, 1) },
      { say: 'Your gold wall became a unit. Add another.', target: addButton(1),
        done: unitCount(1, 2) },
      { say: 'Give each orange corner its own wall.', target: arrow(1, 1),
        hint: 'Aim one arrow at each orange clump, then slide the biases.',
        done: separates(2, goal) },
    ],
    last: { say: 'Gold reads the new space now. Aim it to finish.', target: arrow(2),
      hint: 'Point gold at the orange side, then slide its bias.' },
    aha: 'Layer one moves the points. Layer two draws walls where they land.',
  };
}

export const LEVELS: Level[] = [aim(), bias(), twoWalls(), enclose(), descend()];
