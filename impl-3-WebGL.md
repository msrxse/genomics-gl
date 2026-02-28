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

## Key Concepts

### 1. Clip space vs pixel space

WebGL doesn't think in pixels. Its coordinate system ("clip space") goes from -1 to +1 on both axes, with (0,0) at the centre of the canvas. You have to convert your pixel coordinates into that range yourself. The vertex shader does this conversion using a `u_resolution` uniform (the canvas width and height).

Also: WebGL's Y axis is flipped relative to pixels. Y=+1 is the _top_ in clip space, but Y=0 is the _top_ in pixel/DOM coordinates. You have to flip Y in the shader or everything renders upside down.

### 2. Shaders

WebGL draws nothing on its own — you write two small GPU programs called shaders:

- **Vertex shader**: runs once per vertex. Takes a position (and any other per-vertex data) and outputs where on screen that point lands.
- **Fragment shader**: runs once per pixel covered by the geometry. Outputs the colour of that pixel.

These are written in GLSL — a small language with C-like syntax. You pass them to the browser as plain strings; the browser's GPU driver compiles them at runtime into code that runs directly on the GPU.

### 3. Vertex buffers and a single draw call

Instead of drawing features one at a time, you build a flat array of floats on the CPU — all the vertices for all the rectangles — and upload it to the GPU in one go. Then one `drawArrays()` call renders everything. This is the key to WebGL performance.

Each rectangle is two triangles (6 vertices). Each vertex carries its position and colour. So for 1,000 features you upload one array of ~30,000 floats and make one draw call.

### 4. The coordinate transform

Genomic coordinates (base pairs) need to map to pixel x positions on the canvas. The formula is:

```
screen_x = (genomic_pos - viewport_start) / (viewport_end - viewport_start) * canvas_width
```

This is the only "projection" needed. Y positions are fixed (row height, feature height — all constants).

### 5. Row packing

Features can overlap — two genes can span the same base-pair range. If you draw them at the same Y position they obscure each other. A greedy algorithm assigns each feature to a row so no two features in the same row overlap. Since the index already returns features sorted by start position, this is straightforward: scan features in order, assign each to the first row whose last feature ends before this one begins.

---

## Tasks

### Task 1: `crates/genome-engine/Cargo.toml`

Add `web-sys` as a dependency with the five WebGL feature flags. This is a prerequisite — without it the Rust compiler has no knowledge of `WebGlRenderingContext`, `WebGlBuffer`, etc.

**About `web-sys`**: a Rust crate that provides bindings to every Web API — the DOM, Canvas, WebGL, fetch, WebSockets, workers, and hundreds more. Each API is behind a feature flag. You only enable the ones you need, which keeps compile times fast and the Wasm binary small. The bindings are auto-generated directly from the official Web IDL specs, so the API surface mirrors the browser's JavaScript APIs almost exactly — just snake_case instead of camelCase.

That's also why we don't need `Window`, `Document`, or `HtmlCanvasElement` here — those are DOM features. The renderer never touches the DOM. React acquires the GL context from the canvas and passes it directly to Rust. The renderer only speaks WebGL.

### Task 2: `crates/genome-engine/src/renderer.rs`

Implement the `Renderer` struct. This is the core of item 3. It holds the GL context, compiled shader program, and vertex buffer. Exposes two things to JavaScript: a constructor (`new Renderer(gl)`) and a `render()` method that takes features + viewport and draws everything in a single draw call.

**Terminology:**

**Buffer** — a chunk of memory on the GPU. It holds the positions and colours of all the rectangles we want to draw, as a flat list of floats: `[x, y, r, g, b, x, y, r, g, b, ...]`. One buffer holds everything.

**Vertices and quads** — a vertex is a single point in space with some data attached (position, colour). A quad is a rectangle made of two triangles. WebGL only draws triangles, so every rectangle = 2 triangles = 6 vertices. For each gene feature we add 6 entries to the buffer.

**Attributes** — named inputs to the vertex shader that come from the buffer. We have two: `a_position` (the x,y of each vertex) and `a_color` (the r,g,b). When the GPU runs the vertex shader it reads these from the buffer automatically, one vertex at a time.

**Uniforms** — values you send into the shader that are the same for every vertex in a draw call. We use one: `u_resolution` (canvas width and height). It doesn't change per-vertex — it's constant for the whole frame.

**Shader** — a small program that runs on the GPU. The vertex shader runs once per vertex and says "put this point here on screen." The fragment shader runs once per pixel and says "colour this pixel this colour." You write them in GLSL as strings, hand them to the browser, and the GPU driver compiles them.

**Program** — the linked pair of vertex + fragment shader. You compile each shader separately, then link them into a program. Once linked you `use_program()` before drawing and the GPU knows which shaders to run.

So the full picture for one draw call is:

```
Buffer (flat float array)
  → attributes tell the GPU how to read it (every 5 floats = 1 vertex: x, y, r, g, b)
  → vertex shader runs for each vertex, uses a_position + u_resolution to place it on screen
  → fragment shader runs for each pixel, uses a_color to fill it
  → result: rectangles on canvas
```

### Task 3: `web/src/components/GenomeBrowserView.tsx`

Replace the stub with the full React component. Owns the `<canvas>`, initializes the Wasm renderer on mount, wires up `useGenomeWorker` for features, and calls `renderer.render()` whenever features or viewport change.

### Task 4: `web/src/App.tsx`

Replace Vite boilerplate with a minimal layout that renders `<GenomeBrowserView />`.