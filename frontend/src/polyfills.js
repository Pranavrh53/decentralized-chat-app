// Polyfill process.nextTick
if (typeof process === 'undefined' || !process.nextTick) {
  window.process = {
    env: { NODE_ENV: 'production' },
    nextTick: (callback) => {
      setTimeout(callback, 0);
    },
  };
}

// Polyfill global object
if (typeof global === 'undefined') {
  window.global = window;
}

// Polyfill Buffer
if (typeof Buffer === 'undefined') {
  window.Buffer = require('buffer').Buffer;
}

// Polyfill process.browser
if (typeof process === 'object' && !process.browser) {
  process.browser = true;
}

// Polyfill stream module
if (typeof process === 'object') {
  try {
    const stream = require('stream');
    if (!window.Readable) {
      window.Readable = stream.Readable;
    }
  } catch (e) {
    console.warn('Stream polyfill not available');
  }
}
