import React from 'react';
import ReactDOM from 'react-dom/client';
import './i18n'; // i18n initialization (Epic 22) — must be before App
import App from './App';
import './index.css';

// Auto-reload once on stale chunk errors (e.g. after server rebuild).
// Uses sessionStorage guard to prevent infinite reload loops.
window.addEventListener('unhandledrejection', (event) => {
  const msg = event.reason?.message || '';
  if (msg.includes('Failed to fetch dynamically imported module') || msg.includes('Importing a module script failed')) {
    const key = 'chunk-reload-attempted';
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1');
      window.location.reload();
    }
  }
});
// Clear the guard on successful load
sessionStorage.removeItem('chunk-reload-attempted');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
