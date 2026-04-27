import App from './App.svelte';

(function () {
  'use strict';

  // Prevent double-initialization
  if (window.__polishOverlayInitialized) return;
  window.__polishOverlayInitialized = true;

  console.log('[Polish] main.js executing');

  const host = document.createElement('div');
  host.setAttribute('data-polish-root', '');
  host.style.cssText = 'all:initial; position:fixed; top:0; left:0; width:100vw; height:100vh; z-index:2147483647; pointer-events:none;';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'closed' });

  console.log('[Polish] Shadow root created, mounting Svelte app');
  try {
    const app = new App({ target: shadow });
    console.log('[Polish] Svelte app mounted, calling init()');
    app.init();
    console.log('[Polish] init() complete');
  } catch (err) {
    console.error('[Polish] Mount/init failed:', err);
  }
})();
