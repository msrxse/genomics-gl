import { useEffect, useRef, useState } from "react";
import { useGenomeWorker } from "../hooks/useGenomeWorker";
import init, { Renderer } from "/pkg/genome_engine.js";

interface Viewport {
  start: number;
  end: number;
}

const INITIAL_VIEWPORT: Viewport = { start: 17_000_000, end: 30_000_000 };
const MIN_SPAN = 500;

function clampViewport(start: number, end: number, chromLen: number): Viewport {
  let span = end - start;
  span = Math.max(MIN_SPAN, Math.min(span, chromLen));
  const s = Math.max(0, Math.min(start, chromLen - span));
  return { start: Math.round(s), end: Math.round(s + span) };
}

export function GenomeBrowserView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);

  const [viewport, setViewport] = useState<Viewport>(INITIAL_VIEWPORT);
  const [wasmReady, setWasmReady] = useState(false);

  const { ready: workerReady, features, chromosomeLength, query } = useGenomeWorker();

  // Pattern since we dont want query to be included in dependencies arrays.
  // since it comes from the worker - theres no way to memoise it.
  // Here we ensure latest is used.
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  // Initialize Wasm and create the Renderer once on mount.
  // The isMounted flag guards against StrictMode's double-invoke: if the effect
  // is cleaned up before init() resolves, the stale callback is a no-op.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas pixel dimensions to match its CSS-laid-out size.
    // Must be done after layout; getBoundingClientRect() is reliable here.
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width || 800;
    canvas.height = rect.height || 400;

    let isMounted = true;

    init().then(() => {
      if (!isMounted) return;
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
      isMounted = false;
      rendererRef.current = null;
    };
  }, []);

  // Query the worker whenever the viewport changes (or when the worker first becomes ready).
  useEffect(() => {
    if (workerReady) {
      queryRef.current(viewport.start, viewport.end);
    }
  }, [workerReady, viewport]);

  // Zoom centered on cursor position.
  // Attached manually (not via React onWheel) so we can pass { passive: false }
  // and call preventDefault() to prevent the page from scrolling while zooming.
  const viewportRef = useRef(viewport);
  useEffect(() => { viewportRef.current = viewport; }, [viewport]);
  const chromLenRef = useRef(chromosomeLength);
  useEffect(() => { chromLenRef.current = chromosomeLength; }, [chromosomeLength]);

  // Pan by click+drag. Track the genomic position under the cursor on mousedown,
  // then shift the viewport so that position stays under the cursor as it moves.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let dragStartX: number | null = null;
    let dragStartVp: { start: number; end: number } | null = null;

    function onMouseDown(e: MouseEvent) {
      dragStartX = e.clientX;
      dragStartVp = { ...viewportRef.current };
      canvas!.style.cursor = 'grabbing';
    }

    function onMouseMove(e: MouseEvent) {
      if (dragStartX === null || dragStartVp === null) return;
      const vp = dragStartVp;
      const span = vp.end - vp.start;
      const bpPerPixel = span / canvas!.getBoundingClientRect().width;
      const deltaBp = (e.clientX - dragStartX) * bpPerPixel;
      const chromLen = chromLenRef.current;
      setViewport(clampViewport(vp.start - deltaBp, vp.end - deltaBp, chromLen || span));
    }

    function onMouseUp() {
      dragStartX = null;
      dragStartVp = null;
      canvas!.style.cursor = 'grab';
    }

    canvas.style.cursor = 'grab';
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const chromLen = chromLenRef.current;
      if (chromLen === 0) return;

      const rect = canvas!.getBoundingClientRect();
      const cursorFraction = (e.clientX - rect.left) / rect.width;
      const vp = viewportRef.current;
      const span = vp.end - vp.start;
      const genomicCursor = vp.start + cursorFraction * span;

      const zoomFactor = e.deltaY > 0 ? 1.2 : 0.8;
      const newSpan = span * zoomFactor;
      const newStart = genomicCursor - cursorFraction * newSpan;

      setViewport(clampViewport(newStart, newStart + newSpan, chromLen));
    }

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  // Re-render when features or wasm readiness changes
  useEffect(() => {
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    if (!renderer || !canvas || !wasmReady) return;
    if (canvas.width === 0 || canvas.height === 0) return;

    try {
      renderer.render(features, viewport.start, viewport.end, canvas.width, canvas.height);
    } catch (e) {
      console.error("render() failed:", e);
    }
  }, [features, wasmReady, viewport]);

  const span = viewport.end - viewport.start;
  const scrollMax = Math.max(0, (chromosomeLength || span) - span);

  // Scrollbar pans by shifting start while keeping the current span fixed.
  function onScroll(e: React.ChangeEvent<HTMLInputElement>) {
    const newStart = Number(e.target.value);
    setViewport({ start: newStart, end: newStart + span });
  }

  return (
    <div style={{ width: "100%" }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "400px", display: "block" }}
      />
      <input
        type="range"
        min={0}
        max={scrollMax}
        value={viewport.start}
        onChange={onScroll}
        style={{ width: "100%", margin: 0, display: "block" }}
      />
    </div>
  );
}
