import { useEffect, useRef } from "react";
import { scaleLinear } from "d3-scale";
import { brushX, type BrushBehavior, type D3BrushEvent } from "d3-brush";
import { select } from "d3-selection";
import type { Feature } from "../hooks/useGenomeWorker";

interface Props {
  chromosomeLength: number;
  viewportStart: number;
  viewportEnd: number;
  allFeatures: Feature[];
  onBrush: (start: number, end: number) => void;
}

const HEIGHT = 56;
const DENSITY_HEIGHT = 32;
const BRUSH_HEIGHT = 48;
const NUM_BINS = 300;

function buildDensity(features: Feature[], chromLen: number, bins: number): number[] {
  const counts = new Array<number>(bins).fill(0);
  const binSize = chromLen / bins;
  for (const f of features) {
    const b0 = Math.floor(f.start / binSize);
    const b1 = Math.min(Math.floor(f.end / binSize), bins - 1);
    for (let b = b0; b <= b1; b++) counts[b]++;
  }
  return counts;
}

export function GenomeBrush({ chromosomeLength, viewportStart, viewportEnd, allFeatures, onBrush }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const brushRef = useRef<BrushBehavior<unknown> | null>(null);
  const widthRef = useRef(0);
  // Track whether a brush interaction is in progress to avoid feedback loops.
  const brushingRef = useRef(false);

  // Draw density bars + init brush on first render (or when chromLen/features change).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || chromosomeLength === 0) return;

    const width = svg.getBoundingClientRect().width || 800;
    widthRef.current = width;

    const xScale = scaleLinear().domain([0, chromosomeLength]).range([0, width]);

    const g = select(svg);
    g.selectAll("*").remove();

    // --- Density background ---
    if (allFeatures.length > 0) {
      const counts = buildDensity(allFeatures, chromosomeLength, NUM_BINS);
      const maxCount = Math.max(...counts, 1);
      const binPx = width / NUM_BINS;

      const densityG = g.append("g").attr("class", "density");
      counts.forEach((count, i) => {
        if (count === 0) return;
        const barH = (count / maxCount) * DENSITY_HEIGHT;
        densityG
          .append("rect")
          .attr("x", i * binPx)
          .attr("y", DENSITY_HEIGHT - barH)
          .attr("width", Math.max(binPx - 0.5, 0.5))
          .attr("height", barH)
          .attr("fill", "rgba(100, 160, 220, 0.45)");
      });
    }

    // --- Brush ---
    const brush = brushX<unknown>()
      .extent([
        [0, 0],
        [width, BRUSH_HEIGHT],
      ])
      .on("brush end", (event: D3BrushEvent<unknown>) => {
        if (!event.selection || !event.sourceEvent) return; // programmatic move — skip
        brushingRef.current = true;
        const [x0, x1] = event.selection as [number, number];
        const start = Math.round(xScale.invert(x0));
        const end = Math.round(xScale.invert(x1));
        if (end > start) onBrush(start, end);
        brushingRef.current = false;
      });

    brushRef.current = brush;

    const brushG = g.append("g").attr("class", "brush");
    brushG.call(brush as never);

    // Style the brush selection overlay
    brushG.select(".selection")
      .attr("fill", "rgba(100, 180, 255, 0.25)")
      .attr("stroke", "rgba(120, 190, 255, 0.8)")
      .attr("stroke-width", 1);

    // Set initial brush position to current viewport
    const x0 = xScale(viewportStart);
    const x1 = xScale(viewportEnd);
    brushG.call(brush.move as never, [x0, x1]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chromosomeLength, allFeatures]);

  // Sync brush position when viewport changes externally (zoom/pan/buttons).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || chromosomeLength === 0 || brushingRef.current) return;

    const width = widthRef.current || svg.getBoundingClientRect().width || 800;
    const xScale = scaleLinear().domain([0, chromosomeLength]).range([0, width]);
    const x0 = xScale(viewportStart);
    const x1 = xScale(viewportEnd);

    const brushG = select(svg).select<SVGGElement>(".brush");
    if (brushRef.current && !brushG.empty()) {
      brushG.call(brushRef.current.move as never, [x0, x1]);
    }
  }, [viewportStart, viewportEnd, chromosomeLength]);

  if (chromosomeLength === 0) return null;

  return (
    <div style={{ position: "relative", width: "100%", background: "rgba(14,14,18,0.97)", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
      <svg
        ref={svgRef}
        style={{ display: "block", width: "100%", height: HEIGHT, overflow: "visible" }}
      />
      <div style={{
        position: "absolute",
        bottom: 2,
        left: 0,
        right: 0,
        textAlign: "center",
        fontSize: 10,
        fontFamily: "monospace",
        color: "rgba(160,160,170,0.5)",
        pointerEvents: "none",
      }}>
        chr22 overview — drag to navigate
      </div>
    </div>
  );
}