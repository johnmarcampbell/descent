// Which interface to serve — desktop or the mobile Deck — resolved once and
// shared by the entry dispatcher and both shells. One URL serves both device
// classes: detection is a coarse pointer on a narrow screen, and a persisted
// manual override (also settable with ?ui=) is the escape hatch when the guess
// is wrong. No imports — a pure leaf both composition roots can lean on.

export type UiMode = 'desktop' | 'mobile';

const KEY = 'descent.ui';

function stored(): UiMode | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'desktop' || v === 'mobile' ? v : null;
  } catch {
    return null;
  }
}

function remember(mode: UiMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* private mode — this visit only */
  }
}

/** Auto-detect from the device: a coarse pointer on a narrow screen is mobile. */
export function detect(): UiMode {
  return matchMedia('(pointer: coarse) and (max-width: 900px)').matches
    ? 'mobile'
    : 'desktop';
}

/**
 * The mode to boot. A `?ui=` param wins and is remembered (so a shared link
 * sticks); then a prior override; then auto-detection.
 */
export function resolveMode(): UiMode {
  const param = new URLSearchParams(location.search).get('ui');
  if (param === 'desktop' || param === 'mobile') {
    remember(param);
    return param;
  }
  return stored() ?? detect();
}

/** Record an override and reload into it — the in-app "switch view" control. */
export function setMode(mode: UiMode): void {
  remember(mode);
  // Reload without query params so the stored choice is the only signal.
  location.assign(location.pathname);
}
