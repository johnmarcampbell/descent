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

## Mobile prototypes

`mobile.html` hosts two experimental touch-first interfaces over the same
modules — pick one on first visit, or force one with `?proto=deck` /
`?proto=board` (each has a switcher in its controls):

- **A · Deck** — immersive. One layer fills the screen; the adjacent layer
  runs live in a minimap inset (tap it to jump). ‹ › chevrons page through
  the spaces; controls live in a pull-up sheet.
- **B · Board** — cockpit. The two-layer window stacked vertically (edit the
  top pane, watch the bottom react), tabs slide the window, and the full
  control board stays on screen.

Both share `Session`, `Stage`, and `DragController` with the desktop app;
only the adapters differ (touch drag with enlarged hit spheres, sheet/tab
layouts instead of the grid).

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

The modules are split so a second frontend (a dedicated mobile interface)
can reuse the game, the 3D presentation, and the interaction math with its
own adapters:

- `src/network.ts` — model, forward pass, metrics. Pure, no three.js.
- `src/datasets.ts` — generators (linked rings, nested spheres, twin helix,
  xor cube). All non-linearly-separable so hidden layers matter.
- `src/session.ts` — the game session: owns net/data/result, every game
  mutation, and coarse change notifications. Pure; runs headless.
- `src/layerwindow.ts` — layer navigation as a pure state machine: a window
  of consecutive views plus focus, answered as per-view roles.
- `src/drag.ts` — weight-drag controller: client coordinates → ray →
  camera-facing plane → weight candidate for the session. Depends on a
  narrow `DragSurface` interface, not on the stage.
- `src/viz/` — viewports, glowing point clouds, arrow gizmos, and the
  `Stage` that composes them and keeps them in sync with the session.
  Which DOM cells it draws into is constructor input.
- `src/theme.ts` — shared palette.
- `src/ui.ts` — right-hand control panel (bias sliders, add/remove unit,
  dataset picker, accuracy).
- `src/desktop/` — desktop-only adapters: pointer-event drag wiring and the
  nav-button/keyboard layout driver.
- `src/main.ts` — desktop composition root: construct, wire, start.

`npm test` runs the vitest suite — session rules, drag geometry, and
navigation transitions are all exercised headless, no browser needed.
`window.__descent` exposes internals for debugging/testing.
