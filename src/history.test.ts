import { describe, it, expect } from 'vitest';
import { Session } from './session';
import { History } from './history';

describe('History', () => {
  it('one mark per gesture: a whole drag undoes in one step', () => {
    const s = new Session();
    const h = new History(s);
    const w0 = [...s.net.hidden[0][0].w];

    h.mark(); // grab
    s.setWeight(0, 0, [1, 1, 0]); // many moves
    s.setWeight(0, 0, [1.5, 0.5, 0.2]);
    s.setWeight(0, 0, [2, -1, 0.4]);

    h.undo();
    expect([...s.net.hidden[0][0].w]).toEqual(w0);
    expect(h.canUndo).toBe(false);
  });

  it('redo round-trips, and a new mark clears redo', () => {
    const s = new Session();
    const h = new History(s);
    h.mark();
    s.setBias(0, 0, 1.5);

    h.undo();
    expect(s.net.hidden[0][0].b).toBe(0);
    expect(h.canRedo).toBe(true);
    h.redo();
    expect(s.net.hidden[0][0].b).toBe(1.5);

    h.undo();
    h.mark();
    s.setBias(0, 0, -2);
    expect(h.canRedo).toBe(false);
  });

  it('duplicate marks and no-change gestures are skipped', () => {
    const s = new Session();
    const h = new History(s);
    h.mark();
    h.mark(); // duplicate of the top: dropped
    expect(h.canUndo).toBe(false); // stack holds nothing that differs from now

    s.setBias(0, 0, 0.8); // a real gesture starting from the marked state
    expect(h.canUndo).toBe(true);
    h.undo();
    expect(s.net.hidden[0][0].b).toBe(0);
  });

  it('undoes structure changes including the promotion rule', () => {
    const s = new Session();
    s.setWeight(2, 0, [1.2, 0, 0]);
    s.setBias(2, 0, 0.4);

    const h = new History(s);
    h.mark();
    s.addUnit(1); // promotes the output vector
    expect(s.net.hidden[1]).toHaveLength(1);

    h.undo();
    expect(s.net.hidden[1]).toHaveLength(0);
    expect(s.net.out.w[0]).toBeCloseTo(1.2, 6);
    expect(s.net.out.b).toBe(0.4);
  });

  it('undoes a dataset switch, notifying dataset listeners', () => {
    const s = new Session('rings');
    const h = new History(s);
    const changes: string[] = [];
    s.subscribe((c) => changes.push(c));

    h.mark();
    s.setDataset('xor');
    h.undo();
    expect(s.datasetName).toBe('rings');
    expect(changes).toContain('dataset');
  });

  it('caps the stack at the limit', () => {
    const s = new Session();
    const h = new History(s, 5);
    for (let i = 0; i < 12; i++) {
      h.mark();
      s.setBias(0, 0, i * 0.1);
    }
    let undos = 0;
    while (h.canUndo) {
      h.undo();
      undos++;
    }
    expect(undos).toBeLessThanOrEqual(5);
    // oldest surviving state, not the true origin
    expect(s.net.hidden[0][0].b).toBeCloseTo(0.6, 6);
  });

  it('restore keeps net object identity so gizmo entries stay valid', () => {
    const s = new Session();
    const netRef = s.net;
    const h = new History(s);
    h.mark();
    s.addUnit(0);
    h.undo();
    expect(s.net).toBe(netRef);
    expect(s.net.hidden[0]).toHaveLength(1);
  });
});
