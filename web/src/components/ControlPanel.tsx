import type React from "react";

interface Viewport {
  start: number;
  end: number;
}

interface Props {
  viewport: Viewport;
  chromosomeLength: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}

function formatBp(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} Mb`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)} kb`;
  return `${n} bp`;
}

export function ControlPanel({ viewport, chromosomeLength, onZoomIn, onZoomOut, onReset }: Props) {
  const span = viewport.end - viewport.start;

  const btnStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.15)",
    color: "#e0e0e0",
    borderRadius: 4,
    padding: "3px 10px",
    cursor: "pointer",
    fontSize: 14,
    lineHeight: 1,
  };

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 10px",
      background: "rgba(18,18,24,0.95)",
      borderTop: "1px solid rgba(255,255,255,0.08)",
      fontSize: 12,
      fontFamily: "monospace",
      color: "#b0b0b8",
      userSelect: "none",
    }}>
      <button style={btnStyle} onClick={onZoomIn}  title="Zoom in">+</button>
      <button style={btnStyle} onClick={onZoomOut} title="Zoom out">−</button>
      <button style={btnStyle} onClick={onReset}   title="Reset view">⟳</button>
      <span style={{ marginLeft: 8 }}>
        chr22:{" "}
        <span style={{ color: "#e0e0e0" }}>
          {viewport.start.toLocaleString()} – {viewport.end.toLocaleString()}
        </span>
        {" "}({formatBp(span)})
      </span>
      {chromosomeLength > 0 && (
        <span style={{ marginLeft: "auto", opacity: 0.5 }}>
          chr22 length: {formatBp(chromosomeLength)}
        </span>
      )}
    </div>
  );
}