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

// Register onmessage *before* awaiting init() to avoid a race condition:
// the main thread sends { type: 'load' } immediately after creating the worker,
// which can arrive while the Wasm module is still being fetched and compiled.
// Any messages that arrive early are buffered in `pending` and replayed once
// init() resolves.
const pending: WorkerMessage[] = [];
let wasmReady = false;

self.onmessage = (e: MessageEvent) => {
  const msg = e.data as WorkerMessage;
  if (!wasmReady) {
    pending.push(msg);
    return;
  }
  handle(msg);
};

init().then(() => {
  wasmReady = true;
  for (const msg of pending) handle(msg);
  pending.length = 0;
});

function handle(msg: WorkerMessage) {
  if (msg.type === 'load') {
    load_bed(new Uint8Array(msg.data));
    self.postMessage({ type: 'ready', chromosomeLength: chromosome_length() });
  } else if (msg.type === 'query') {
    const features = get_features_in_range(msg.start, msg.end);
    self.postMessage({ type: 'result', features });
  }
}

// --- Types ---

type WorkerMessage =
  | { type: 'load'; data: ArrayBuffer }
  | { type: 'query'; start: number; end: number };
