# DESCENT

A game where you build a tiny neural network *by hand*. A 3D dataset (two
colored classes, 900 points) sits in the first viewport; you drag weight-vector
arrows and slide biases to sculpt each layer's activation space until the gold
decision plane separates the colors. Accuracy is your score.

Two consecutive layers are on screen at a time, so edits to layer N are
immediately visible in layer N+1. Use the **descend ›** / **‹ ascend** buttons
(or ←/→ arrow keys) to move the two-viewport window deeper into or back out of
the network. The **⛶** button on a viewport focuses it — it fills the stage
and the other half of the pair becomes a minimap inset (**⤢** swaps them,
**⊟** returns to the split). Boundary planes can be toggled in the display
section; a unit's plane always shows while you're dragging its arrow, even
when toggled off.

## Run it

```sh
npm install
npm run dev
```

## How it maps to a real MLP

- **Architecture**: input ℝ³ → hidden 1 (1–3 tanh units) → hidden 2 (0–3 tanh
  units) → 1 sigmoid output. With `k` units in a layer, its output space is
  k-dimensional: 1 unit → points on a line, 2 → a plane, 3 → a cube.
- Each viewport shows one space; the arrows drawn *in* a viewport are the
  weight vectors of the units that *read* that space. Arrow direction = weight
  direction, arrow length = ‖w‖ (sharpness of the tanh boundary). The
  translucent plane through each arrow is that unit's `w·x + b = 0` surface.
- If hidden 2 is empty the output unit reads hidden 1 directly, so the gold
  output arrow lives in viewport 2 until you add a hidden-2 unit.
- tanh (not ReLU) keeps every activation space inside the fixed [-1,1]³ cube,
  so views never jump around while you drag.

## Architecture decisions

- **No backend, on purpose.** The full forward pass (900 points × ≤21
  weights) measures ~0.001 ms in the browser; a network round-trip would be
  ~10,000× slower than just recomputing. Everything is TypeScript.
- **No math/NN library.** Hand-written loops over `Float32Array`s in
  `src/network.ts` are faster and simpler at this scale.
- **One WebGL canvas, three scissored viewports** (`src/viz/viewports.ts`),
  each with its own scene/camera/orbit-controls bound to a DOM cell.
- **Zero allocation in the hot path**: drag → forward pass into preallocated
  buffers → mutate point-cloud position attributes in place.
- Point positions ease toward their targets each frame (~100 ms exponential
  smoothing), so adding a unit animates points lifting off the line into the
  plane, while drags still feel instant.

## Layout

- `src/network.ts` — model, forward pass, metrics. Pure, no three.js.
- `src/datasets.ts` — generators (linked rings, nested spheres, twin helix,
  xor cube). All non-linearly-separable so hidden layers matter.
- `src/viz/` — viewports, glowing point clouds, draggable arrow gizmos.
- `src/ui.ts` — right-hand control panel (bias sliders, add/remove unit,
  dataset picker, accuracy).
- `src/main.ts` — state, drag interaction, render loop.

`window.__descent` exposes internals for debugging/testing.
