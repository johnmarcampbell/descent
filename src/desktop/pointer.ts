import type { DragController } from '../drag';
import type { Stage } from '../viz/stage';

// Desktop adapter for the DragController: mouse/trackpad pointer events,
// hover cursors, and the first-interaction auto-rotate stop. A mobile
// build wires touch gestures to the same controller instead.

export interface PointerDragOpts {
  /** Called when a grab succeeds, before any weight changes (undo marks). */
  onGrab?: () => void;
}

export function wirePointerDrag(
  dragger: DragController,
  stage: Stage,
  viewsEl: HTMLElement,
  opts: PointerDragOpts = {},
): void {
  const viewIndexOf = (e: Event): number => {
    const cell = (e.target as HTMLElement).closest?.('.view') as HTMLElement | null;
    return cell ? Number(cell.dataset.view) : -1;
  };

  // Capture phase on the container so a gizmo grab can stop the event
  // before the cell's OrbitControls sees it.
  viewsEl.addEventListener(
    'pointerdown',
    (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      stage.vp.views.forEach((v) => { v.controls.autoRotate = false; });
      const view = viewIndexOf(e);
      if (view < 0) return;
      if (!dragger.begin(view, e.clientX, e.clientY)) return;

      opts.onGrab?.();
      e.stopPropagation();
      document.body.style.cursor = 'grabbing';
    },
    true,
  );

  window.addEventListener('pointermove', (e: PointerEvent) => {
    if (dragger.active) {
      dragger.move(e.clientX, e.clientY);
      return;
    }

    // Hover affordance.
    if ((e.target as HTMLElement).closest?.('button')) return;
    const view = viewIndexOf(e);
    if (view >= 0) {
      stage.cells[view].style.cursor = dragger.pick(view, e.clientX, e.clientY) ? 'grab' : '';
    }
  });

  window.addEventListener('pointerup', () => {
    if (!dragger.active) return;
    dragger.end();
    document.body.style.cursor = '';
  });
}
