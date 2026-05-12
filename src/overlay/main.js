import { mount } from 'svelte';
import App from './App.svelte';

(function () {
  'use strict';

  // Prevent double-initialization
  if (window.__polishOverlayInitialized) return;
  window.__polishOverlayInitialized = true;

  // Detect Polish server origin from the script's own URL.
  // When injected cross-origin (e.g., script on :3456, page on :5173),
  // the overlay needs to connect WebSocket to Polish's port, not the page's.
  try {
    const src = document.currentScript && document.currentScript.src;
    if (src) window.__polishOrigin = new URL(src).origin;
  } catch { /* same-origin fallback */ }

  const host = document.createElement('div');
  host.setAttribute('data-polish-root', '');
  host.style.cssText = 'all:initial; position:fixed; top:0; left:0; width:100vw; height:100vh; z-index:2147483647; pointer-events:none;';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'closed' });

  try {
    const app = mount(App, { target: shadow });
    app.init();
  } catch (err) {
    console.error('[Polish] Mount/init failed:', err);
  }
})();
