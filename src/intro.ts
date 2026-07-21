import './intro.css';

// How-to-play splash: a single-screen manifesto shown on first visit and
// reopenable from a ? trigger. Self-contained — it owns the overlay, the
// first-visit flag, and the trigger button; the composition root just places
// the button in its own chrome. The gesture legend is mode-aware.

type Mode = 'desktop' | 'mobile';
const SEEN = 'descent.introSeen';

const GESTURES: Record<Mode, { orbit: string; layers: string }> = {
  desktop: {
    orbit: 'drag empty space · scroll to zoom',
    layers: '‹ › or the DESCEND button',
  },
  mobile: {
    orbit: 'one finger orbits · pinch to zoom',
    layers: '‹ › to page · tap the minimap to jump',
  },
};

export interface Intro {
  /** Show the splash. */
  open(): void;
  /** The ? trigger button — the caller drops it into its own layout. */
  button: HTMLButtonElement;
}

export function createIntro(mode: Mode): Intro {
  const g = GESTURES[mode];

  const overlay = document.createElement('div');
  overlay.className = 'intro-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="intro-card" role="dialog" aria-modal="true" aria-label="how to play">
      <button class="intro-close" aria-label="close">×</button>
      <div class="intro-kicker">HOW TO PLAY</div>
      <h1 class="intro-title">DESCENT</h1>
      <p class="intro-lede">
        A neural network is just planes slicing space until each class lands on
        its own side — but here there's no training. You place the planes by
        hand. Every <b>arrow</b> is a weight vector: aim it and a boundary plane
        appears square to it; the <b>bias</b> slides that plane back and forth.
        <b>Add units</b> to fold the space, descend layer by layer, and bend the
        geometry until the two colours come apart.
      </p>
      <div class="intro-legend">
        <div class="k">arrow tip</div><div class="v">drag to aim &amp; scale a weight</div>
        <div class="k">bias slider</div><div class="v">slide the decision plane</div>
        <div class="k">+ add unit</div><div class="v">place a new neuron in a layer</div>
        <div class="k">orbit / zoom</div><div class="v">${g.orbit}</div>
        <div class="k">layers</div><div class="v">${g.layers}</div>
      </div>
      <div class="intro-goal">
        GOAL — push <b>accuracy</b> to 100%. That's the data separated by your own hand.
      </div>
      <button class="intro-start">${mode === 'mobile' ? 'tap to start' : 'click to start'}</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = (): void => {
    overlay.hidden = true;
    try {
      localStorage.setItem(SEEN, '1');
    } catch {
      /* private mode — shows again next visit, harmless */
    }
  };
  const open = (): void => {
    overlay.hidden = false;
  };

  // Backdrop, ×, and the start button close; clicks inside the card's text
  // don't, so a reader can select without dismissing.
  overlay.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t === overlay || t.closest('.intro-close, .intro-start')) close();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) close();
  });

  const button = document.createElement('button');
  button.type = 'button';
  button.className = `intro-help ${mode}`;
  button.setAttribute('aria-label', 'how to play');
  button.textContent = '?';
  button.addEventListener('click', open);

  let seen = false;
  try {
    seen = localStorage.getItem(SEEN) === '1';
  } catch {
    /* private mode — treat as first visit */
  }
  if (!seen) open();

  return { open, button };
}
