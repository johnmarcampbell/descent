import './mobile.css';
import { Session } from '../session';
import { DragController } from '../drag';
import { History } from '../history';
import { bootDeck } from './deck';
import { bootBoard } from './board';
import { wireTouchDrag } from './touch';
import { createIntro } from '../intro';
import type { ProtoName } from './controls';

// Mobile composition root. The Deck is the shipping mobile interface; the
// Board survives behind ?proto=board for side-by-side comparison during dev.
// Reached only via the entry dispatcher (src/entry.ts), which serves this to
// touch devices at the single app URL.

const app = document.getElementById('m-app')!;
const canvas = document.getElementById('gl') as HTMLCanvasElement;

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

  // How-to-play splash (first visit + a ? in the top-right cluster).
  const intro = createIntro('mobile');
  const right = app.querySelector('.deck-right');
  if (right) right.insertBefore(intro.button, right.firstChild);
  else app.appendChild(intro.button);

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

boot(new URLSearchParams(window.location.search).get('proto') === 'board' ? 'board' : 'deck');
