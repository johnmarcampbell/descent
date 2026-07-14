import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { Session } from './session';
import { DragController } from './drag';
import type { DragSurface } from './drag';
import type { StageEntry } from './viz/stage';
import { ArrowGizmo, W_SCALE } from './viz/arrow';
import { MAX_W, MIN_W } from './network';

// A DragSurface with a real camera and real gizmos but no WebGL — the same
// geometry the app uses, driven by plain coordinates.

const RECT = { left: 0, top: 0, width: 400, height: 400 };

function makeSurface(session: Session): {
  surface: DragSurface;
  entries: StageEntry[];
  camera: THREE.PerspectiveCamera;
  toggles: Array<[number, boolean]>;
} {
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
  camera.position.set(3.2, 2.2, 3.2);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  const gizmo = new ArrowGizmo('#ffffff', 2);
  const unit = session.net.hidden[0][0];
  const entry: StageEntry = { gizmo, unit, layer: 0, idx: 0, view: 0, isOut: false };
  gizmo.hit.userData.entry = entry;
  gizmo.update(unit.w, unit.b);
  gizmo.group.updateMatrixWorld(true);

  const toggles: Array<[number, boolean]> = [];
  const surface: DragSurface = {
    entries: [entry],
    cellRect: () => RECT,
    camera: () => camera,
    setViewInteraction: (view, on) => toggles.push([view, on]),
  };
  return { surface, entries: [entry], camera, toggles };
}

/** Screen position of a world point under the test camera and rect. */
function screenOf(camera: THREE.Camera, world: THREE.Vector3): [number, number] {
  const v = world.clone().project(camera);
  return [((v.x + 1) / 2) * RECT.width, ((1 - v.y) / 2) * RECT.height];
}

function tipOf(session: Session): THREE.Vector3 {
  const w = session.net.hidden[0][0].w;
  return new THREE.Vector3(w[0], w[1], w[2]).multiplyScalar(W_SCALE);
}

describe('DragController', () => {
  it('picks the gizmo tip under the cursor and nothing elsewhere', () => {
    const session = new Session();
    const { surface, entries, camera } = makeSurface(session);
    const drag = new DragController(session, surface);

    const [x, y] = screenOf(camera, tipOf(session));
    expect(drag.pick(0, x, y)).toBe(entries[0]);
    expect(drag.pick(0, 2, 2)).toBeNull(); // far corner
  });

  it('begin grabs, disables the view controls, and highlights', () => {
    const session = new Session();
    const { surface, entries, camera, toggles } = makeSurface(session);
    const drag = new DragController(session, surface);

    const [x, y] = screenOf(camera, tipOf(session));
    const grabbed = drag.begin(0, x, y);
    expect(grabbed).toBe(entries[0]);
    expect(drag.active).toBe(entries[0]);
    expect(toggles).toEqual([[0, false]]);
  });

  it('begin on empty space is a no-op', () => {
    const session = new Session();
    const { surface, toggles } = makeSurface(session);
    const drag = new DragController(session, surface);
    expect(drag.begin(0, 2, 2)).toBeNull();
    expect(drag.active).toBeNull();
    expect(toggles).toEqual([]);
  });

  it('move places the weight at the dragged tip position', () => {
    const session = new Session();
    const { surface, camera } = makeSurface(session);
    const drag = new DragController(session, surface);

    const tip = tipOf(session);
    drag.begin(0, ...screenOf(camera, tip));

    // The drag plane faces the camera through the tip — a target offset
    // within that plane is exactly reachable, so w should land on it.
    const normal = camera.getWorldDirection(new THREE.Vector3());
    const inPlane = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0, 1, 0)).normalize();
    const target = tip.clone().addScaledVector(inPlane, 0.4);
    drag.move(...screenOf(camera, target));

    const w = session.net.hidden[0][0].w;
    const expected = target.clone().divideScalar(W_SCALE);
    expect(w[0]).toBeCloseTo(expected.x, 4);
    expect(w[1]).toBeCloseTo(expected.y, 4);
    expect(w[2]).toBeCloseTo(expected.z, 4);
  });

  it('move clamps ‖w‖ to the model limits on an in-plane far drag', () => {
    const session = new Session();
    const { surface, camera } = makeSurface(session);
    const drag = new DragController(session, surface);

    const tip = tipOf(session);
    drag.begin(0, ...screenOf(camera, tip));

    const normal = camera.getWorldDirection(new THREE.Vector3());
    const inPlane = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0, 1, 0)).normalize();
    const target = tip.clone().addScaledVector(inPlane, 12);
    drag.move(...screenOf(camera, target));

    const w = session.net.hidden[0][0].w;
    const norm = Math.hypot(w[0], w[1], w[2]);
    expect(norm).toBeGreaterThanOrEqual(MIN_W - 1e-6);
    expect(norm).toBeLessThanOrEqual(MAX_W + 1e-6);
    // Direction preserved: w parallel to the (unclamped) target candidate.
    const t = target.clone().normalize();
    const dot = w[0] * t.x + w[1] * t.y + w[2] * t.z;
    expect(dot / norm).toBeCloseTo(1, 4);
  });

  it('move without an active drag does nothing', () => {
    const session = new Session();
    const { surface } = makeSurface(session);
    const drag = new DragController(session, surface);
    const before = [...session.net.hidden[0][0].w];
    drag.move(200, 200);
    expect(session.net.hidden[0][0].w).toEqual(before);
  });

  it('end re-enables controls and clears the active drag', () => {
    const session = new Session();
    const { surface, camera, toggles } = makeSurface(session);
    const drag = new DragController(session, surface);

    drag.begin(0, ...screenOf(camera, tipOf(session)));
    drag.end();
    expect(drag.active).toBeNull();
    expect(toggles).toEqual([[0, false], [0, true]]);
    drag.end(); // idempotent
    expect(toggles).toHaveLength(2);
  });

  it('a drag notifies the session values listener', () => {
    const session = new Session();
    const { surface, camera } = makeSurface(session);
    const drag = new DragController(session, surface);
    const listener = vi.fn();
    session.subscribe(listener);

    const tip = tipOf(session);
    drag.begin(0, ...screenOf(camera, tip));
    drag.move(...screenOf(camera, tip.clone().multiplyScalar(1.5)));
    expect(listener).toHaveBeenCalledWith('values');
  });
});
