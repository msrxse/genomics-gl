# Impl 3: WebGL Renderer

> PRD MVP item 3.

---

## Overview

PRD item 3 is about rendering genomic data visually on a canvas using WebGL — the GPU drawing layer.

At this point the data engine (item 1) parses the BED file and answers range queries, and the worker (item 2) runs that engine off the main thread. But nothing is drawn yet. Item 3 is what makes it visible.

The job is:

- Take a list of features (genes/annotations with start, end, strand) returned from the worker
- Take a viewport — the genomic range the user is currently looking at (e.g. positions 0–100,000 on chr22)
- Draw coloured rectangles on a canvas — one rectangle per feature, green for + strand, red for − strand
- Draw a ruler along the top with tick marks that adapt to the zoom level
- Do all of this using raw WebGL via Rust/`web-sys` — not a library, not Canvas 2D, actual GPU vertex buffers and shaders

The reason for WebGL instead of Canvas 2D is performance: at low zoom levels you might have thousands of features visible. Canvas 2D draws them one at a time on the CPU. WebGL sends all geometry to the GPU in a single buffer upload and draws everything in one call — that's what makes smooth zooming and panning possible at scale.

---

## GPU vs Main Thread vs Browser

There are three separate execution contexts. They don't share memory, they don't share a thread, and they don't even speak the same language.

### 1. The Main Thread (JavaScript / Wasm)

This is the browser's single UI thread. It runs React, your Rust/Wasm (which compiles to Wasm but executes as CPU code), DOM manipulation, event handlers, layout, and painting. It has access to JavaScript objects, the DOM, the window — everything you think of as "the browser."

Key constraint: it's single-threaded. If you block it, the UI freezes.

### 2. The WebWorker Thread (also CPU)

Still CPU, still your machine's processor, but a separate OS thread with no DOM access. In this project the `genome-engine` Wasm runs here for parsing and range queries — so heavy data work doesn't block the UI. Communication is only via `postMessage`. No shared memory (unless you use `SharedArrayBuffer`).

### 3. The GPU

Completely separate hardware. It has its own processor (thousands of tiny parallel cores), its own memory (VRAM — separate from RAM), and its own programs (shaders, compiled to GPU machine code by the driver). The GPU does not run JavaScript or Wasm. It runs GLSL, compiled and uploaded at runtime. You can't call a JS function from a shader. You can't access a JS variable from VRAM.

### How they communicate

The only bridge is the WebGL API — a set of calls the main thread makes to issue commands to the GPU. The GPU is async; it queues commands and executes them on its own schedule.

```
Main Thread (JS/Wasm)          GPU
──────────────────────         ──────────────────────
gl.bufferData(...)    ──────►  copy floats into VRAM
gl.drawArrays(...)    ──────►  run vertex shader × N vertices
                               run fragment shader × M pixels
                               write pixels to framebuffer
                      ◄──────  present framebuffer to screen
```

`gl.bufferData` is the one moment when data crosses from RAM to VRAM. After that the GPU owns it. The CPU doesn't see pixel outputs — the GPU writes directly to the screen's framebuffer.

### Why this matters for a genome browser

At low zoom you might have 50,000 features visible.

- **Canvas 2D (CPU)**: loop over 50,000 features, call `fillRect()` 50,000 times. Each call is a CPU→GPU round-trip. Slow, blocks the UI.
- **WebGL (GPU)**: build one flat array of floats on CPU (fast), upload once, one `drawArrays` call. The GPU draws all 50,000 rectangles in parallel — one shader invocation per vertex, all at the same time. The CPU is free immediately.

The GPU's advantage is massive parallelism — not speed per core, but thousands of cores executing simultaneously.

---

## WebGL Theory: Shaders, Programs, and Vertices

WebGL is a state machine that runs programs on the GPU. You feed it data (vertices) and tell it two programs (shaders) — one to position things, one to color them.

### Shaders

Shaders are small GPU programs written in GLSL (a C-like language). There are exactly two kinds:

