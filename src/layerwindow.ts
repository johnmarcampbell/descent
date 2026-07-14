// Layer navigation as a pure state machine: a window of consecutive views is
// on stage, and one of them can take focus (the other becomes a minimap).
// No DOM — an adapter maps roles to whatever layout a frontend uses
// (desktop grid cells, a mobile pager, …).

/** What a view should be shown as right now. */
export type ViewRole =
  | 'offstage'  // not in the window
  | 'split'     // in the window, side-by-side view
  | 'second'    // split, and the downstream half of the pair
  | 'focused'   // fills the stage
  | 'minimap';  // inset preview next to the focused view

export type LayerWindowListener = () => void;

export class LayerWindow {
  private _depth = 0;
  private _focusPos: 0 | 1 | null = null; // offset of the focused view in the window
  private readonly listeners: LayerWindowListener[] = [];

  constructor(
    readonly viewCount = 3,
    readonly windowSize = 2,
  ) {}

  get depth(): number {
    return this._depth;
  }

  get maxDepth(): number {
    return this.viewCount - this.windowSize;
  }

  get focusPos(): 0 | 1 | null {
    return this._focusPos;
  }

  get focused(): boolean {
    return this._focusPos !== null;
  }

  get canAscend(): boolean {
    return this._depth > 0;
  }

  get canDescend(): boolean {
    return this._depth < this.maxDepth;
  }

  roleOf(view: number): ViewRole {
    const pos = view - this._depth;
    if (pos < 0 || pos >= this.windowSize) return 'offstage';
    if (this._focusPos === null) {
      return pos === this.windowSize - 1 ? 'second' : 'split';
    }
    return pos === this._focusPos ? 'focused' : 'minimap';
  }

  roles(): ViewRole[] {
    return Array.from({ length: this.viewCount }, (_, i) => this.roleOf(i));
  }

  subscribe(fn: LayerWindowListener): () => void {
    this.listeners.push(fn);
    return () => {
      const i = this.listeners.indexOf(fn);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  setDepth(d: number): void {
    const next = Math.max(0, Math.min(this.maxDepth, d));
    if (next === this._depth) return;
    this._depth = next;
    this.notify();
  }

  ascend(): void {
    this.setDepth(this._depth - 1);
  }

  descend(): void {
    this.setDepth(this._depth + 1);
  }

  /**
   * A view's focus control: focus it, unfocus if it already has focus, or —
   * when it's the minimap — swap focus over to it.
   */
  toggleFocus(view: number): void {
    const pos = view - this._depth;
    if (pos < 0 || pos >= this.windowSize) return;
    this._focusPos = this._focusPos === pos ? null : (pos as 0 | 1);
    this.notify();
  }

  /** Shift the window the minimal amount to bring a view on stage. */
  reveal(view: number): void {
    if (view < this._depth) this.setDepth(view);
    else if (view > this._depth + this.windowSize - 1) {
      this.setDepth(view - this.windowSize + 1);
    }
  }

  private notify(): void {
    for (const fn of [...this.listeners]) fn();
  }
}
