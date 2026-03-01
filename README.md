# GenomicsGL

A simplified genome browser using Rust, WebAssembly, WebGL, and React. It loads real genomic data, renders tracks at 60fps, and handles zooming and panning efficiently.

---

## Prerequisites

- [Rust](https://rustup.rs/) + `wasm-pack` (`cargo install wasm-pack`)
- Node.js 18+

## Getting started

```bash
# Install JS dependencies
cd web && npm install

# Build the Wasm pkg (required once before first run, and after any Rust changes)
npm run build:wasm

# Start dev server
npm run dev
```

The dev server runs at `http://localhost:5173`.

To run the Rust unit tests independently:

```bash
cargo test -p genome-engine
```

---

## Project Documents

| Document | Description |
|---|---|
| [JD.md](JD.md) | The EMBL-EBI Rust Frontend Developer job description that inspired this project |
| [background.md](background.md) | Domain context: what EMBL-EBI and Ensembl are, why this stack, and what a genome browser actually does |
| [pre-prd.md](pre-prd.md) | Early project concept document — bridges the JD to a concrete build plan, covering rationale and approach before the formal spec was written |
| [PRD.md](PRD.md) | Full product requirements: architecture, MVP scope, rendering design, testing strategy, and definition of done |
| [spikes.md](spikes.md) | Three isolated proof-of-concept experiments (Wasm boundary, WebGL rectangle, Wasm-in-WebWorker) completed before the main build |
| [impl-1-data-engine.md](impl-1-data-engine.md) | Guided implementation notes for the Rust data engine (PRD MVP item 1) — BED parser, UCSC binning index, and wasm-bindgen exports |
| [impl-2-worker.md](impl-2-worker.md) | Guided implementation notes for the WebWorker integration (PRD MVP item 2) |
