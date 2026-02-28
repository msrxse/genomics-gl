// Loads the Wasm module and handles typed postMessage requests.
// Runs off the main thread — no DOM access.
//
// Build the Wasm pkg with:
//   wasm-pack build crates/genome-engine --target web --out-dir ../../web/src/pkg
//
// Message protocol:
//   IN  { type: 'load', data: ArrayBuffer }
//   OUT { type: 'ready', chromosomeLength: number }
//
//   IN  { type: 'query', start: number, end: number }
//   OUT { type: 'result', features: Feature[] }

import init, { load_bed, get_features_in_range, chromosome_length } from '/pkg/genome_engine.js';

await init('/genome_engine_bg.wasm');

self.onmessage = (e: MessageEvent) => {
  const msg = e.data as WorkerMessage;

  if (msg.type === 'load') {
    load_bed(new Uint8Array(msg.data));
    self.postMessage({ type: 'ready', chromosomeLength: chromosome_length() });
  } else if (msg.type === 'query') {
    const features = get_features_in_range(msg.start, msg.end);
    self.postMessage({ type: 'result', features });
  }
};

// --- Types ---

type WorkerMessage =
  | { type: 'load'; data: ArrayBuffer }
  | { type: 'query'; start: number; end: number };
