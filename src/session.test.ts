import { describe, it, expect } from 'vitest';
import { Session } from './session';
import type { SessionChange } from './session';
import { outSpaceIndex, MAX_UNITS, MAX_W, MIN_W } from './network';
import { N_POINTS } from './datasets';

function collect(s: Session): SessionChange[] {
  const seen: SessionChange[] = [];
  s.subscribe((c) => seen.push(c));
  return seen;
}

describe('Session', () => {
  it('boots with a computed forward pass', () => {
    const s = new Session();
    expect(s.net.hidden[0]).toHaveLength(1);
    expect(s.net.hidden[1]).toHaveLength(0);
    expect(s.res.accuracy).toBeGreaterThan(0);
    expect(s.res.accuracy).toBeLessThanOrEqual(1);
    expect(Number.isFinite(s.res.loss)).toBe(true);
    // h1 is populated (tanh outputs, non-zero for a random unit)
    expect(Math.abs(s.res.h1[0])).toBeGreaterThan(0);
  });

  it('setBias recomputes and notifies values', () => {
    const s = new Session();
    const seen = collect(s);
    const before = s.res.loss;
    s.setBias(0, 0, 2.5);
    expect(s.net.hidden[0][0].b).toBe(2.5);
    expect(s.res.loss).not.toBe(before);
    expect(seen).toEqual(['values']);
  });

  it('the first hidden-2 unit is promoted from the tuned output unit', () => {
    const s = new Session();
    s.addUnit(0); // hidden-1: 2 units → output reads a 2-dim space
    s.setWeight(2, 0, [0.8, -1.2, 0]);
    s.setBias(2, 0, 0.7);
    const seen = collect(s);

    s.addUnit(1);
    expect(outSpaceIndex(s.net)).toBe(2);
    // the player's tuned vector became the hidden-2 unit …
    expect(s.net.hidden[1][0].w).toEqual([0.8, -1.2, 0]);
    expect(s.net.hidden[1][0].b).toBe(0.7);
    // … and the output restarted on the fresh 1-dim axis
    expect(s.net.out.w).toEqual([1.6, 0, 0]);
    expect(s.net.out.b).toBe(0);
    expect(seen).toEqual(['structure']);
  });

  it('promotion preserves every prediction exactly', () => {
    const s = new Session();
    s.addUnit(0);
    s.setWeight(2, 0, [1.3, -0.9, 0]);
    s.setBias(2, 0, -0.4);
    const before = Array.from(s.res.p, (p) => (p > 0.5 ? 1 : 0));
    const accBefore = s.res.accuracy;

    s.addUnit(1);
    const after = Array.from(s.res.p, (p) => (p > 0.5 ? 1 : 0));
    expect(after).toEqual(before);
    expect(s.res.accuracy).toBe(accBefore);
  });

  it('later hidden-2 units are random, not promotions', () => {
    const s = new Session();
    s.addUnit(1); // promotion happens here
    s.setWeight(2, 0, [2, 0, 0]);
    s.setBias(2, 0, 0.3);
    s.addUnit(1); // second unit: plain add
    expect(s.net.hidden[1]).toHaveLength(2);
    // output untouched by a non-promoting add (modulo sanitize widening)
    expect(s.net.out.w[0]).toBe(2);
    expect(s.net.out.b).toBe(0.3);
  });

  it('hidden-1 adds never promote', () => {
    const s = new Session();
    s.setWeight(2, 0, [1.1, 0, 0]);
    s.setBias(2, 0, 0.2);
    s.addUnit(0);
    expect(s.net.out.w[0]).toBe(1.1);
    expect(s.net.out.b).toBe(0.2);
    expect(s.net.hidden[1]).toHaveLength(0);
  });

  it('removing a unit re-sanitizes downstream weights', () => {
    const s = new Session();
    s.addUnit(0); // hidden-1: 2 units
    s.addUnit(1);
    s.addUnit(1); // hidden-2: 2 units, reading a 2-dim space
    s.net.out.w = [1, 1, 1];
    s.removeUnit(1, 0); // hidden-2 back to 1 unit
    expect(s.net.out.w[1]).toBe(0);
    expect(s.net.out.w[2]).toBe(0);
  });

  it('addUnit refuses beyond MAX_UNITS', () => {
    const s = new Session();
    for (let i = 0; i < 5; i++) s.addUnit(0);
    expect(s.net.hidden[0]).toHaveLength(MAX_UNITS);
  });

  it('setWeight zeroes dims the space lacks and clamps the norm', () => {
    const s = new Session();
    // hidden-1 has 1 unit → hidden-2 units read a 1-dim space
    s.addUnit(1);
    s.setWeight(1, 0, [10, 10, 10]);
    const w = s.net.hidden[1][0].w;
    expect(w[1]).toBe(0);
    expect(w[2]).toBe(0);
    expect(Math.hypot(w[0], w[1], w[2])).toBeCloseTo(MAX_W, 5);

    s.setWeight(1, 0, [0.001, 0, 0]);
    expect(Math.hypot(...s.net.hidden[1][0].w)).toBeCloseTo(MIN_W, 5);
  });

  it('setWeight ignores a degenerate near-zero candidate', () => {
    const s = new Session();
    const before = [...s.net.hidden[0][0].w];
    s.setWeight(0, 0, [1e-6, 0, 0]);
    expect(s.net.hidden[0][0].w).toEqual(before);
  });

  it('setDataset regenerates data and notifies dataset', () => {
    const s = new Session();
    const seen = collect(s);
    const oldX = s.data.X;
    s.setDataset('xor');
    expect(s.datasetName).toBe('xor');
    expect(s.data.n).toBe(N_POINTS);
    expect(s.data.X).not.toBe(oldX);
    expect(seen).toEqual(['dataset']);
  });

  it('randomize keeps structure but replaces weights', () => {
    const s = new Session();
    s.addUnit(0);
    s.setBias(0, 0, 3);
    s.randomize();
    expect(s.net.hidden[0]).toHaveLength(2);
    expect(s.net.hidden[0][0].b).toBe(0);
  });

  it('unsubscribe stops notifications', () => {
    const s = new Session();
    const seen: SessionChange[] = [];
    const off = s.subscribe((c) => seen.push(c));
    s.setBias(0, 0, 1);
    off();
    s.setBias(0, 0, 2);
    expect(seen).toEqual(['values']);
  });
});
