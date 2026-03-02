import type { HoveredFeature } from "./GenomeBrowserView";

interface Props {
  hovered: HoveredFeature | null;
}

export function FeatureDetails({ hovered }: Props) {
  if (!hovered) return null;

  const { feature, screenX, screenY } = hovered;
  const strand = feature.strand === "Plus" ? "+" : feature.strand === "Minus" ? "−" : "?";

  return (
    <div
      style={{
        position: "absolute",
        left: screenX + 12,
        top: screenY + 12,
        background: "rgba(20, 20, 28, 0.92)",
        color: "#e0e0e0",
        border: "1px solid #444",
        borderRadius: 4,
        padding: "6px 10px",
        fontSize: 12,
        lineHeight: 1.6,
        pointerEvents: "none",
        whiteSpace: "nowrap",
        zIndex: 10,
      }}
    >
      <strong>{feature.name}</strong>
      <br />
      {feature.start.toLocaleString()}–{feature.end.toLocaleString()} bp
      <br />
      strand: {strand}
    </div>
  );
}