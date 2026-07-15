import './mobile.css';
import { Session } from '../session';
import { DragController } from '../drag';
import { History } from '../history';
import { bootDeck } from './deck';
import { bootBoard } from './board';
import { wireTouchDrag } from './touch';
import type { ProtoName } from './controls';

// Mobile composition root. Two prototypes share the session, stage, and
// drag controller; ?proto=deck|board picks which layout boots. No param →
// a chooser. The desktop app is untouched at index.html.

const app = document.getElementById('m-app')!;
const canvas = document.getElementById('gl') as HTMLCanvasElement;

function chooser(): void {
  app.innerHTML = `
    <div id="chooser">
      <h1>DESCENT</h1>
      <p class="sub">MOBILE PROTOTYPES — PICK ONE</p>
      <button class="proto-card" data-proto="deck">
        <span class="k">PROTOTYPE A</span>
        <h2>Deck</h2>
        <p>Immersive. One layer fills the screen, the next layer runs live in a
        minimap. Page with ‹ ›, tap the inset to jump, pull up the sheet for
        controls.</p>
      </button>
      <button class="proto-card" data-proto="board">
        <span class="k">PROTOTYPE B</span>
        <h2>Board</h2>
        <p>Cockpit. Two consecutive layers stacked — edit the top, watch the
        bottom react. Tabs slide the window; every control stays on screen.</p>
      </button>
      <a class="desk-link" href="./index.html">desktop version →</a>
    </div>
  `;
  app.querySelectorAll<HTMLButtonElement>('.proto-card').forEach((card) => {
    card.addEventListener('click', () => {
      window.location.search = `?proto=${card.dataset.proto}`;
    });
  });
}

function boot(proto: ProtoName): void {
  const session = new Session('rings');
  const history = new History(session);
  const ui = proto === 'deck'
    ? bootDeck(app, canvas, session, history)
    : bootBoard(app, canvas, session, history);
  const stage = ui.stage;

  const dragger = new DragController(session, stage);
  wireTouchDrag(dragger, stage, session, app, {
    onGrab: (entry) => {
      history.mark();
      ui.onGrab?.(entry);
    },
    onRelease: (entry) => ui.onRelease?.(entry),
  });

  stage.start();

  Object.defineProperty(window, '__descent', {
    value: {
      proto,
      session,
      stage,
      dragger,
      history,
      net: session.net,
      vp: stage.vp,
      getEntries: () => stage.entries,
      getResult: () => session.res,
    },
  });
}

const proto = new URLSearchParams(window.location.search).get('proto');
if (proto === 'deck' || proto === 'board') boot(proto);
else chooser();
