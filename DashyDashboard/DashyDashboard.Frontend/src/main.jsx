import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Apply the persisted theme as early as possible. This lives here (in the bundled,
// same-origin module) rather than as an inline <script> in index.html because the
// production CSP is `script-src 'self'` and would block inline scripts.
try {
  let t = localStorage.getItem('dashy.theme');
  if (t !== 'dark' && t !== 'light') {
    t = 'light';
  }
  document.documentElement.dataset.theme = t;
} catch (e) { /* no-op */ }

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
