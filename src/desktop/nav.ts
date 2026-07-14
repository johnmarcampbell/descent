import type { LayerWindow, ViewRole } from '../layerwindow';

// Desktop adapter for the LayerWindow machine: maps view roles onto the
// grid's CSS classes and the focus-button glyphs, and wires the nav
// buttons and arrow keys to transitions.

const FOCUS_BTN: Partial<Record<ViewRole, [string, string]>> = {
  focused: ['⊟', 'back to split view'],
  minimap: ['⤢', 'swap focus'],
};
const FOCUS_BTN_DEFAULT: [string, string] = ['⛶', 'focus this layer'];

export function wireLayerNav(
  layers: LayerWindow,
  viewsEl: HTMLElement,
  viewEls: HTMLElement[],
  navAsc: HTMLButtonElement,
  navDesc: HTMLButtonElement,
): void {
  function applyLayout(): void {
    viewsEl.classList.toggle('focus', layers.focused);
    viewEls.forEach((el, i) => {
      const role = layers.roleOf(i);
      el.classList.toggle('offstage', role === 'offstage');
      el.classList.toggle('minimap', role === 'minimap');
      if (role === 'second') el.dataset.pos = 'second';
      else delete el.dataset.pos;

      const btn = el.querySelector<HTMLButtonElement>('.focus-btn')!;
      const [glyph, title] = FOCUS_BTN[role] ?? FOCUS_BTN_DEFAULT;
      btn.textContent = glyph;
      btn.title = title;
    });
    navAsc.hidden = !layers.canAscend;
    navDesc.hidden = !layers.canDescend;
  }

  layers.subscribe(applyLayout);
  applyLayout();

  navAsc.addEventListener('click', () => layers.ascend());
  navDesc.addEventListener('click', () => layers.descend());

  viewEls.forEach((el, i) => {
    const btn = el.querySelector<HTMLButtonElement>('.focus-btn')!;
    // Keep the press from reaching OrbitControls on the cell.
    btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    btn.addEventListener('click', () => layers.toggleFocus(i));
  });

  window.addEventListener('keydown', (e) => {
    const tag = (document.activeElement as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT') return; // sliders use arrow keys
    if (e.key === 'ArrowLeft') layers.ascend();
    else if (e.key === 'ArrowRight') layers.descend();
  });
}
