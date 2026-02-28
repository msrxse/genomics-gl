// Load the Wasm glue — no-modules target exposes a global `wasm_bindgen` object
importScripts('./pkg/spike_worker.js');

// Initialise the Wasm module, signal ready, then listen for messages
wasm_bindgen('./pkg/spike_worker_bg.wasm').then(() => {
  const { sum_range } = wasm_bindgen;

  // Tell the main thread we're ready to receive queries
  self.postMessage({ type: 'ready' });

  self.onmessage = (event) => {
    const { type, start, end } = event.data;

    if (type === 'query') {
      console.time('sum_range');
      const value = sum_range(start, end);
      console.timeEnd('sum_range');

      self.postMessage({ type: 'result', value });
    }
  };
});