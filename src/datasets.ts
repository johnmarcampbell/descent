// Dataset generators. All produce exactly N points in roughly [-1.6, 1.6]³,
// half per class. The free-play sets are not linearly separable — hidden
// layers required. Seeded sets are fixed tutorial level data.

import type { Vec3 } from './network';

export const N_POINTS = 900;

/** The free-play picker: name → label. The seeded sets below are level data, not listed. */
export const DATASET_NAMES: Record<string, string> = {
  rings: 'linked rings',
  spheres: 'nested spheres',
  helix: 'twin helix',
  xor: 'xor cube',
};

export interface Dataset {
  X: Float32Array; // n×3
  y: Uint8Array;   // n, 0 | 1
  n: number;
}

type Rng = () => number;

interface DatasetSpec {
  seed?: number; // a seeded set is reproducible
  sample(cls: 0 | 1, rng: Rng): Vec3;
}

const SPECS: Record<string, DatasetSpec> = {
  rings: {
    // Hopf-linked tori: one in the xy plane, one in the xz plane.
    sample(cls, rng) {
      const theta = rng() * 2 * Math.PI;
      const [c, s] = [0.9 * Math.cos(theta), 0.9 * Math.sin(theta)];
      const g = (): number => gauss(0.08, rng);
      return cls === 0 ? [-0.45 + c + g(), s + g(), g()] : [0.45 + c + g(), g(), s + g()];
    },
  },
  spheres: {
    sample(cls, rng) {
      const [dx, dy, dz] = randDir(rng);
      const r = (cls === 0 ? 0.6 : 1.35) + gauss(0.09, rng);
      return [dx * r, dy * r, dz * r];
    },
  },
  helix: {
    sample(cls, rng) {
      const t = rng();
      const theta = t * 4 * Math.PI + (cls === 0 ? 0 : Math.PI);
      return [
        0.85 * Math.cos(theta) + gauss(0.07, rng),
        (t * 2 - 1) * 1.3 + gauss(0.07, rng),
        0.85 * Math.sin(theta) + gauss(0.07, rng),
      ];
    },
  },
  xor: {
    // Octant parity: z's side is chosen so that the product of the signs matches the class.
    sample(cls, rng) {
      const [sx, sy] = [sign(rng), sign(rng)];
      const sz = cls ? sx * sy : -sx * sy;
      const jitter = (v: number): number => v * 0.85 + gauss(0.27, rng);
      return [jitter(sx), jitter(sy), jitter(sz)];
    },
  },

  split: {
    seed: 1,
    sample: (c, rng) =>
      rot([gauss(0.28, rng) + (c ? 0.85 : -0.85), gauss(0.4, rng), gauss(0.4, rng)], 0.5, 0.6),
  },
  offset: {
    seed: 2,
    sample(c, rng) {
      const [a, b] = disc(0.6, rng);
      return rot([a, (c ? 1.05 : 0.35) + gauss(0.07, rng), b], 0.35, 0);
    },
  },
  sandwich: {
    seed: 3,
    sample(c, rng) {
      const [a, b] = disc(0.65, rng);
      const y = c ? gauss(0.08, rng) : (rng() < 0.5 ? -0.85 : 0.85) + gauss(0.08, rng);
      return rot([a, y, b], 0.3, 0.2);
    },
  },
  core: {
    seed: 4,
    sample(c, rng) {
      if (c) {
        const [a, b] = disc(0.38, rng);
        return [a, uniform(-1, 1, rng), b];
      }
      const t = uniform(0, 2 * Math.PI, rng);
      const r = 1.25 + gauss(0.07, rng);
      return [r * Math.cos(t), uniform(-1, 1, rng), r * Math.sin(t)];
    },
  },
  checker: {
    seed: 5,
    sample(c, rng) {
      const sx = sign(rng);
      const sy = c ? sx : -sx;
      return [sx * uniform(0.18, 1.3, rng), sy * uniform(0.18, 1.3, rng), uniform(-0.5, 0.5, rng)];
    },
  },
};

export function generate(name: string): Dataset {
  const spec = SPECS[name];
  if (!spec) throw new Error(`unknown dataset: ${name}`);
  const rng = spec.seed === undefined ? Math.random : mulberry32(spec.seed);
  const n = N_POINTS;
  const X = new Float32Array(n * 3);
  const y = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    y[i] = i % 2;
    X.set(spec.sample(y[i] as 0 | 1, rng), i * 3);
  }
  return { X, y, n };
}

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(sigma: number, rng: Rng): number {
  const u = rng() || 1e-9;
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sigma;
}

function uniform(lo: number, hi: number, rng: Rng): number {
  return lo + (hi - lo) * rng();
}

function sign(rng: Rng): number {
  return rng() < 0.5 ? -1 : 1;
}

function randDir(rng: Rng): Vec3 {
  let x = 0, y = 0, z = 0, n = 0;
  do {
    x = rng() * 2 - 1;
    y = rng() * 2 - 1;
    z = rng() * 2 - 1;
    n = Math.hypot(x, y, z);
  } while (n < 1e-3 || n > 1);
  return [x / n, y / n, z / n];
}

/** Uniform point in a disc of radius r. */
function disc(r: number, rng: Rng): [number, number] {
  const rr = r * Math.sqrt(rng());
  const t = rng() * 2 * Math.PI;
  return [rr * Math.cos(t), rr * Math.sin(t)];
}

/** Rotate p about x by ax, then about y by ay. */
function rot([x, y, z]: Vec3, ax: number, ay: number): Vec3 {
  const y1 = y * Math.cos(ax) - z * Math.sin(ax);
  const z1 = y * Math.sin(ax) + z * Math.cos(ax);
  return [x * Math.cos(ay) + z1 * Math.sin(ay), y1, -x * Math.sin(ay) + z1 * Math.cos(ay)];
}
