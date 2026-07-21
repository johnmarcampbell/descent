import { resolveMode } from './ui-mode';

// index.html loads this before anything else. It picks the interface for the
// device and imports only that bundle, so desktop and mobile live at one URL.
// The desktop DOM ships inside index.html; on mobile we tear it down and stand
// up the mobile shell, then hand off to the mobile composition root.

const mode = resolveMode();
document.documentElement.dataset.ui = mode;

if (mode === 'mobile') {
  // The touch UI wants a locked viewport (no page zoom, safe-area insets).
  document
    .querySelector('meta[name="viewport"]')
    ?.setAttribute(
      'content',
      'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover',
    );
  document.getElementById('app')?.remove();
  const host = document.createElement('div');
  host.id = 'm-app';
  document.body.appendChild(host);
  void import('./mobile/main');
} else {
  void import('./main');
}
