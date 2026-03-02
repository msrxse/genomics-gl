import { useEffect, useRef, useState } from "react";
import { useGenomeWorker } from "../hooks/useGenomeWorker";
import type { Feature } from "../hooks/useGenomeWorker";
import { FeatureDetails } from "./FeatureDetails";
import { LoadingState } from "./LoadingState";
import { GenomicAxis } from "./GenomicAxis";
import { ControlPanel } from "./ControlPanel";
import { GenomeBrush } from "./GenomeBrush";
import init, { Renderer } from "/pkg/genome_engine.js";

// Mirror of the renderer's layout constants (renderer.rs)
const RULER_HEIGHT = 30;
const ROW_HEIGHT = 20;
const PADDING = 2;

function genomicToScreen(pos: number, vpStart: number, vpEnd: number, canvasWidth: number): number {
  return ((pos - vpStart) / (vpEnd - vpStart)) * canvasWidth;
}

// Mirror of pack_rows in renderer.rs — greedy row packing by feature end position.
function packRows(features: Feature[]): number[] {
  const rowEnds: number[] = [];
  return features.map(f => {
    const row = rowEnds.findIndex(end => end <= f.start);
    if (row === -1) {
      rowEnds.push(f.end);
      return rowEnds.length - 1;
    }
    rowEnds[row] = f.end;
    return row;
  });
}

export interface HoveredFeature {
  feature: Feature;
  screenX: number;
  screenY: number;
}

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
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);

  const [viewport, setViewport] = useState<Viewport>(INITIAL_VIEWPORT);
  const [wasmReady, setWasmReady] = useState(false);
  const [canvasWidth, setCanvasWidth] = useState(0);

  const { ready: workerReady, features, allFeatures, chromosomeLength, query, queryAll } = useGenomeWorker();

  // Pattern since we dont want query to be included in dependencies arrays.
  // since it comes from the worker - theres no way to memoise it.
  // Here we ensure latest is used.
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  const queryAllRef = useRef(queryAll);
  useEffect(() => {
    queryAllRef.current = queryAll;
  }, [queryAll]);

  // Fetch all features once for the GenomeBrush density overview.
  useEffect(() => {
    if (workerReady) {
      queryAllRef.current();
    }
  }, [workerReady]);

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
    setCanvasWidth(rect.width || 800);

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

  // Hover hit-test — rAF-throttled mousemove over the canvas.
  const [hoveredFeature, setHoveredFeature] = useState<HoveredFeature | null>(null);
  const featuresRef = useRef<Feature[]>([]);
  useEffect(() => { featuresRef.current = features; }, [features]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !overlay) return;

    // Match overlay pixel dimensions to the WebGL canvas on mount.
    const rect = canvas.getBoundingClientRect();
    overlay.width = canvas.width || rect.width || 800;
    overlay.height = canvas.height || rect.height || 400;

    let rafId: number | null = null;

    function onMouseMove(e: MouseEvent) {
      if (rafId !== null) return; // already scheduled
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const rect = canvas!.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const vp = viewportRef.current;
        const cw = canvas!.width;
        const ch = canvas!.height;
        const scaleX = rect.width / cw;
        const scaleY = rect.height / ch;

        const rows = packRows(featuresRef.current);
        let hit: HoveredFeature | null = null;

        for (let i = 0; i < featuresRef.current.length; i++) {
          const f = featuresRef.current[i];
          const x1 = genomicToScreen(f.start, vp.start, vp.end, cw);
          const x2 = genomicToScreen(f.end, vp.start, vp.end, cw);
          const y1 = RULER_HEIGHT + rows[i] * ROW_HEIGHT + PADDING;
          const y2 = y1 + ROW_HEIGHT - 2 * PADDING;

          if (
            mouseX >= x1 * scaleX && mouseX <= x2 * scaleX &&
            mouseY >= y1 * scaleY && mouseY <= y2 * scaleY
          ) {
            hit = { feature: f, screenX: e.clientX - rect.left, screenY: e.clientY - rect.top };

            // Draw highlight rect on the 2D overlay (in canvas pixel space)
            const ctx = overlay!.getContext('2d')!;
            ctx.clearRect(0, 0, overlay!.width, overlay!.height);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.lineWidth = 2;
            ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

            canvas!.style.cursor = 'crosshair';
            break;
          }
        }

        if (!hit) {
          overlay!.getContext('2d')!.clearRect(0, 0, overlay!.width, overlay!.height);
          canvas!.style.cursor = 'grab';
        }

        setHoveredFeature(hit);
      });
    }

    function onMouseLeave() {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      overlay!.getContext('2d')!.clearRect(0, 0, overlay!.width, overlay!.height);
      canvas!.style.cursor = 'grab';
      setHoveredFeature(null);
    }

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseleave', onMouseLeave);
    return () => {
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseleave', onMouseLeave);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

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

  function zoomBy(factor: number) {
    const vp = viewportRef.current;
    const chromLen = chromLenRef.current;
    const span = vp.end - vp.start;
    const mid = vp.start + span / 2;
    const newSpan = span * factor;
    setViewport(clampViewport(mid - newSpan / 2, mid + newSpan / 2, chromLen || span));
  }

  return (
    <div style={{ width: "100%" }}>
      <ControlPanel
        viewport={viewport}
        chromosomeLength={chromosomeLength}
        onZoomIn={() => zoomBy(0.5)}
        onZoomOut={() => zoomBy(2)}
        onReset={() => setViewport(INITIAL_VIEWPORT)}
      />
      <div style={{ position: "relative" }}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "400px", display: "block" }}
        />
        <canvas
          ref={overlayRef}
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "400px", pointerEvents: "none" }}
        />
        <GenomicAxis viewportStart={viewport.start} viewportEnd={viewport.end} width={canvasWidth} />
        <FeatureDetails hovered={hoveredFeature} />
        <LoadingState wasmReady={wasmReady} workerReady={workerReady} />
      </div>
      <GenomeBrush
        chromosomeLength={chromosomeLength}
        viewportStart={viewport.start}
        viewportEnd={viewport.end}
        allFeatures={allFeatures}
        onBrush={(start, end) => setViewport(clampViewport(start, end, chromosomeLength))}
      />
    </div>
  );
}
