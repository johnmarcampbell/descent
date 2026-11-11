import './coach.css';
import type { LayerIndex, Session } from '../session';
import type { History } from '../history';
import type { Stage } from '../viz/stage';
import { LEVELS, type Target } from './levels';
import { Tutorial, levelFromQuery, type TutorialChange } from './tutorial';

// The coach: one DOM adapter for the tutorial in every shell. It mounts a strip that
// shows the level, its current instruction and live accuracy, rings the step's target,
// hides the level's controls via data-hide on the shell root, and drives the tutorial
// clock while a level runs. Each shell places the strip in its own stylesheet.

export interface TutorialHost {
  root: HTMLElement; // shell root; gets data-hide and data-tutorial
  slot: HTMLElement; // where the coach strip mounts
  stage: Stage;
  /** Bring a layer's space on screen; with `idx`, that unit's arrow (and select it, if the
   * shell selects). Without, the shell drops any selection. */
  reveal(layer: LayerIndex, idx?: number): void;
}

/** A composition root's tutorial: built, coached, and booted into `?level=N` (1-based). */
export function bootTutorial(session: Session, history: History, host: TutorialHost): Tutorial {
  const tutorial = new Tutorial(session, history, LEVELS);
  mountCoach(tutorial, host);
  const level = levelFromQuery(location.search, LEVELS.length);
  if (level !== null) tutorial.start(level);
  return tutorial;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');
const pct = (a: number, digits = 1): string => `${(a * 100).toFixed(digits)}%`;
/** Accuracy → bar fraction: chance (50%) is empty, perfect is full. */
const fill = (a: number): string => `${Math.max(0, Math.min(1, (a - 0.5) / 0.5)) * 100}%`;
const reducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;
const PLANES = ['unit', 'out'] as const;

function mountCoach(t: Tutorial, host: TutorialHost): void {
  const { root, stage } = host;
  const el = document.createElement('div');
  el.className = 'coach';
  el.hidden = true;
  el.innerHTML = `
    <div class="coach-top">
      <span class="coach-kicker"></span>
      <span class="coach-pips">${t.levels.map(() => '<i></i>').join('')}</span>
      <span class="coach-acts">
        <button type="button" data-act="restart">restart</button>
        <button type="button" class="coach-skip" data-act="next">skip ›</button>
        <button type="button" class="coach-exit" data-act="exit" title="back to free play"
          aria-label="back to free play">×</button>
      </span>
    </div>
    <div class="coach-line">
      <p class="coach-say" aria-live="polite"></p>
      <button type="button" class="coach-next" data-act="next"></button>
    </div>
    <div class="coach-hint"><p></p></div>
    <div class="coach-meter">
      <div class="coach-bar"><b></b><s></s></div>
      <span class="coach-acc"><b></b> / <span></span></span>
    </div>`;
  host.slot.appendChild(el);

  const $ = <E extends Element = HTMLElement>(sel: string): E => el.querySelector<E>(sel)!;
  const kicker = $('.coach-kicker');
  const pips = [...el.querySelectorAll('.coach-pips i')];
  const say = $('.coach-say');
  const next = $<HTMLButtonElement>('.coach-next');
  const hint = $('.coach-hint p');
  const bar = $('.coach-bar b');
  const goalTick = $('.coach-bar s');
  const acc = $('.coach-acc b');
  const goal = $('.coach-acc span');
  const ring = spotlight();

  const acts: Record<string, () => void> = {
    restart: () => t.restart(),
    next: () => t.next(),
    exit: () => t.exit(),
  };
  el.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act) acts[act]();
  });

  // --- one frame loop while a level runs: the tutorial clock and the ring ---
  let raf = 0;
  let last = 0;
  const frame = (now: number): void => {
    if (!t.level) {
      raf = 0;
      ring(null);
      return;
    }
    t.tick(Math.min((now - last) / 1000, 0.1)); // a backgrounded tab resumes with one short step
    last = now;
    const target = t.won ? undefined : t.step?.target;
    ring(target ? anchorOf(target, host) : null);
    raf = requestAnimationFrame(frame);
  };

  // The player's plane toggles, while a level forces both on.
  let planesBefore: Record<'unit' | 'out', boolean> | null = null;

  /** Entering, restarting, switching or leaving a level. */
  const onLevel = (): void => {
    const level = t.level;
    el.hidden = !level;
    host.reveal(0); // every level starts from the input space, and free play returns there
    if (!level) {
      for (const kind of PLANES) if (planesBefore) stage.setPlaneEnabled(kind, planesBefore[kind]);
      planesBefore = null;
      delete root.dataset.hide;
      delete root.dataset.tutorial;
      return;
    }
    planesBefore ??= { unit: stage.planeEnabled('unit'), out: stage.planeEnabled('out') };
    for (const kind of PLANES) stage.setPlaneEnabled(kind, true);
    root.dataset.hide = level.hide.join(' ');
    root.dataset.tutorial = level.id;
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };

  const revealTarget = (): void => {
    const target = t.step?.target;
    if (!target) return;
    if ('ctl' in target) host.reveal(target.layer);
    else host.reveal(...target.unit);
  };

  /** Text, classes and the meter: cheap, so it runs on every tutorial or session change. */
  const paint = (): void => {
    const level = t.level;
    const i = t.index;
    const step = t.step;
    if (!level || i === null || !step) return;
    const a = t.session.res.accuracy;
    el.classList.toggle('won', t.won);
    el.classList.toggle('hinting', t.hinting);
    el.classList.toggle('met', a >= level.goal);
    pips.forEach((p, j) => {
      p.classList.toggle('done', t.completed(j));
      p.classList.toggle('now', j === i);
    });
    kicker.textContent = t.won
      ? `◈ ${pad2(i + 1)} CLEAR · ${pct(a)}`
      : `${pad2(i + 1)}/${pad2(t.levels.length)} · ${level.title}`;
    next.textContent = i === t.levels.length - 1 ? 'free play ›' : 'next ›';
    if (t.hinting) hint.textContent = step.hint ?? '';
    bar.style.width = fill(a);
    goalTick.style.left = fill(level.goal);
    acc.textContent = pct(a);
    goal.textContent = pct(level.goal, 0);

    const line = t.won ? level.aha : step.say;
    if (say.textContent === line) return;
    say.textContent = line;
    if (!t.won && !reducedMotion()) { // the win has its own entrance in coach.css
      say.animate([{ opacity: 0, transform: 'translateY(3px)' }, { opacity: 1 }], {
        duration: 260, easing: 'ease-out',
      });
    }
  };

  t.subscribe((change: TutorialChange) => {
    if (change === 'level') onLevel();
    if (change === 'level' || change === 'step') revealTarget();
    paint();
    if (change === 'win') next.focus({ preventScroll: true }); // Enter takes next ›
  });
  t.session.subscribe(paint);
}

