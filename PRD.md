# PRD: GenomicsGL — Mini Genome Browser

> A portfolio project demonstrating the Rust + WebAssembly + WebGL + React stack used by the Ensembl genome browser at EMBL-EBI.

---

## Goal

Build a simplified, interactive genome browser in the browser that:

- Parses a BED file using Rust/Wasm on a WebWorker (off main thread)
- Indexes features for fast range queries
- Renders genomic tracks using raw WebGL (via `web-sys`)
- Supports zoom, pan, and hover interaction
- Wraps everything in a React/TypeScript UI shell

This is a scaled-down version of what the Ensembl genome browser does, built with the same core technologies.

---

## Stack & Tooling

| Layer     | Technology                   | Rationale                                                    |
| --------- | ---------------------------- | ------------------------------------------------------------ |
| Language  | Rust                         | Core requirement; data engine + WebGL renderer               |
| Wasm      | `wasm-bindgen` + `wasm-pack` | Standard Rust → Wasm bridge                                  |
| WebGL     | `web-sys` (raw WebGL)        | Matches Ensembl's actual approach                            |
| UI shell  | React + TypeScript           | JD requirement; separates concerns cleanly                   |
| Build     | Trunk + Vite                 | Trunk manages Wasm lifecycle; Vite handles React/TS bundling |
| Threading | WebWorker                    | Off-main-thread parsing; MVP requirement                     |
| Data      | Bundled sample BED file      | No CORS issues; deterministic demo                           |
| Testing   | `wasm-bindgen-test` + Vitest | Unit tests on Rust data engine; component tests on React     |
| CI        | GitHub Actions               | Lint, test, build, deploy to GitHub Pages                    |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  React / TypeScript (UI Shell)                          │
│                                                         │
│  ┌─────────────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ GenomeBrowserView│  │ControlPanel│  │FeatureDetails │  │
│  │  <canvas>       │  │zoom/pan  │  │hover tooltip  │  │
│  └────────┬────────┘  └──────────┘  └───────────────┘  │
│           │ WebGL context                               │
└───────────┼─────────────────────────────────────────────┘
            │
┌───────────▼─────────────────────────────────────────────┐
│  WebGL Renderer (Rust / web-sys)                        │
│                                                         │
│  - Manages WebGLRenderingContext                        │
│  - Uploads vertex buffers (gene blocks, exons, ruler)   │
│  - Applies coordinate transform (viewport → screen px)  │
│  - Handles zoom/pan matrix                              │
└───────────┬─────────────────────────────────────────────┘
            │ query: get_features_in_range(start, end)
