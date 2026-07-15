import type { Session, Snapshot } from './session';

// Gesture-granularity undo/redo over session snapshots. Adapters call
// mark() when a gesture *starts* (a gizmo grab, a slider touch, a
// structure button press); however many mutations the gesture then makes,
// one undo returns to the state before it. A full snapshot is ~250 bytes,
// so a deep history costs nothing.

export type HistoryListener = () => void;

function same(a: Snapshot, b: Snapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export class History {
  private readonly undoStack: Snapshot[] = [];
  private readonly redoStack: Snapshot[] = [];
  private readonly listeners: HistoryListener[] = [];

  constructor(
    private readonly session: Session,
    private readonly limit = 200,
  ) {}

  get canUndo(): boolean {
    const now = this.session.snapshot();
    return this.undoStack.some((s) => !same(s, now));
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  subscribe(fn: HistoryListener): () => void {
    this.listeners.push(fn);
    return () => {
      const i = this.listeners.indexOf(fn);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  /**
   * Record the state a gesture starts from. Safe to over-call: a mark
   * identical to the previous one is dropped, so "mark on every slider
   * touch" costs nothing when the slider isn't moved.
   */
  mark(): void {
    const snap = this.session.snapshot();
    const top = this.undoStack[this.undoStack.length - 1];
    if (top && same(top, snap)) return;
    this.undoStack.push(snap);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
    this.notify();
  }

  undo(): void {
    const now = this.session.snapshot();
    // Skip marks whose gesture ended up changing nothing (grab-no-move).
    let snap = this.undoStack.pop();
    while (snap && same(snap, now)) snap = this.undoStack.pop();
    if (!snap) {
      this.notify();
      return;
    }
    this.redoStack.push(now);
    this.session.restore(snap);
    this.notify();
  }

  redo(): void {
    const snap = this.redoStack.pop();
    if (!snap) return;
    this.undoStack.push(this.session.snapshot());
    this.session.restore(snap);
    this.notify();
  }

  private notify(): void {
    for (const fn of [...this.listeners]) fn();
  }
}
