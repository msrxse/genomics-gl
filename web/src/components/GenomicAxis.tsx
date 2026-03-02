import { axisBottom } from "d3-axis";
import { scaleLinear } from "d3-scale";
import { select } from "d3-selection";
import "d3-transition"; // augments Selection with .transition()
import { useEffect, useRef } from "react";

// Must match renderer.rs RULER_HEIGHT constant.
const RULER_HEIGHT = 25;

interface Props {
  viewportStart: number;
  viewportEnd: number;
  width: number; // canvas CSS pixel width
}

export function GenomicAxis({ viewportStart, viewportEnd, width }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || width <= 0 || viewportEnd <= viewportStart) return;

    const scale = scaleLinear()
      .domain([viewportStart, viewportEnd])
      .range([0, width]);

    // Format ticks as Mb with one decimal place when >= 1 Mb, otherwise kb.
    const span = viewportEnd - viewportStart;
    const tickFormat = (d: number | { valueOf(): number }) => {
      const v = +d;
      if (span >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} Mb`;
      if (span >= 1_000) return `${(v / 1_000).toFixed(1)} kb`;
      return `${v} bp`;
    };

    const axis = axisBottom(scale).ticks(6).tickFormat(tickFormat);

    const g = select(svg).select<SVGGElement>("g");

    // Animate ticks sliding to new positions on each viewport change.
    g.transition().duration(200).call(axis);

    // Style: mute the default D3 domain line, keep ticks subtle.
    g.select(".domain").attr("stroke", "rgba(255,255,255,0.2)");
    g.selectAll(".tick line").attr("stroke", "rgba(255,255,255,0.4)");
    g.selectAll(".tick text")
      .attr("fill", "#b0b0b8")
      .attr("font-size", "11px")
      .attr("font-family", "monospace");
  }, [viewportStart, viewportEnd, width]);

  return (
    <svg
      ref={svgRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: `${RULER_HEIGHT}px`,
        pointerEvents: "none",
        overflow: "visible",
      }}
    >
      {/* translate down so tick labels sit within the ruler bar */}
      <g transform={`translate(0, ${RULER_HEIGHT - 14})`} />
    </svg>
  );
}
