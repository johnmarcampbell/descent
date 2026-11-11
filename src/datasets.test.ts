import { describe, it, expect } from 'vitest';
import { N_POINTS, generate } from './datasets';

const SEEDED = ['split', 'offset', 'sandwich', 'core', 'checker'];

describe('datasets', () => {
  it.each(SEEDED)('%s is reproducible and exactly balanced', (name) => {
    const a = generate(name);
    const b = generate(name);
    expect(a.X).toEqual(b.X);
    expect(a.y).toEqual(b.y);
    expect(a.n).toBe(N_POINTS);
    expect(a.y.reduce((s, v) => s + v, 0)).toBe(N_POINTS / 2);
    expect(a.X.every(Number.isFinite)).toBe(true);
  });

  it('free-play sets are random per generation', () => {
    expect(generate('rings').X).not.toEqual(generate('rings').X);
  });

  it('xor is exactly balanced and labels each point by its octant parity', () => {
    const { X, y, n } = generate('xor');
    expect(y.reduce((s, v) => s + v, 0)).toBe(N_POINTS / 2);
    let agree = 0;
    for (let i = 0; i < n; i++) {
      const parity = X[i * 3] * X[i * 3 + 1] * X[i * 3 + 2] > 0 ? 1 : 0;
      if (parity === y[i]) agree++;
    }
    expect(agree / n).toBeGreaterThan(0.8); // noise blurs points across octant walls
  });

  it('throws on an unknown name', () => {
    expect(() => generate('nope')).toThrow(/nope/);
  });
});
