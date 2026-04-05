import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './i18n'; // i18n initialization (Epic 22) — must be before App
import App from './App';
import './index.css';

// Auto-update PWA: reload page when a new service worker is available
registerSW({
  onNeedRefresh() {
    window.location.reload();
  },
});

// Auto-reload once on stale chunk errors (e.g. after server rebuild).
// Uses sessionStorage guard to prevent infinite reload loops.
const CHUNK_RELOAD_KEY = 'chunk-reload-attempted';

function tryChunkReload() {
  if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
    window.location.reload();
  }
}

function isChunkError(msg: string) {
  return msg.includes('Failed to fetch dynamically imported module')
    || msg.includes('Importing a module script failed')
    || msg.includes('error loading dynamically imported module');
}

// Handle Vite preload errors (CSS/JS chunk preload failures)
window.addEventListener('vite:preloadError', () => {
  tryChunkReload();
});

// Handle unhandled promise rejections from dynamic imports
window.addEventListener('unhandledrejection', (event) => {
  const msg = event.reason?.message || '';
  if (isChunkError(msg)) {
    tryChunkReload();
  }
});

// Clear the guard on successful load
sessionStorage.removeItem(CHUNK_RELOAD_KEY);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
