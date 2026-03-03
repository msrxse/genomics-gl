import { Button } from "@/components/ui/button";

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
  onPanLeft: () => void;
  onPanRight: () => void;
}

function formatBp(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} Mb`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} kb`;
  return `${n} bp`;
}

export function ControlPanel({
  viewport,
  chromosomeLength,
  onZoomIn,
  onZoomOut,
  onReset,
  onPanLeft,
  onPanRight,
}: Props) {
  const span = viewport.end - viewport.start;

  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 bg-[rgba(18,18,24,0.95)] text-xs font-mono text-[#b0b0b8] select-none">
      <Button variant="outline" size="icon" onClick={onPanLeft}  title="Pan left">◀</Button>
      <Button variant="outline" size="icon" onClick={onPanRight} title="Pan right">▶</Button>
      <div className="w-px h-5 bg-white/15 mx-1" />
      <Button variant="outline" size="icon" onClick={onZoomIn}   title="Zoom in">+</Button>
      <Button variant="outline" size="icon" onClick={onZoomOut}  title="Zoom out">−</Button>
      <div className="w-px h-5 bg-white/15 mx-1" />
      <Button variant="outline" size="icon" onClick={onReset}    title="Reset view">⟳</Button>
      <span className="ml-2">
        chr22:{" "}
        <span className="text-[#e0e0e0]">
          {viewport.start.toLocaleString()} – {viewport.end.toLocaleString()}
        </span>{" "}
        ({formatBp(span)})
      </span>
      {chromosomeLength > 0 && (
        <span className="ml-auto opacity-50">
          chr22 length: {formatBp(chromosomeLength)}
        </span>
      )}
    </div>
  );
}
