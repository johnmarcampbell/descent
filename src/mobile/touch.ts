import type { DragController } from '../drag';
import type { Session } from '../session';
import type { Stage, StageEntry } from '../viz/stage';

// Mobile adapter for the DragController: pointer events (which unify touch),
// no hover affordance, and gizmo hit spheres scaled up to finger size.

const TOUCH_HIT_SCALE = 2.4;

export interface TouchDragOpts {
  /** Called when a grab succeeds, before any weight changes (undo marks, selection). */
  onGrab?: (entry: StageEntry) => void;
  /** Called after the drag ends and the controller released the entry. */
  onRelease?: (entry: StageEntry) => void;
}

export function wireTouchDrag(
  dragger: DragController,
  stage: Stage,
  session: Session,
  container: HTMLElement,
  opts: TouchDragOpts = {},
): void {
  const growHits = (): void => {
    stage.entries.forEach((e) => e.gizmo.hit.scale.setScalar(TOUCH_HIT_SCALE));
  };
  growHits();
  session.subscribe((change) => {
    if (change === 'structure') growHits();
  });

  const viewIndexOf = (e: Event): number => {
    const cell = (e.target as HTMLElement).closest?.('.cell') as HTMLElement | null;
    return cell ? Number(cell.dataset.view) : -1;
  };

  // Capture phase so a gizmo grab stops the event before OrbitControls
  // (bound to the cell) sees it.
  container.addEventListener(
    'pointerdown',
    (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      stage.vp.views.forEach((v) => { v.controls.autoRotate = false; });
      const view = viewIndexOf(e);
      if (view < 0) return;
      const entry = dragger.begin(view, e.clientX, e.clientY);
      if (!entry) return;
      opts.onGrab?.(entry);
      e.stopPropagation();
      e.preventDefault();
    },
    true,
  );

  window.addEventListener(
    'pointermove',
    (e: PointerEvent) => {
      if (!dragger.active) return;
      e.preventDefault();
      dragger.move(e.clientX, e.clientY);
    },
    { passive: false },
  );

  const release = (): void => {
    const entry = dragger.active;
    if (!entry) return;
    dragger.end();
    opts.onRelease?.(entry);
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
}
