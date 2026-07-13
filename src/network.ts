// The whole "model" — a hand-driven MLP: up to two hidden tanh layers of up to
// three units each, plus a single sigmoid output unit. Weights always live in
// ℝ³ so they can be drawn as arrows; dims beyond a layer's real input size are
// pinned to zero by sanitize().

export type Vec3 = [number, number, number];

export interface Unit {
  w: Vec3;
  b: number;
}

export interface Net {
  hidden: [Unit[], Unit[]];
  out: Unit;
}

export const MAX_UNITS = 3;
export const MAX_W = 4;
export const MIN_W = 0.15;

function randomDir(): Vec3 {
  let x = 0, y = 0, z = 0, n = 0;
  do {
    x = Math.random() * 2 - 1;
    y = Math.random() * 2 - 1;
    z = Math.random() * 2 - 1;
    n = Math.hypot(x, y, z);
  } while (n < 1e-3 || n > 1);
  return [x / n, y / n, z / n];
}

export function randomUnit(): Unit {
  const d = randomDir();
  const m = 0.9 + Math.random() * 0.8;
  return { w: [d[0] * m, d[1] * m, d[2] * m], b: 0 };
}

export function makeNet(): Net {
  return { hidden: [[randomUnit()], []], out: randomUnit() };
}

/** Which activation space the output unit reads: 1 = hidden-1, 2 = hidden-2. */
export function outSpaceIndex(net: Net): 1 | 2 {
  return net.hidden[1].length > 0 ? 2 : 1;
}

/** Dimensionality of a space: 0 = input (ℝ³), 1 = hidden-1, 2 = hidden-2. */
export function spaceDims(net: Net, space: 0 | 1 | 2): number {
  return space === 0 ? 3 : net.hidden[space - 1].length;
}

/** Zero out weight components that point into dims the layer doesn't have. */
export function sanitize(net: Net): void {
  const k1 = net.hidden[0].length;
  for (const u of net.hidden[1]) {
    for (let d = k1; d < 3; d++) u.w[d] = 0;
  }
  const ko = spaceDims(net, outSpaceIndex(net));
  for (let d = ko; d < 3; d++) net.out.w[d] = 0;
}

export interface ForwardResult {
  h1: Float32Array; // n×3, unused dims are 0
  h2: Float32Array; // n×3, all 0 when hidden-2 is empty
  p: Float32Array;  // n, output probability of class 1
  accuracy: number;
  loss: number;
}

export function allocResult(n: number): ForwardResult {
  return {
    h1: new Float32Array(n * 3),
    h2: new Float32Array(n * 3),
    p: new Float32Array(n),
    accuracy: 0,
    loss: 0,
  };
}

export function forward(net: Net, X: Float32Array, y: Uint8Array, n: number, r: ForwardResult): void {
  const L1 = net.hidden[0];
  const L2 = net.hidden[1];
  const k1 = L1.length;
  const k2 = L2.length;
  const out = net.out;
  let correct = 0;
  let loss = 0;

  for (let i = 0; i < n; i++) {
    const xi = i * 3;
    const x0 = X[xi], x1 = X[xi + 1], x2 = X[xi + 2];

    let a0 = 0, a1 = 0, a2 = 0;
    for (let j = 0; j < 3; j++) {
      let v = 0;
      if (j < k1) {
        const u = L1[j];
        v = Math.tanh(u.w[0] * x0 + u.w[1] * x1 + u.w[2] * x2 + u.b);
      }
      r.h1[xi + j] = v;
      if (j === 0) a0 = v; else if (j === 1) a1 = v; else a2 = v;
    }

    let f0 = a0, f1 = a1, f2 = a2;
    if (k2 > 0) {
      f0 = f1 = f2 = 0;
      for (let j = 0; j < 3; j++) {
        let v = 0;
        if (j < k2) {
          const u = L2[j];
          v = Math.tanh(u.w[0] * a0 + u.w[1] * a1 + u.w[2] * a2 + u.b);
        }
        r.h2[xi + j] = v;
        if (j === 0) f0 = v; else if (j === 1) f1 = v; else f2 = v;
      }
    } else {
      r.h2[xi] = r.h2[xi + 1] = r.h2[xi + 2] = 0;
    }

    const z = out.w[0] * f0 + out.w[1] * f1 + out.w[2] * f2 + out.b;
    const p = 1 / (1 + Math.exp(-z));
    r.p[i] = p;

    const t = y[i];
    loss += t === 1 ? -Math.log(p + 1e-7) : -Math.log(1 - p + 1e-7);
    if ((p > 0.5 ? 1 : 0) === t) correct++;
  }

  r.accuracy = correct / n;
  r.loss = loss / n;
}
