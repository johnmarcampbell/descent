import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Session } from '../session';
import type { Snapshot } from '../session';
import { History } from '../history';
import { LEVELS } from './levels';
import { Tutorial, levelFromQuery } from './tutorial';
import type { TutorialChange } from './tutorial';

function memoryStore(): Pick<Storage, 'getItem' | 'setItem'> {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

function setup() {
  const session = new Session();
  const history = new History(session);
  const tutorial = new Tutorial(session, history, LEVELS);
  const changes: TutorialChange[] = [];
  tutorial.subscribe((c) => changes.push(c));
  return { session, history, tutorial, changes };
}

const [AIM, BIAS, TWO_WALLS] = LEVELS;
const AIM_WON: Snapshot = { ...AIM.start, hidden: [[{ w: [1.321, 0, -0.903], b: 0 }], []] };

let store: Pick<Storage, 'getItem' | 'setItem'>;
beforeEach(() => {
  store = memoryStore();
  vi.stubGlobal('localStorage', store);
});
afterEach(() => vi.unstubAllGlobals());

describe('Tutorial', () => {
  it('start loads the level and forgets undo history', () => {
    const { session, history, tutorial, changes } = setup();
    history.mark();
    session.setBias(0, 0, 1);
    tutorial.start(0);
    expect(tutorial.index).toBe(0);
    expect(tutorial.level).toBe(AIM);
    expect(tutorial.step).toBe(AIM.steps[0]);
    expect(session.snapshot()).toEqual(AIM.start);
    expect(history.canUndo).toBe(false);
    expect(changes).toEqual(['level']);
  });

  it('exit restores the sandbox from before the first level, however many were played', () => {
    const { session, history, tutorial } = setup();
    session.setBias(0, 0, 1.25);
    const sandbox = session.snapshot();
    tutorial.start(0);
    tutorial.next();
    expect(tutorial.level).toBe(BIAS);
    history.mark();
    session.setBias(0, 0, -1);
    tutorial.exit();
    expect(tutorial.index).toBe(null);
    expect(tutorial.step).toBe(null);
    expect(session.snapshot()).toEqual(sandbox);
    expect(history.canUndo).toBe(false);
  });

  it('next after the last level returns to free play', () => {
    const { session, tutorial } = setup();
    const sandbox = session.snapshot();
    tutorial.start(LEVELS.length - 1);
    tutorial.next();
    expect(tutorial.index).toBe(null);
    expect(session.snapshot()).toEqual(sandbox);
  });

  it('restart mid-level resets the step, the win and the hint clock', () => {
    const { session, tutorial, changes } = setup();
    tutorial.start(0);
    session.restore(AIM_WON);
    tutorial.tick(14);
    expect(tutorial.won).toBe(true);
    changes.length = 0;
    tutorial.restart();
    expect(changes).toEqual(['level']);
    expect(tutorial.index).toBe(0);
    expect(tutorial.stepIndex).toBe(0);
    expect(tutorial.won).toBe(false);
    expect(session.snapshot()).toEqual(AIM.start);
    tutorial.tick(14);
    expect(tutorial.hinting).toBe(false);
  });

  it('restart, next and exit do nothing in free play', () => {
    const { session, tutorial, changes } = setup();
    const sandbox = session.snapshot();
    tutorial.restart();
    tutorial.next();
    tutorial.exit();
    expect(tutorial.index).toBe(null);
    expect(session.snapshot()).toEqual(sandbox);
    expect(changes).toEqual([]);
  });

  it('the hint shows after 15 s without progress, and clears on advance', () => {
    const { session, tutorial, changes } = setup();
    tutorial.start(0);
    tutorial.tick(14);
    expect(tutorial.hinting).toBe(false);
    tutorial.tick(1.5);
    expect(tutorial.hinting).toBe(true);
    expect(changes).toEqual(['level', 'hint']);
    session.setWeight(0, 0, [0.9, 0.9, 0]);
    expect(tutorial.stepIndex).toBe(1);
    expect(tutorial.step).toBe(AIM.last);
    expect(tutorial.hinting).toBe(false);
    expect(changes.at(-1)).toBe('step');
  });

  it('a step that is undone goes back, with a fresh hint clock', () => {
    const { session, tutorial } = setup();
    tutorial.start(0);
    session.setWeight(0, 0, [0.9, 0.9, 0]);
    tutorial.tick(16);
    expect(tutorial.hinting).toBe(true);
    session.restore(AIM.start);
    expect(tutorial.stepIndex).toBe(0);
    expect(tutorial.hinting).toBe(false);
  });

  it('two walls: add, then undo, returns to the add step', () => {
    const { session, history, tutorial } = setup();
    tutorial.start(LEVELS.indexOf(TWO_WALLS));
    history.mark();
    session.addUnit(0);
    expect(tutorial.stepIndex).toBe(1);
    history.undo();
    expect(session.net.hidden[0]).toHaveLength(1);
    expect(tutorial.stepIndex).toBe(0);
    expect(tutorial.step).toBe(TWO_WALLS.steps[0]);
  });

  it('a step change during the win hold restarts the hold', () => {
    const { session, tutorial } = setup();
    tutorial.start(0);
    session.restore(AIM_WON); // done with step 0 and at the goal in one move
    tutorial.tick(0.3);
    session.restore({ ...AIM_WON, hidden: [AIM.start.hidden[0], []] });
    session.restore(AIM_WON); // back to step 0, then forward again
    tutorial.tick(0.3);
    expect(tutorial.won).toBe(false);
    tutorial.tick(0.15);
    expect(tutorial.won).toBe(true);
  });

  it('a win needs the goal held for 0.4 s; a dip restarts the hold', () => {
    const { session, tutorial } = setup();
    tutorial.start(0);
    session.restore(AIM_WON);
    tutorial.tick(0.3);
    session.setBias(0, 0, 3); // below the goal, still on the last step
    tutorial.tick(0.2);
    session.setBias(0, 0, 0);
    tutorial.tick(0.3);
    expect(tutorial.won).toBe(false);
    tutorial.tick(0.15);
    expect(tutorial.won).toBe(true);
  });

  it('after a win the session stays playable and the tutorial stays put', () => {
    const { session, tutorial, changes } = setup();
    tutorial.start(0);
    session.restore(AIM_WON);
    tutorial.tick(1);
    expect(changes.at(-1)).toBe('win');
    const before = changes.length;
    session.restore(AIM.start);
    tutorial.tick(20);
    expect(tutorial.won).toBe(true);
    expect(tutorial.stepIndex).toBe(1);
    expect(tutorial.hinting).toBe(false);
    expect(changes.length).toBe(before);
  });

  it('cleared levels persist through localStorage', () => {
    const { session, tutorial } = setup();
    expect(tutorial.completed(0)).toBe(false);
    tutorial.start(0);
    session.restore(AIM_WON);
    tutorial.tick(1);
    expect(tutorial.completed(0)).toBe(true);
    expect(JSON.parse(store.getItem('descent.tutorial')!)).toEqual(['aim']);
    expect(setup().tutorial.completed(0)).toBe(true);
  });

  it('blocked storage (the property itself throws) or a corrupt entry starts fresh', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get(): Storage { throw new Error('denied'); },
    });
    const { session, tutorial } = setup();
    tutorial.start(0);
    session.restore(AIM_WON);
    expect(() => tutorial.tick(1)).not.toThrow();
    expect(tutorial.won).toBe(true);

    vi.stubGlobal('localStorage', { getItem: () => '{oops', setItem() {} });
    expect(setup().tutorial.completed(0)).toBe(false);
  });
});

describe('levelFromQuery', () => {
  it.each([
    ['?level=1', 0], ['?level=5', 4], ['?proto=deck&level=3', 2],
    ['', null], ['?level=0', null], ['?level=6', null], ['?level=1.5', null], ['?level=x', null],
  ])('%s → %s', (search, level) => {
    expect(levelFromQuery(search, 5)).toBe(level);
  });
});