┌───────────▼─────────────────────────────────────────────┐
│  Data Engine (Rust / wasm-bindgen) — runs in WebWorker  │
│                                                         │
│  - Receives BED file bytes                              │
│  - Parses into Feature structs                          │
│  - Builds interval index (UCSC binning scheme)          │
│  - Exposes get_features_in_range(start, end) → JsValue  │
│  - Exposes chromosome_length() → u32                    │
└─────────────────────────────────────────────────────────┘
```

**Key boundary**: the Rust/Wasm module is loaded and runs entirely inside a WebWorker. The React shell communicates with it via `postMessage`. The WebGL renderer runs on the main thread (canvas must be on main thread), receiving only the resolved feature data it needs to draw.

---

## Data

**Format**: BED (tab-separated, columns: chrom, chromStart, chromEnd, name, score, strand)

**Source**: Bundled sample file shipped with the repo (`/data/sample.bed`)

**Suggested dataset**: Human chromosome 22 gene annotations from UCSC (small enough at ~1MB, real enough to be meaningful). Chromosome 22 is the smallest autosome — good for demos.

**Why not GFF3**: GFF3's parent-child relationships (gene → transcript → exon) add parser complexity that is not the point of this project. BED is the right starting format. GFF3 support is a stretch goal.

---

## MVP Scope

All six items below are required for MVP. No item is optional.

### 1. Data Engine (Rust)

- [x] Parse BED format into `Vec<Feature>` where `Feature { chrom, start, end, name, strand }`
- [x] Build a UCSC binning index over the feature list (enables O(log n) range queries without a full scan)
- [x] Expose via `wasm-bindgen`:

  ```rust
  #[wasm_bindgen]
  pub fn load_bed(data: &[u8]) -> Result<(), JsValue>;

  #[wasm_bindgen]
  pub fn get_features_in_range(start: u32, end: u32) -> JsValue; // returns JSON array

  #[wasm_bindgen]
  pub fn chromosome_length() -> u32;
  ```

- [x] Unit tests for parser and range query correctness (`wasm-bindgen-test`)

### 2. WebWorker Integration

- [x] Load the Wasm module inside a WebWorker
- [x] Worker receives `{ type: 'load', data: ArrayBuffer }` → calls `load_bed`
- [x] Worker receives `{ type: 'query', start, end }` → calls `get_features_in_range` → posts result back
- [x] React shell communicates with worker via a typed message interface (no raw `any`)

### 3. WebGL Renderer (Rust / web-sys)

- [x] Acquire `WebGlRenderingContext` from the canvas element (passed in from React)
- [x] Vertex buffer for gene block rectangles (one quad per feature in view)
- [x] Simple vertex + fragment shader pair (GLSL): solid colour fill per feature, different colour for +/- strand
- [x] Coordinate transform: genomic coordinates (bp) → screen pixels, based on current viewport (start, end, canvas width)
- [x] Ruler track: tick marks at sensible intervals (1kb, 10kb, 100kb depending on zoom level)
- [x] Re-renders when viewport or data changes

### 4. Zoom & Pan

- [x] Mouse wheel → zoom in/out centered on cursor position
- [x] Click + drag → pan left/right
- [x] Viewport state: `{ start: u32, end: u32 }` held in React, passed to renderer and used for range queries
- [x] Zoom clamped to: minimum 500bp visible, maximum = chromosome length

### 5. Hover Tooltip

- [x] On `mousemove` over canvas: hit-test against currently rendered features (in screen coordinates)
- [x] Show tooltip with: feature name, coordinates (start–end), strand
- [x] Tooltip is a React component overlaid on the canvas (not drawn in WebGL)
- [x] 2D canvas overlay draws a white outline rect around the hovered feature
- [x] Cursor switches to crosshair on feature hover, grab otherwise

### 6. React UI Shell

- [x] `<GenomeBrowserView>` — owns the canvas, WebWorker lifecycle, renderer instance
- [x] `<ControlPanel>` — zoom in/out buttons, coordinate display (current viewport start/end in bp), reset button
- [x] `<FeatureDetails>` — tooltip panel
- [x] `<LoadingState>` — shown while Wasm initialises and BED file is parsed
- [x] TypeScript throughout; no `any` types at the React layer
- [x] D3 SVG axis overlay — labelled genomic axis over the WebGL ruler track (bp → Mb labels, smart tick density at any zoom level)

---

## Non-Goals (MVP)

These are explicitly out of scope for MVP:

- GFF3 / VCF / BAM format support
- Multiple tracks
- Fetching data from remote URLs
- Animations / transitions
- Mobile / touch support
- Authentication or user accounts

---

## Stretch Goals

Ordered by relevance to the JD:

1. **Multi-track rendering** — second track (e.g. GC content or repeat regions), different visual style
2. **GFF3 support** — parse gene → transcript → exon hierarchy; render exon blocks with intron connectors
3. **Smooth GPU zoom animation** — interpolate viewport transform in the shader rather than snapping
4. **Downsampling / LOD** — at low zoom, merge overlapping features into a density plot rather than individual rectangles
5. **Tabix-indexed file support** — fetch only the region needed from a remote tabix-indexed BED; demonstrates bioinformatics awareness
6. **Python data prep script** — a small script to filter/sort/index a raw Ensembl annotation file into the bundled sample

### Done (stretch)

- [x] **d3-brush overview+detail** — `<GenomeBrush>` component below the WebGL canvas shows the full chr22 extent with a density background (feature count per bin) and a d3-brush selection indicating the current viewport; two-way sync with zoom/pan/buttons

---

## File Structure

```
genomics-gl/
├── Cargo.toml                  # Rust workspace
├── crates/
│   └── genome-engine/          # Rust/Wasm data engine
│       ├── src/
│       │   ├── lib.rs          # wasm-bindgen exports
│       │   ├── parser.rs       # BED parser
│       │   ├── index.rs        # UCSC binning index
│       │   └── renderer.rs     # WebGL renderer (web-sys)
│       └── tests/
│           └── engine_tests.rs
├── web/                        # React/TS frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── GenomeBrowserView.tsx
│   │   │   ├── ControlPanel.tsx
│   │   │   └── FeatureDetails.tsx
│   │   ├── workers/
│   │   │   └── genome.worker.ts
│   │   ├── hooks/
│   │   │   └── useGenomeWorker.ts
│   │   └── App.tsx
│   ├── public/
│   │   └── data/
│   │       └── sample.bed
│   └── vite.config.ts
├── .github/
│   └── workflows/
│       └── ci.yml              # lint, test, build, deploy
└── PRD.md
```

---

## Rendering Design

The WebGL renderer operates on a simple 2D coordinate system:

- **Genomic space**: integer base-pair coordinates (e.g. 0–51_304_566 for chr22)
- **Screen space**: pixels (0 → canvas.width, 0 → canvas.height)
- **Transform**: `screen_x = (genomic_x - viewport_start) / (viewport_end - viewport_start) * canvas_width`

Each visible feature becomes a quad (two triangles = 6 vertices). Vertex data is uploaded as a flat `f32` array to a GPU buffer per frame. At MVP scale (hundreds to low thousands of visible features), this is fast enough without instancing.

Track layout (y-axis): fixed row height (e.g. 20px), features packed into rows to avoid overlap using a simple greedy algorithm on the CPU side before upload.

---

## Testing Strategy

| Layer            | Tool                     | What                                                                                     |
| ---------------- | ------------------------ | ---------------------------------------------------------------------------------------- |
| Rust data engine | `wasm-bindgen-test`      | Parser correctness, range query results, edge cases (empty file, features at boundaries) |
| React components | Vitest + Testing Library | Render states, control interactions, tooltip display                                     |
| Integration      | Playwright (stretch)     | Load app, verify canvas renders, zoom/pan interaction                                    |

---

## CI Pipeline (GitHub Actions)

```yaml
jobs:
  rust:
    - cargo fmt --check
    - cargo clippy -- -D warnings
    - wasm-pack test --headless --firefox

  web:
    - tsc --noEmit
    - eslint
    - vitest run

  build:
    - wasm-pack build
    - vite build
    - deploy to GitHub Pages (on main)
```

---

## Definition of Done

The project is complete when:

1. The app loads in a browser, shows a WebGL-rendered track of chr22 gene annotations
2. Zoom and pan work smoothly without UI jank (parsing is on the WebWorker)
3. Hovering a feature shows a tooltip with name, coordinates, and strand
4. All Rust unit tests pass
5. CI passes on every push
6. The repo has a README with a live demo link and a brief architecture explanation
