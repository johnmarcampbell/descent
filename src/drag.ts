import * as THREE from 'three';
import type { Session } from './session';
import type { StageEntry } from './viz/stage';
import { W_SCALE } from './viz/arrow';

// Weight-drag interaction, independent of input modality. The controller
// speaks views and client coordinates — pick/begin/move/end — and owns the
// geometry: point → ray → camera-facing plane → weight candidate for the
// session (which applies the model constraints). Pointer events, touch
// gestures, cursors, and auto-rotate stay in the adapter that calls it.

/**
 * What the controller needs from the thing being dragged on. Stage satisfies
 * it; tests satisfy it with a plain object and no WebGL.
 */
export interface DragSurface {
  readonly entries: readonly StageEntry[];
  /** Screen rect of a view's cell, for client-coordinate → NDC conversion. */
  cellRect(view: number): { left: number; top: number; width: number; height: number };
  camera(view: number): THREE.Camera;
  /** Turn a view's camera controls off for the duration of a drag. */
  setViewInteraction(view: number, on: boolean): void;
}

export class DragController {
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly dragPlane = new THREE.Plane();
  private readonly camDir = new THREE.Vector3();
  private readonly hitPoint = new THREE.Vector3();
  private readonly tipWorld = new THREE.Vector3();
  private _active: StageEntry | null = null;

  constructor(
    private readonly session: Session,
    private readonly surface: DragSurface,
  ) {}

  get active(): StageEntry | null {
    return this._active;
  }

  /** The gizmo tip under (clientX, clientY) in a view, or null. */
  pick(view: number, clientX: number, clientY: number): StageEntry | null {
    this.setNdc(view, clientX, clientY);
    this.raycaster.setFromCamera(this.ndc, this.surface.camera(view));
    const hits = this.surface.entries
      .filter((en) => en.view === view)
      .map((en) => {
        en.gizmo.hit.updateWorldMatrix(true, false);
        return en.gizmo.hit;
      });
    const found = this.raycaster.intersectObjects(hits, false);
    return found.length > 0 ? (found[0].object.userData.entry as StageEntry) : null;
  }

  /**
   * Start a drag if a gizmo tip is under the point. On a grab the drag plane
   * is set facing the camera through the tip, the view's controls are
   * disabled, and the gizmo highlights.
   */
  begin(view: number, clientX: number, clientY: number): StageEntry | null {
    const entry = this.pick(view, clientX, clientY);
    if (!entry) return null;

    this._active = entry;
    this.surface.setViewInteraction(view, false);
    this.surface.camera(view).getWorldDirection(this.camDir);
    entry.gizmo.hit.getWorldPosition(this.tipWorld);
    this.dragPlane.setFromNormalAndCoplanarPoint(this.camDir, this.tipWorld);
    entry.gizmo.setHighlight(true);
    return entry;
  }

  /** Track the drag: tip position → raw weight candidate for the session. */
  move(clientX: number, clientY: number): void {
    const entry = this._active;
    if (!entry) return;
    this.setNdc(entry.view, clientX, clientY);
    this.raycaster.setFromCamera(this.ndc, this.surface.camera(entry.view));
    if (!this.raycaster.ray.intersectPlane(this.dragPlane, this.hitPoint)) return;

    this.session.setWeight(entry.layer, entry.idx, [
      this.hitPoint.x / W_SCALE,
      this.hitPoint.y / W_SCALE,
      this.hitPoint.z / W_SCALE,
    ]);
  }

  end(): void {
    const entry = this._active;
    if (!entry) return;
    entry.gizmo.setHighlight(false);
    this.surface.setViewInteraction(entry.view, true);
    this._active = null;
  }

  private setNdc(view: number, clientX: number, clientY: number): void {
    const rect = this.surface.cellRect(view);
    this.ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
  }
}
