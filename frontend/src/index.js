// Polyfills and globals
import { Buffer } from 'buffer';
import process from 'process';
import stream from 'stream-browserify';

// React imports
import React from 'react';
import ReactDOM from 'react-dom/client';

// App imports
import App from './App';
import './index.css';

// Set up globals
window.Buffer = Buffer;
window.process = process;
window.stream = stream;

// Create root
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
