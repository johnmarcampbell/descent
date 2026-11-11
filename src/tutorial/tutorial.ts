// Headless tutorial runner: loads a level's Snapshot into the session, moves its
// guiding steps with the session (forward as they are done, back if undone), and
// declares the win once accuracy holds at the goal. Steps guide, the goal gates:
// a win needs no particular step.

import type { Session, Snapshot } from '../session';
import type { History } from '../history';
import type { Level, Prompt } from './levels';

const KEY = 'descent.tutorial'; // JSON array of cleared level ids
const HOLD = 0.4;  // seconds at the goal before the win, so a drag can't flicker it
const STALL = 15;  // seconds without a step change before the hint shows

/**
 * What changed: 'level' on every start (restart included) and exit, 'step' when the
 * current step moves either way, 'win' once the goal held, 'hint' when it shows.
 */
export type TutorialChange = 'level' | 'step' | 'win' | 'hint';

/** The 0-based level a `?level=N` (1-based) query asks for, or null. */
export function levelFromQuery(search: string, count: number): number | null {
  const i = Number(new URLSearchParams(search).get('level')) - 1;
  return Number.isInteger(i) && i >= 0 && i < count ? i : null;
}

export class Tutorial {
  private _index: number | null = null;
  private _stepIndex = 0;
  private _won = false;
  private starts: Snapshot[] = []; // the state each step began in
  private sandbox: Snapshot | null = null; // free-play state to return to on exit
  private stall = 0;
  private held = 0;
  private readonly cleared = new Set(load());
  private readonly listeners: ((change: TutorialChange) => void)[] = [];

  constructor(
    readonly session: Session,
    private readonly history: History,
    readonly levels: readonly Level[],
  ) {
    session.subscribe(() => this.follow());
  }

  /** Current level, null = not in the tutorial. */
  get index(): number | null {
    return this._index;
  }

  get level(): Level | null {
    return this._index === null ? null : this.levels[this._index];
  }

  /** The current step's prompt; the level's `last` once every step is done. */
  get step(): Prompt | null {
    const level = this.level;
    return level && (level.steps[this._stepIndex] ?? level.last);
  }

  get stepIndex(): number {
    return this._stepIndex;
  }

  get hinting(): boolean {
    return !this._won && this.stall >= STALL && this.step?.hint !== undefined;
  }

  get won(): boolean {
    return this._won;
  }

  completed(i: number): boolean {
    return this.cleared.has(this.levels[i].id);
  }

  start(i: number): void {
    const level = this.levels[i];
    this.sandbox ??= this.session.snapshot();
    this._index = i;
    this._stepIndex = 0;
    this._won = false;
    this.stall = this.held = 0;
    this.starts = [level.start];
    this.session.restore(level.start);
    this.history.reset();
    this.notify('level');
  }

  restart(): void {
    if (this._index !== null) this.start(this._index);
  }

  /** The next level, or back to free play after the last. */
  next(): void {
    if (this._index === null) return;
    if (this._index + 1 < this.levels.length) this.start(this._index + 1);
    else this.exit();
  }

  exit(): void {
    const sandbox = this.sandbox;
    if (!sandbox) return;
    this._index = null;
    this.sandbox = null;
    this.session.restore(sandbox);
    this.history.reset();
    this.notify('level');
  }

  /** Seconds of play: drives the stall clock and the win hold. */
  tick(dt: number): void {
    const level = this.level;
    if (!level || this._won) return;
    const hinting = this.hinting;
    this.stall += dt;
    this.held = this.session.res.accuracy >= level.goal ? this.held + dt : 0;
    if (this.held >= HOLD) this.win(level);
    else if (this.hinting !== hinting) this.notify('hint');
  }

  subscribe(fn: (change: TutorialChange) => void): () => void {
    this.listeners.push(fn);
    return () => {
      const i = this.listeners.indexOf(fn);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  /** Step back past any earlier step that is no longer done, then forward past done ones. */
  private follow(): void {
    const level = this.level;
    if (!level || this._won) return;
    const { steps } = level;
    const s = this.session;
    let i = this._stepIndex;
    while (i > 0 && !steps[i - 1].done(s, this.starts[i - 1])) i--;
    while (i < steps.length && steps[i].done(s, this.starts[i])) this.starts[++i] = s.snapshot();
    if (i === this._stepIndex) return;
    this._stepIndex = i;
    this.stall = this.held = 0; // the hint clock and the win hold both restart on the new step
    this.notify('step');
  }

  private win(level: Level): void {
    this._won = true;
    this.cleared.add(level.id);
    try {
      localStorage.setItem(KEY, JSON.stringify([...this.cleared]));
    } catch {
      /* private mode — progress just isn't remembered */
    }
    this.notify('win');
  }

  private notify(change: TutorialChange): void {
    for (const fn of [...this.listeners]) fn(change);
  }
}

function load(): string[] {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [];
  } catch {
    return []; // storage blocked, or a corrupt entry: start fresh
  }
}
