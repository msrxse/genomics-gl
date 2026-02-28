import { useEffect, useRef, useState } from "react";
import { useGenomeWorker } from "../hooks/useGenomeWorker";
import init, { Renderer } from "/pkg/genome_engine.js";

interface Viewport {
  start: number;
  end: number;
}

const INITIAL_VIEWPORT: Viewport = { start: 50_000_000, end: 51_000_000 };

export function GenomeBrowserView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const viewportRef = useRef<Viewport>(INITIAL_VIEWPORT);

  const [wasmReady, setWasmReady] = useState(false);

  const { ready: workerReady, features, query } = useGenomeWorker();

  // Pattern since we dont want query to be included in dependencies arrays.
  // since it comes form the worker - theres no way to memoise it. Here we ensure latests is used
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  // Initialize Wasm and create the Renderer once on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = canvas.offsetWidth || 800;
    canvas.height = canvas.offsetHeight || 400;

    init('/genome_engine_bg.wasm').then(() => {
      const gl = canvas.getContext("webgl");
      if (!gl) {
        console.error("WebGL not supported");
        return;
      }
      try {
        rendererRef.current = new Renderer(gl);
        setWasmReady(true);
      } catch (e) {
        console.error("Renderer init failed:", e);
      }
    });

    return () => {
      rendererRef.current = null;
    };
  }, []);

  // Fire initial query once the worker is ready
  useEffect(() => {
    if (workerReady) {
      queryRef.current(INITIAL_VIEWPORT.start, INITIAL_VIEWPORT.end);
    }
  }, [workerReady]);

  // Re-render when features or wasm readiness changes
  useEffect(() => {
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    if (!renderer || !canvas || !wasmReady) return;
    if (canvas.width === 0 || canvas.height === 0) return;

    const vp = viewportRef.current;
    try {
      renderer.render(features, vp.start, vp.end, canvas.width, canvas.height);
    } catch (e) {
      console.error("render() failed:", e);
    }
  }, [features, wasmReady]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "400px", display: "block" }}
    />
  );
}
