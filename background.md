# Background: Genomics, EMBL-EBI, and the Stack

## What is EMBL-EBI / Ensembl

**EMBL** (European Molecular Biology Laboratory) is one of the world's leading intergovernmental research organisations in molecular biology — think CERN but for biology. It's funded by 28 member states.

**EMBL-EBI** (European Bioinformatics Institute) is a specific site of EMBL, located at the Wellcome Genome Campus in Hinxton, Cambridgeshire. Its specific mission is data: storing, organising, and providing access to biological datasets for the global research community.

**Ensembl** is a genome browser project jointly run by EMBL-EBI and the Wellcome Sanger Institute (also on the same campus). It's been running since 1999. It is one of the two dominant genome browsers in the world — the other being UCSC Genome Browser. When a biologist anywhere in the world wants to look up where a gene is, what variants exist, or how a region compares across species, they very likely use Ensembl.

---

## What is genomic data

A genome is the complete set of DNA in an organism. The human genome is ~3.2 billion base pairs (bp) — individual letters (A, T, G, C) arranged in a sequence.

The raw sequence is not itself very useful. What's useful is the **annotation** — the interpretation layered on top:

- Where are the genes? (start/end position, chromosome)
- Where are the exons within each gene? (the parts that get transcribed into protein)
- What variants exist at position X? (SNPs — single nucleotide polymorphisms)
- How does this region compare to the equivalent region in mouse, zebrafish, or 100 other species?
- What epigenetic marks exist here? (which parts of the DNA are "turned on" in which tissues)

This annotation is what Ensembl stores, curates, and presents. It is produced by computational pipelines running over sequencing data from thousands of experiments.

---

## Why presenting this data is hard

**Scale**: The human genome is 3.2 billion bp. Chromosome 22 alone (the smallest autosome) is ~51 million bp. A gene annotation file for the whole human genome in GFF3 format is ~1GB uncompressed. You cannot load that into memory naively.

**Multi-resolution problem**: At the scale of the whole genome (3.2Gbp on screen), you can only show density — "there are a lot of genes here." At the scale of a single gene (10–100kbp), you show gene blocks with exons. At the scale of a single exon (100–1000bp), you show the actual sequence letters. The visualisation must smoothly transition between these zoom levels, showing the right level of detail at each scale. This is a classic LOD (level of detail) problem, like in 3D game engines.

**Simultaneity**: A researcher doesn't just look at genes in isolation. They want to see genes, variants, regulatory regions, comparative genomics tracks, RNA expression data — all aligned on the same coordinate axis simultaneously. These are different datasets with different sizes, update frequencies, and visual representations. Keeping them in sync during pan/zoom is a coordination problem.

**Interactivity**: The data is only useful if a researcher can explore it fluidly. A 1-second lag when zooming breaks the cognitive flow of research. 60fps is the requirement, not a nicety. This is what makes the GPU involvement necessary — you can't render thousands of features per frame at 60fps with the DOM or even Canvas 2D.

**Data is never finished**: Ensembl releases a new version of its data roughly every two months. The browser must handle schema changes, new species, new data types, without being rewritten each time.

---

## Why this stack specifically

Each technology in the stack is there to solve a specific constraint:

**Rust** — the data is big and the operations (parsing, indexing, range queries) need to be fast without garbage collection pauses. GC pauses at the wrong moment drop frames. Rust gives you C-level performance with memory safety. It also compiles to Wasm, so the same code runs in the browser.

**WebAssembly** — moves the compute-heavy work (parsing 50MB files, running range queries millions of times per second during pan/zoom) out of JavaScript and into a near-native execution environment. JS is fast for UI logic but not for tight numeric loops over large data.

**WebGL** — the DOM can't render 50,000 gene features at 60fps. Canvas 2D can't either, at scale. WebGL talks directly to the GPU. You upload your geometry once as a buffer, and the GPU draws it in parallel. This is the same reason games use GPUs — it's the only way to render large numbers of geometric primitives at interactive frame rates.

**React/TypeScript** — the UI shell (toolbar, panels, tooltips, settings) is standard web UI work. React is the right tool there. TypeScript enforces the contract between the JS world and the Wasm world at compile time, which matters when the boundary is complex.

**WebWorker** — the browser's main thread controls rendering. If you block it parsing a 50MB file, the UI freezes. WebWorkers give you a true separate thread. The Wasm engine lives there; the main thread stays responsive.

---

## The core insight

The genome browser problem is essentially the same problem as a map application (Google Maps, for instance):

- Enormous dataset that can't be loaded all at once
- Multi-resolution zoom with different representations at each level
- Smooth pan and zoom at 60fps
- Click/hover to get details on specific features
- Multiple data layers shown simultaneously

The difference is that instead of roads and buildings, you have genes and variants. The technical constraints are the same. The Rust+Wasm+WebGL stack is essentially the same reasoning Google would apply if they were rebuilding Maps from scratch in 2025 targeting the browser.

That's why the role is mislabelled as "frontend" — the interesting problems are identical to those in mapping, game engines, and scientific computing. The browser is just the deployment target.