interface Props {
  wasmReady: boolean;
  workerReady: boolean;
}

export function LoadingState({ wasmReady, workerReady }: Props) {
  if (wasmReady && workerReady) return null;

  const message = !wasmReady ? "Initialising WebAssembly…" : "Parsing genome data…";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(12, 12, 16, 0.75)",
        color: "#e0e0e0",
        fontSize: 14,
        letterSpacing: "0.03em",
        pointerEvents: "none",
        zIndex: 20,
      }}
    >
      {message}
    </div>
  );
}