// index.html loads this before anything else. It detects the device and
// imports only the matching bundle, so desktop and mobile live at one URL.
// The desktop DOM ships inside index.html; on mobile we tear it down and stand
// up the mobile shell, then hand off to the mobile composition root.

// A coarse pointer on a narrow screen is a phone (or small tablet) → the Deck.
const isMobile = matchMedia('(pointer: coarse) and (max-width: 900px)').matches;
document.documentElement.dataset.ui = isMobile ? 'mobile' : 'desktop';

if (isMobile) {
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
