// "Could one plane in this space reach `acc`?" — answered by fitting a logistic
// readout with batch gradient descent, stopping as soon as its plane classifies
// well enough. At most ITERS × n multiply-adds: cheap enough for every drag move.

const ITERS = 40;
const LR = 6;

/** `X` is n×3 (unused dims 0), `y` is 0 | 1 per point. */
export function separable(X: Float32Array, y: Uint8Array, acc: number): boolean {
  const n = y.length;
  const w = [0, 0, 0, 0]; // w0..w2, bias
  for (let it = 0; it <= ITERS; it++) {
    const g = [0, 0, 0, 0];
    let correct = 0;
    for (let i = 0; i < n; i++) {
      const x0 = X[i * 3], x1 = X[i * 3 + 1], x2 = X[i * 3 + 2];
      const z = w[0] * x0 + w[1] * x1 + w[2] * x2 + w[3];
      if (z > 0 === (y[i] === 1)) correct++;
      const e = 1 / (1 + Math.exp(-z)) - y[i];
      g[0] += e * x0; g[1] += e * x1; g[2] += e * x2; g[3] += e;
    }
    if (correct >= acc * n) return true;
    for (let d = 0; d < 4; d++) w[d] -= (LR * g[d]) / n;
  }
  return false;
}
