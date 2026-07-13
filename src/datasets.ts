// Dataset generators. All produce exactly N points in roughly [-1.6, 1.6]³,
// half per class, and none are linearly separable — hidden layers required.

export const N_POINTS = 900;

export interface Dataset {
  X: Float32Array; // n×3
  y: Uint8Array;   // n, 0 | 1
  n: number;
}

export const DATASET_NAMES: Record<string, string> = {
  rings: 'linked rings',
  spheres: 'nested spheres',
  helix: 'twin helix',
  xor: 'xor cube',
};

function gauss(sigma = 1): number {
  const u = Math.random() || 1e-9;
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sigma;
}

export function generate(name: string): Dataset {
  const n = N_POINTS;
  const X = new Float32Array(n * 3);
  const y = new Uint8Array(n);

  for (let i = 0; i < n; i++) {
    const cls = i % 2;
    y[i] = cls;
    let px = 0, py = 0, pz = 0;

    switch (name) {
      case 'spheres': {
        const [dx, dy, dz] = randDir();
        const r = (cls === 0 ? 0.6 : 1.35) + gauss(0.09);
        px = dx * r; py = dy * r; pz = dz * r;
        break;
      }
      case 'helix': {
        const t = Math.random();
        const theta = t * 4 * Math.PI + (cls === 0 ? 0 : Math.PI);
        px = 0.85 * Math.cos(theta) + gauss(0.07);
        py = (t * 2 - 1) * 1.3 + gauss(0.07);
        pz = 0.85 * Math.sin(theta) + gauss(0.07);
        break;
      }
      case 'xor': {
        const sx = Math.random() < 0.5 ? -1 : 1;
        const sy = Math.random() < 0.5 ? -1 : 1;
        const sz = Math.random() < 0.5 ? -1 : 1;
        y[i] = sx * sy * sz > 0 ? 1 : 0;
        px = sx * 0.85 + gauss(0.27);
        py = sy * 0.85 + gauss(0.27);
        pz = sz * 0.85 + gauss(0.27);
        break;
      }
      case 'rings':
      default: {
        // Hopf-linked tori: one in the xy plane, one in the xz plane.
        const theta = Math.random() * 2 * Math.PI;
        const R = 0.9;
        if (cls === 0) {
          px = -0.45 + R * Math.cos(theta) + gauss(0.08);
          py = R * Math.sin(theta) + gauss(0.08);
          pz = gauss(0.08);
        } else {
          px = 0.45 + R * Math.cos(theta) + gauss(0.08);
          py = gauss(0.08);
          pz = R * Math.sin(theta) + gauss(0.08);
        }
        break;
      }
    }

    X[i * 3] = px;
    X[i * 3 + 1] = py;
    X[i * 3 + 2] = pz;
  }

  return { X, y, n };
}

function randDir(): [number, number, number] {
  let x = 0, y = 0, z = 0, n = 0;
  do {
    x = Math.random() * 2 - 1;
    y = Math.random() * 2 - 1;
    z = Math.random() * 2 - 1;
    n = Math.hypot(x, y, z);
  } while (n < 1e-3 || n > 1);
  return [x / n, y / n, z / n];
}
