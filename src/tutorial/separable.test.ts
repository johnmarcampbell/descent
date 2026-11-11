import { describe, it, expect } from 'vitest';
import { separable } from './separable';

/** n points at the given corners (cycled), jittered deterministically, labelled by `label`. */
function layout(corners: [number, number][], label: (x: number, y: number) => 0 | 1, n = 400) {
  const X = new Float32Array(n * 3);
  const y = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const [cx, cy] = corners[i % corners.length];
    X[i * 3] = cx + 0.2 * Math.sin(i * 12.9898);
    X[i * 3 + 1] = cy + 0.2 * Math.sin(i * 78.233);
    y[i] = label(cx, cy);
  }
  return { X, y };
}

const CORNERS: [number, number][] = [[-0.8, -0.8], [-0.8, 0.8], [0.8, -0.8], [0.8, 0.8]];

describe('separable', () => {
  it('finds the plane through a separable space', () => {
    const { X, y } = layout(CORNERS, (x, yy) => (x + yy > 0.5 ? 1 : 0));
    expect(separable(X, y, 0.99)).toBe(true);
  });

  it('rejects an xor layout: no plane gets past 75%', () => {
    const { X, y } = layout(CORNERS, (x, yy) => (x * yy > 0 ? 1 : 0));
    expect(separable(X, y, 0.9)).toBe(false);
  });

  it('reads the third dimension too', () => {
    const { X, y } = layout(CORNERS, () => 0);
    for (let i = 0; i < y.length; i++) y[i] = Math.sin(i * 4.1) > 0 ? 1 : 0;
    expect(separable(X, y, 0.9)).toBe(false); // labels unrelated to x, y
    for (let i = 0; i < y.length; i++) X[i * 3 + 2] = y[i] ? 0.5 : -0.5;
    expect(separable(X, y, 0.99)).toBe(true);
  });
});
