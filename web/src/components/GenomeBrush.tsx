import { useEffect, useRef } from "react";
import { axisBottom } from "d3-axis";
import { scaleLinear } from "d3-scale";
import { brushX, type BrushBehavior, type D3BrushEvent } from "d3-brush";
import { select } from "d3-selection";
import "d3-transition";
import type { Feature } from "../hooks/useGenomeWorker";

interface Props {
  chromosomeLength: number;
  viewportStart: number;
  viewportEnd: number;
  allFeatures: Feature[];
  onBrush: (start: number, end: number) => void;
}

const AXIS_HEIGHT = 18;
const DENSITY_HEIGHT = 32;
const BRUSH_HEIGHT = 48;
const HEIGHT = AXIS_HEIGHT + BRUSH_HEIGHT;
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

  // Draw axis + density bars + init brush on first render (or when chromLen/features change).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || chromosomeLength === 0) return;

    const width = svg.getBoundingClientRect().width || 800;
    widthRef.current = width;

    const xScale = scaleLinear().domain([0, chromosomeLength]).range([0, width]);

    const g = select(svg);
    g.selectAll("*").remove();

    // --- Top axis (full chromosome coordinates) ---
    const axisScale = scaleLinear().domain([0, chromosomeLength]).range([0, width]);
    const axis = axisBottom(axisScale)
      .ticks(6)
      .tickFormat((d) => {
        const v = +d;
        if (chromosomeLength >= 1_000_000) return `${(v / 1_000_000).toFixed(0)} Mb`;
        if (chromosomeLength >= 1_000) return `${(v / 1_000).toFixed(0)} kb`;
        return `${v}`;
      });

    const axisG = g.append("g").attr("transform", `translate(0, ${AXIS_HEIGHT - 2})`);
    axisG.call(axis);
    axisG.select(".domain").attr("stroke", "rgba(255,255,255,0.15)");
    axisG.selectAll(".tick line").attr("stroke", "rgba(255,255,255,0.25)");
    axisG.selectAll(".tick text")
      .attr("fill", "rgba(160,160,170,0.7)")
      .attr("font-size", "10px")
      .attr("font-family", "monospace");

    // --- Density background (shifted below axis) ---
    if (allFeatures.length > 0) {
      const counts = buildDensity(allFeatures, chromosomeLength, NUM_BINS);
      const maxCount = Math.max(...counts, 1);
      const binPx = width / NUM_BINS;

      const densityG = g.append("g").attr("class", "density").attr("transform", `translate(0, ${AXIS_HEIGHT})`);
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

    // --- Brush (shifted below axis) ---
    const brush = brushX<unknown>()
      .extent([
        [0, AXIS_HEIGHT],
        [width, AXIS_HEIGHT + BRUSH_HEIGHT],
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
        style={{ display: "block", width: "100%", height: HEIGHT }}
      />
    </div>
  );
}
