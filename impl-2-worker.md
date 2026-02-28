# Impl 2: WebWorker Integration

> PRD MVP item 2.

---

## Overview

Wiring the data engine into a WebWorker so the main thread stays responsive. Three files to fill in:

1. `web/src/workers/genome.worker.ts` — the worker itself
2. `web/src/hooks/useGenomeWorker.ts` — React hook that owns the worker
3. `web/public/data/sample.bed` — the BED data file to load

---

## Background

### What a WebWorker is

A WebWorker is a background thread in the browser. JavaScript is single-threaded by default — if you run heavy computation on the main thread, the UI freezes. Workers solve this: they run in a separate thread, do the work, and send results back via messages.

The main thread and worker never share memory directly. They communicate exclusively through `postMessage` — serialized messages passed across a boundary.

### Why it matters here

Parsing a BED file and building the index is CPU-bound work. On chr22 (~14,000 features) it's fast, but on larger chromosomes or full genomes it could block the browser for hundreds of milliseconds. Putting it in a worker means:

- The page loads and renders immediately
- The heavy work happens in the background
- The UI stays interactive while the worker initializes

### The communication protocol

Two phases: **load** and **query**.

**Load phase** (once on startup):

```
Main thread  →  postMessage({ type: 'load', data: ArrayBuffer })
Worker       →  load_bed(data) → parse → build index
Worker       →  postMessage({ type: 'ready', chromosomeLength: number })
```

**Query phase** (every pan/zoom):

```
Main thread  →  postMessage({ type: 'query', start: number, end: number })
Worker       →  get_features_in_range(start, end)
Worker       →  postMessage({ type: 'result', features: Feature[] })
```

### Why ArrayBuffer for the load message?

`postMessage` can transfer an `ArrayBuffer` by ownership (zero-copy) — the buffer is moved to the worker, not copied. This is called a **transferable**. For a 1MB BED file it avoids duplicating the data across the message boundary.

The second argument to `postMessage` specifies which objects to transfer:

```ts
worker.postMessage({ type: 'load', data: buffer }, [buffer]);
//                                                  ^^^^^^^^
//                                          transfer ownership, not copy
```

After this call, `buffer` is detached on the main thread — the worker owns it.

### The Wasm build target

Because this project uses Vite, the worker is bundled as an ES module — `new Worker(..., { type: 'module' })`. That means the Wasm glue is built with `--target web`, not `--target no-modules`. The worker imports it like any other ES module:

```ts
import init, { load_bed, get_features_in_range, chromosome_length } from '/pkg/genome_engine.js';
await init('/pkg/genome_engine_bg.wasm');
```

`await init(...)` resolves before `onmessage` is registered, so there is no race condition between Wasm initialisation and the first incoming message.

### How the Wasm pkg gets built

The pkg must exist at `web/public/pkg/` before Vite can serve or bundle it. The build command is:

```
wasm-pack build crates/genome-engine --target web --out-dir ../../web/public/pkg
```

This is wired into `web/package.json` as npm scripts so it runs automatically:

```json
"build:wasm": "wasm-pack build ../crates/genome-engine --target web --out-dir ../../web/public/pkg",
"dev":        "npm run build:wasm && vite",
"build":      "npm run build:wasm && tsc -b && vite build"
```

`npm run dev` rebuilds the Wasm pkg then starts Vite. `npm run build` does the same for production. Requires `wasm-pack` installed globally (`cargo install wasm-pack`).

**Gotcha: `--out-dir` is relative to the crate, not to where npm runs.**

`wasm-pack` resolves `--out-dir` relative to the crate being built (`crates/genome-engine/`), not the working directory of the npm script (`web/`). So `../../web/public/pkg` means: up from `genome-engine/`, up from `crates/`, then into `web/public/pkg/`. Using a short path like `public/pkg` would silently output to `crates/genome-engine/public/pkg/` instead.

### The race condition to avoid

The main thread must not send a `query` message before the worker has finished loading and indexing the BED file. The sequence is strictly:

```
Worker starts → await init() resolves → registers onmessage
useGenomeWorker mounts → fetch sample.bed → postMessage({ type: 'load', data })
Worker receives 'load' → load_bed() → postMessage({ type: 'ready', chromosomeLength })
useGenomeWorker receives 'ready' → sets ready: true
Components can now call query(start, end)
```