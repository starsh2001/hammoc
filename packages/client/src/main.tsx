import React from 'react';
import ReactDOM from 'react-dom/client';
import './i18n'; // i18n initialization (Epic 22) — must be before App
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
