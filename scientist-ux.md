# Scientist UX — Genome Browser User Research

## Who uses a genome browser

A bioinformatician or wet-lab scientist typically opens a genome browser to answer questions like:

- "What genes are near this variant I found?"
- "Is this region coding or intronic?"
- "What's on the opposite strand here?"
- "Does this peak overlap a known gene?"

They are used to tools like **UCSC Browser**, **IGV**, or **Ensembl** — so they have strong expectations about what a genome browser should do.

## What they'd immediately want that GenomicsGL doesn't have

### 1. Search by gene name

Type "TP53" → jump to that locus. This is the #1 action in any genome browser session. Without it, navigating to a specific gene means knowing its coordinates in advance.

### 2. Coordinate jump

Type `chr22:29,000,000-30,000,000` → jump there. Scientists copy-paste coordinates from papers constantly. A text input that parses standard genomic coordinate notation is expected.

### 3. Strand arrows

They read strand from arrow direction (IGV-style `>>>>>` fill), not just colour. Colour coding works but is non-standard — a scientist might not know what green vs red means without a legend.

### 4. Gene name labels on the track

At moderate zoom, they expect to see the gene name _inside or below_ the rectangle, not just on hover. Hovering one by one is painful with 50 visible genes on screen.

### 5. Multiple data layers

They'd want to load their own BED file (e.g. a ChIP-seq peak file) alongside the gene track to see overlap. This is the primary workflow: compare your data against a reference annotation.

---

## Tasks

### Task 1 — Gene name search (autocomplete dropdown)

**What it does:** A separate search bar above the genome track. User types a gene name → autocomplete dropdown shows matching results from `allFeatures` → user selects one → viewport jumps to that gene's locus.

**UI:** Built with shadcn `Command` (combobox pattern) + Tailwind. Separate component from `ControlPanel`, placed above the WebGL canvas.

**Behaviour:**
- Filter `allFeatures` (already in React state) by `name.toLowerCase().includes(query)` on each keystroke — no worker or Rust changes needed
- Cap dropdown results at 10 items
- Keyboard nav: ↑↓ to move through results, Enter to select, Escape to close
- On selection (Option B): input shows the selected gene name; user starts typing again to clear and search anew
- On selection: viewport jumps to `{ start: feature.start - padding, end: feature.end + padding }` with reasonable padding (e.g. 10% of feature length)
- Dropdown is only shown while the user is actively typing (closes on blur and on selection)

**Files touched:** new `GeneSearch.tsx`, `GenomeBrowserView.tsx` (pass `allFeatures` + `onJump` handler), `App.tsx` or layout wrapper.

**Stack additions:** Tailwind CSS + shadcn/ui (Command component).

### Task 2 — Coordinate jump (same input box)

**What it does:** The same search input from Task 1 also accepts genomic coordinates — if the input matches a coordinate pattern, skip the dropdown and jump directly on Enter.

**Supported formats:**
- `29000000-30000000`
- `29,000,000-30,000,000`
- `chr22:29000000-30000000`
- `chr22:29,000,000-30,000,000`

**Behaviour:**
- On each keystroke, check if input matches a coordinate pattern (regex) — if yes, hide the gene dropdown
- On Enter: strip commas, parse start/end as integers, validate, jump viewport
- Validation: clamp to `[0, chromosomeLength]`, swap if start > end, reject if range < 500 bp
- Show inline error message if input is invalid (shadcn `Input` error state)

**Files touched:** `GeneSearch.tsx` only — coordinate parsing logic lives alongside the gene search in the same component.

### Task 3 — Strand arrows + remove strand colour coding

**What it does:** Replace the current green/red strand colour coding with a single neutral colour for all features, and draw a small `›` or `‹` arrow inside each block to indicate strand direction — only when the block is wide enough on screen to fit one.

**Why:** This matches the standard BED rendering in UCSC and IGV. Colour-by-strand is a custom design that can confuse scientists who expect colour to mean score or feature type.

**Behaviour:**
- All gene blocks rendered in a single neutral colour (e.g. steel blue `#4a90d9`)
- When a feature's screen width > ~20px: draw a centred `›` (+ strand) or `‹` (− strand) on the 2D overlay canvas, same pass as the hover highlight
- When screen width ≤ 20px: no arrow (too small, would be noise)
- Arrow colour: white or light grey for contrast against the block

**Files touched:** `renderer.rs` (remove strand colour logic, use single colour), `GenomeBrowserView.tsx` (add arrow drawing to the 2D overlay canvas render loop).

**Note:** This supersedes PRD item 7h which was dropped because arrows-via-WebGL-geometry were deemed too complex. Using the 2D overlay canvas makes it trivial.

### Task 4 — Gene name labels inside blocks

**What it does:** Draw the gene name as text inside the feature block when the block is wide enough on screen to fit it. Falls back to nothing at low zoom (blocks too narrow).

**Behaviour:**
- On the 2D overlay canvas render pass (same as strand arrows and hover highlight): for each visible feature, if screen width > ~60px, draw the gene name centred horizontally and vertically inside the block
- Clip text to block width using `ctx.save()` / `ctx.clip()` so it never overflows into adjacent features
- Font: small monospace, e.g. `10px monospace`, white or light grey
- At screen width ≤ 60px: skip — too narrow to be readable
- Truncate with ellipsis if the text is wider than the block after clipping (use `ctx.measureText()` to check)

**Files touched:** `GenomeBrowserView.tsx` only — added to the existing 2D overlay canvas render loop alongside strand arrows.

**Note:** Tasks 3 and 4 both draw on the 2D overlay canvas in the same render pass — implement them together to avoid two separate loops over visible features.

### Task 5 — User-uploaded BED file (second track) ⚠️ not planned

**Not planned for implementation.** Documented here for completeness.

**What it would do:** Allow the user to upload their own `.bed` file (e.g. a ChIP-seq peak file) and render it as a second track below the gene annotation track, enabling overlap analysis.

**Why it's complex:**
- Requires a second WebWorker instance or extending the existing worker protocol to handle named/multiple datasets
- WebGL renderer needs dynamic canvas height and a second row of quads in a distinct colour
- 2D overlay hit-testing must be track-aware
- Track headers and layout management needed

**Why it's deferred:** This is essentially the same scope as PRD item 7b (multi-track rendering) which was also set aside. The four tasks above already make a significantly more usable tool without this complexity.
