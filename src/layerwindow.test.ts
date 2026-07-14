import { describe, it, expect, vi } from 'vitest';
import { LayerWindow } from './layerwindow';

describe('LayerWindow', () => {
  it('starts split at the top', () => {
    const lw = new LayerWindow();
    expect(lw.roles()).toEqual(['split', 'second', 'offstage']);
    expect(lw.canAscend).toBe(false);
    expect(lw.canDescend).toBe(true);
  });

  it('descend shifts the window; clamped at the bottom', () => {
    const lw = new LayerWindow();
    lw.descend();
    expect(lw.roles()).toEqual(['offstage', 'split', 'second']);
    expect(lw.canDescend).toBe(false);
    lw.descend(); // no-op at max depth
    expect(lw.depth).toBe(1);
  });

  it('ascend clamps at the top', () => {
    const lw = new LayerWindow();
    lw.ascend();
    expect(lw.depth).toBe(0);
  });

  it('focus / unfocus a view', () => {
    const lw = new LayerWindow();
    lw.toggleFocus(0);
    expect(lw.roles()).toEqual(['focused', 'minimap', 'offstage']);
    lw.toggleFocus(0);
    expect(lw.roles()).toEqual(['split', 'second', 'offstage']);
  });

  it('toggling the minimap swaps focus onto it', () => {
    const lw = new LayerWindow();
    lw.toggleFocus(0);
    lw.toggleFocus(1); // view 1 is the minimap
    expect(lw.roles()).toEqual(['minimap', 'focused', 'offstage']);
  });

  it('focus position persists across depth changes', () => {
    const lw = new LayerWindow();
    lw.toggleFocus(0); // focus the first of the pair
    lw.descend();
    expect(lw.roles()).toEqual(['offstage', 'focused', 'minimap']);
  });

  it('toggleFocus on an offstage view is a no-op', () => {
    const lw = new LayerWindow();
    lw.toggleFocus(2);
    expect(lw.roles()).toEqual(['split', 'second', 'offstage']);
  });

  it('reveal shifts minimally and only when needed', () => {
    const lw = new LayerWindow();
    lw.reveal(1); // already on stage
    expect(lw.depth).toBe(0);
    lw.reveal(2); // below the window → descend to show it
    expect(lw.depth).toBe(1);
    lw.reveal(2); // now on stage
    expect(lw.depth).toBe(1);
    lw.reveal(0); // above the window → ascend to show it
    expect(lw.depth).toBe(0);
  });

  it('notifies on real changes, not on clamped no-ops', () => {
    const lw = new LayerWindow();
    const fn = vi.fn();
    lw.subscribe(fn);
    lw.ascend(); // clamped
    expect(fn).not.toHaveBeenCalled();
    lw.descend();
    lw.toggleFocus(1);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('unsubscribe stops notifications', () => {
    const lw = new LayerWindow();
    const fn = vi.fn();
    const off = lw.subscribe(fn);
    lw.descend();
    off();
    lw.ascend();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
