import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Session } from '../session';
import type { Snapshot } from '../session';
import { History } from '../history';
import { MAX_W, MIN_W } from '../network';
import type { Vec3 } from '../network';
import { LEVELS } from './levels';
import { Tutorial } from './tutorial';

function accuracy(snap: Snapshot): number {
  const s = new Session(snap.dataset);
  s.restore(snap);
  return s.res.accuracy;
}

/** Every unit is one the session itself would produce: sanitized, |w| and b in range. */
function reachable(snap: Snapshot): void {
  const s = new Session(snap.dataset);
  s.restore(snap);
  expect(s.snapshot()).toEqual(snap);
  for (const { w, b } of [...snap.hidden[0], ...snap.hidden[1], snap.out]) {
    expect(Math.hypot(...w)).toBeGreaterThanOrEqual(MIN_W);
    expect(Math.hypot(...w)).toBeLessThanOrEqual(MAX_W);
    expect(Math.abs(b)).toBeLessThanOrEqual(3); // the bias sliders' range
  }
  expect(snap.hidden[0].length).toBeLessThanOrEqual(snap.caps[0]);
  expect(snap.hidden[1].length).toBeLessThanOrEqual(snap.caps[1]);
}

/** addUnit, with the new unit's random direction pinned to `d` (‖d‖ ≤ 1). */
const addAlong = (layer: 0 | 1, d: Vec3) => (s: Session): void => {
  const random = vi.spyOn(Math, 'random');
  for (const v of [...d.map((c) => (c + 1) / 2), 0.5]) random.mockReturnValueOnce(v);
  s.addUnit(layer);
  random.mockRestore();
};

type Move = (s: Session) => void;

/** Per level: each scripted move, and the step index the tutorial is on after it. */
const WALKS: Record<string, [Move, number][]> = {
  aim: [
    [(s) => s.setWeight(0, 0, [0.9, 0.9, 0]), 1],
    [(s) => s.setWeight(0, 0, [1.321, 0, -0.903]), 1],
  ],
  bias: [
    [(s) => s.setWeight(0, 0, [0, 2.348, 0.858]), 1],
    [(s) => s.setBias(0, 0, -1.6), 1],
  ],
  'two-walls': [
    [addAlong(0, [1, 0, 0]), 1],
    [(s) => s.setWeight(0, 1, [0.147, 2.388, 0.724]), 1], // aimed, but its wall still cuts orange
    [(s) => s.setBias(0, 1, 1.06), 2],
    [(s) => s.setWeight(2, 0, [2.5, 2.5, 0]), 2],
    [(s) => s.setBias(2, 0, -2.2), 2],
  ],
  enclose: [
    [addAlong(0, [0, 1, 0]), 1],
    [(s) => s.setWeight(0, 2, [-3.464, 0, 2]), 1],
    [(s) => s.setBias(0, 2, 1.6), 2],
    [(s) => s.setWeight(2, 0, [1.5, 1.5, 1.5]), 2],
    [(s) => s.setBias(2, 0, -2.4), 2],
  ],
  descend: [
    [(s) => s.setWeight(2, 0, [1.8, 1.0, 0]), 1],
    [(s) => s.addUnit(1), 2], // promotes gold into hidden 2
    [addAlong(1, [0.707, -0.707, 0]), 3],
    [(s) => s.setWeight(1, 0, [2.5, 2.5, 0]), 3],
    [(s) => s.setBias(1, 0, -1.9), 3],
    [(s) => s.setWeight(1, 1, [-2.5, -2.5, 0]), 3],
    [(s) => s.setBias(1, 1, -1.9), 4],
    [(s) => s.setWeight(2, 0, [2, 2, 0]), 4],
    [(s) => s.setBias(2, 0, 1.6), 4],
  ],
};

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem() {} });
});

describe.each(LEVELS.map((l) => [l.id, l] as const))('level %s', (id, level) => {
  it('starts in a state the session can reach, clearly below the goal', () => {
    reachable(level.start);
    expect(accuracy(level.start)).toBeLessThan(level.goal - 0.08);
  });

  // The walk is the proof the level can be won: every step in order, then the goal held.
  it('a scripted walk advances the steps in order and wins', () => {
    const s = new Session();
    const t = new Tutorial(s, new History(s), LEVELS);
    t.start(LEVELS.indexOf(level));
    expect(t.stepIndex).toBe(0);
    for (const [move, step] of WALKS[id]) {
      move(s);
      expect(t.stepIndex).toBe(step);
      t.tick(0.1);
    }
    expect(t.stepIndex).toBe(level.steps.length);
    expect(t.step).toBe(level.last);
    expect(s.res.accuracy).toBeGreaterThanOrEqual(level.goal);
    expect(t.won).toBe(false);
    t.tick(0.5);
    expect(t.won).toBe(true);
  });
});