- **Vertex shader** — runs once per vertex. Its job: given this vertex's data, where should it appear on screen? Output: `gl_Position` — a coordinate in clip space (a normalised -1 to +1 cube).
- **Fragment shader** — runs once per pixel that a triangle covers. Its job: what colour should this pixel be? Output: `gl_FragColor` — an RGBA value.

The GPU calls the vertex shader first, then rasterises triangles (figures out which pixels they cover), then calls the fragment shader for each covered pixel.

### Program

A program is the vertex + fragment shader compiled and linked together into one GPU-resident object. You can't use shaders independently — they must be paired. Once linked, you call `gl.use_program(program)` to make it active.

```
VERT_SHADER source  →  compile  →  vert shader object  ┐
FRAG_SHADER source  →  compile  →  frag shader object  ┘ → link → WebGlProgram
```

### Vertices and buffers

A vertex is a bundle of data for one point. In this renderer each vertex has 5 floats: `[x, y, r, g, b]`. Vertices are packed into a flat array on the CPU, then uploaded to the GPU via a buffer (`WebGlBuffer`). The GPU doesn't know your struct layout — you describe it with `vertex_attrib_pointer`.

### Triangles (why 6 vertices per rectangle)

WebGL's only primitive is the triangle. A rectangle = 2 triangles = 6 vertices:

```
(x1,y1)──(x2,y1)
  │     ╲    │
  │      ╲   │
(x1,y2)──(x2,y2)

Triangle 1: (x1,y1), (x2,y1), (x1,y2)
Triangle 2: (x2,y1), (x2,y2), (x1,y2)
```

### Attributes vs uniforms vs varyings

| Keyword | Scope | Direction | Example |
|---|---|---|---|
| `attribute` | per-vertex | CPU → vertex shader | `a_position`, `a_color` |
| `uniform` | whole draw call | CPU → both shaders | `u_resolution` |
| `varying` | per-pixel interpolated | vertex shader → fragment shader | `v_color` |

`varying` is the magic that makes colours smooth across a triangle — the GPU linearly interpolates it between the triangle's 3 vertices.

### The coordinate transform

The vertex shader does one key conversion: pixel coordinates → clip space.

```glsl
vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
```

You pass pixel coordinates (e.g. `x=300, y=50` on an 800×600 canvas). The shader divides by resolution to get `[0,1]`, scales to `[0,2]`, shifts to `[-1,1]`. Y is flipped because WebGL clip space has Y=+1 at top, but canvas pixel coordinates have Y=0 at top.

---

## Tasks

### Task 1: `crates/genome-engine/Cargo.toml`

Add `web-sys` as a dependency with the five WebGL feature flags. This is a prerequisite — without it the Rust compiler has no knowledge of `WebGlRenderingContext`, `WebGlBuffer`, etc.

**About `web-sys`**: a Rust crate that provides bindings to every Web API — the DOM, Canvas, WebGL, fetch, WebSockets, workers, and hundreds more. Each API is behind a feature flag. You only enable the ones you need, which keeps compile times fast and the Wasm binary small. The bindings are auto-generated directly from the official Web IDL specs, so the API surface mirrors the browser's JavaScript APIs almost exactly — just snake_case instead of camelCase.

That's also why we don't need `Window`, `Document`, or `HtmlCanvasElement` here — those are DOM features. The renderer never touches the DOM. React acquires the GL context from the canvas and passes it directly to Rust. The renderer only speaks WebGL.

### Task 2: `crates/genome-engine/src/renderer.rs`

Implement the `Renderer` struct. This is the core of item 3. It holds the GL context, compiled shader program, and vertex buffer. Exposes two things to JavaScript: a constructor (`new Renderer(gl)`) and a `render()` method that takes features + viewport and draws everything in a single draw call.

### Task 3: `web/src/components/GenomeBrowserView.tsx`

Replace the stub with the full React component. Owns the `<canvas>`, initializes the Wasm renderer on mount, wires up `useGenomeWorker` for features, and calls `renderer.render()` whenever features or viewport change.

### Task 4: `web/src/App.tsx`

Replace Vite boilerplate with a minimal layout that renders `<GenomeBrowserView />`.