# Pre-PRD: Mini Genome Browser

> A portfolio project demonstrating the exact skills required for the EMBL-EBI / Ensembl Rust Frontend Developer role.

---

## Project Concept

**GenomicsGL** — A simplified interactive genome browser built with Rust, WebAssembly, WebGL, and React.

You'll build a browser that:

- Loads a genomic dataset (e.g., chromosome 1 annotations)
- Renders genomic tracks using WebGL
- Lets users zoom, pan, and hover over features
- Uses Rust → Wasm for heavy data operations
- Uses React/TypeScript for UI
- Manages large datasets efficiently in the browser

This is a scaled-down version of exactly what the Ensembl genome browser does.

---

## Why This Project

Every requirement in the JD is exercised:

### Rust + Wasm

- Parse a big dataset (e.g., GFF3, BED) in Rust
- Do range queries, indexing, track resolution
- Manage memory & data structures efficiently
- Expose Rust logic to JS/React via `wasm-bindgen`

### WebGL / Data Visualisation

- Render genomic "tracks" (genes, exons) as GPU shapes
- Implement transforms: scale, translate, zoom
- Handle thousands of visual elements efficiently

This demonstrates graphic programming skills, not just UI work.

### Working with Large Datasets

- Fetch a big file (5–50 MB) from public genomics sources
- Implement chunked parsing
- Only render the visible region
- Avoid blocking the UI

### React + TypeScript

React provides the app shell:

- Toolbar
- Feature info panel
- Settings

JS is the app shell; Rust/Wasm is the engine.

### Scientific Visualisation Mindset

- Think multidimensionally
- Present complex data clearly
- Understand the constraints of scientific tooling

---

## Suggested Architecture

### Frontend (TS/React)

- `GenomeBrowserView` — canvas container
- `ControlPanel` — zoom, track options
- `FeatureDetails` — hover panel

Communicates with the Wasm module via async calls.

### WebGL Rendering Module

Written in Rust using `web-sys` for low-level WebGL bindings. Responsible for:

- Drawing rectangles/lines representing genomic features
- Managing GPU buffers
- Coordinate transforms

### Rust/Wasm Data Engine

Key components:

- Load file (BED/GFF)
- Parse into internal structs
- Build interval index (e.g. interval tree or binning scheme)
- Expose query functions:

```rust
#[wasm_bindgen]
pub fn get_features_in_range(start: u32, end: u32) -> JsValue;
```

- Provide an efficient data structure enabling fast range queries

### Data Sources (Public)

- Human chromosome 1 annotations from EMBL/Ensembl
- Or UCSC datasets (easier for beginners)

---

## Minimum Viable Version (MVP)

Target: ~3 weeks

1. Load and parse a BED file using Rust/Wasm
2. Build a simple interval lookup (binary search or buckets)
3. Use WebGL to draw gene blocks on a canvas
4. Add zoom & pan
5. Add hover tooltip with basic info
6. Wrap UI in a React component

That's already an impressive, portfolio-quality project.

---

## Stretch Goals

These directly match bonus points in the JD:

1. **Multi-track support** — Genes, Variants, Repeat regions
2. **Smooth WebGL animations** — GPU-based zooming, shader effects
3. **Compressed BGZF or tabix-indexed files** — shows bioinformatics awareness
4. **Downsampling logic** — only draw what's visible; huge performance win
5. **WebWorker** — move Wasm loading & parsing off the main thread
6. **Integrate D3 for SVG overlays** — hybrid WebGL + D3 is common in scientific visualisation

---

## Presentation

> "I wanted to demonstrate exactly the skills required to work on the Ensembl genome browser — so I built a simplified genome browser from scratch using Rust, WebAssembly, WebGL, and React. It loads real genomic data, renders tracks at 60fps, and handles zooming and panning efficiently."