// --- spotlight: two gold rings on a pill-shaped anchor ---

/** A pill-shaped target (a circle when w = h): its centre in client coordinates and size. */
interface Anchor {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The ring element, and a function that places it on an anchor or hides it on null. */
function spotlight(): (a: Anchor | null) => void {
  const el = document.createElement('div');
  el.className = 'spot';
  el.innerHTML = '<i></i><i></i>';
  el.hidden = true;
  document.body.appendChild(el);
  return (a) => {
    el.hidden = !a;
    if (!a) return;
    el.style.transform = `translate(${a.x - a.w / 2}px, ${a.y - a.h / 2}px)`;
    el.style.width = `${a.w}px`;
    el.style.height = `${a.h}px`;
  };
}

/**
 * Whether a point of `owner` is what the player sees there: not covered by the coach, a
 * panel, an open sheet, or scrolled or projected out of view. The ring itself takes no
 * pointer events, so it never hides its own target.
 */
const shows = (owner: Element, x: number, y: number): boolean =>
  owner.contains(document.elementFromPoint(x, y));

function anchorOf(target: Target, host: TutorialHost): Anchor | null {
  if ('ctl' in target) {
    return controlAnchor(host.root, `[data-ctl="add"][data-layer="${target.layer}"]`);
  }
  const [layer, idx] = target.unit;
  if (target.part === 'bias') {
    return controlAnchor(host.root, `[data-ctl="bias"][data-layer="${layer}"][data-idx="${idx}"]`);
  }
  const tip = host.stage.tipClient(layer, idx);
  return tip && shows(tip.cell, tip.x, tip.y) ? { x: tip.x, y: tip.y, w: 26, h: 26 } : null;
}

/** The first match the player can see, ringed whole. */
function controlAnchor(root: HTMLElement, selector: string): Anchor | null {
  for (const el of root.querySelectorAll(selector)) {
    const r = el.getBoundingClientRect();
    const [x, y] = [r.left + r.width / 2, r.top + r.height / 2];
    if (shows(el, x, y)) return { x, y, w: r.width + 8, h: r.height + 8 };
  }
  return null;
}
