import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { Feature } from "../hooks/useGenomeWorker";
import { useGenomeWorker } from "../hooks/useGenomeWorker";
import { ControlPanel } from "./ControlPanel";
import { FeatureDetails } from "./FeatureDetails";
import { GenomeBrush } from "./GenomeBrush";
import { GenomicAxis } from "./GenomicAxis";
import { GeneSearch } from "./GeneSearch";
import { LoadingState } from "./LoadingState";
import init, { Renderer } from "/pkg/genome_engine.js";

// Mirror of the renderer's layout constants (renderer.rs)
const RULER_HEIGHT = 30;
const ROW_HEIGHT = 20;
const PADDING = 2;

function genomicToScreen(
  pos: number,
  vpStart: number,
  vpEnd: number,
  canvasWidth: number,
): number {
  return ((pos - vpStart) / (vpEnd - vpStart)) * canvasWidth;
}

// Mirror of pack_rows in renderer.rs — greedy row packing by feature end position.
function packRows(features: Feature[]): number[] {
  const rowEnds: number[] = [];
  return features.map((f) => {
    const row = rowEnds.findIndex((end) => end <= f.start);
    if (row === -1) {
      rowEnds.push(f.end);
      return rowEnds.length - 1;
    }
    rowEnds[row] = f.end;
    return row;
  });
}

function truncateToFit(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0,
    hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(text.slice(0, mid) + "…").width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo === 0 ? "" : text.slice(0, lo) + "…";
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
  const annotationRef = useRef<HTMLCanvasElement>(null); // strand arrows + gene labels
  const overlayRef = useRef<HTMLCanvasElement>(null); // hover highlight only
  const rendererRef = useRef<Renderer | null>(null);
  const highlightedFeatureRef = useRef<Feature | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [viewport, setViewport] = useState<Viewport>(INITIAL_VIEWPORT);
  const [wasmReady, setWasmReady] = useState(false);
  const [canvasWidth, setCanvasWidth] = useState(0);
  const [hoveredFeature, setHoveredFeature] = useState<HoveredFeature | null>(
    null,
  );

  const {
    ready: workerReady,
    features,
    allFeatures,
    chromosomeLength,
    query,
    queryAll,
  } = useGenomeWorker();

  /**
   * Query the worker whenever the viewport changes
   * (or when the worker first becomes ready).
   */
  useEffect(() => {
    if (workerReady) {
      query(viewport.start, viewport.end);
    }
  }, [workerReady, viewport, query]);

  /**
   * Fetch all features once for the GenomeBrush density overview.
   */
  useEffect(() => {
    if (workerReady) {
      queryAll();
    }
  }, [workerReady, queryAll]);

  /**
   * Initialize Wasm and create the Renderer once on mount.
   * The isMounted flag guards against StrictMode's double-invoke: if the effect
   * is cleaned up before init() resolves, the stale callback is a no-op.
   */
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

  const onHoverMove = useEffectEvent(
    (e: MouseEvent, canvas: HTMLCanvasElement, overlay: HTMLCanvasElement) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const cw = canvas.width;
      const scaleX = rect.width / cw;
      const scaleY = rect.height / canvas.height;

      const rows = packRows(features);
      let hit: HoveredFeature | null = null;

      for (let i = 0; i < features.length; i++) {
        const f = features[i];
        const x1 = genomicToScreen(f.start, viewport.start, viewport.end, cw);
        const x2 = genomicToScreen(f.end, viewport.start, viewport.end, cw);
        const y1 = RULER_HEIGHT + rows[i] * ROW_HEIGHT + PADDING;
        const y2 = y1 + ROW_HEIGHT - 2 * PADDING;

        if (
          mouseX >= x1 * scaleX &&
          mouseX <= x2 * scaleX &&
          mouseY >= y1 * scaleY &&
          mouseY <= y2 * scaleY
        ) {
          hit = {
            feature: f,
            screenX: e.clientX - rect.left,
            screenY: e.clientY - rect.top,
          };

          const ctx = overlay.getContext("2d")!;
          ctx.clearRect(0, 0, overlay.width, overlay.height);
          ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
          ctx.lineWidth = 2;
          ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

          canvas.style.cursor = "crosshair";
          break;
        }
      }

      if (!hit) {
        overlay
          .getContext("2d")!
          .clearRect(0, 0, overlay.width, overlay.height);
        canvas.style.cursor = "grab";
      }

      setHoveredFeature(hit);
    },
  );

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
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        onHoverMove(e, canvas!, overlay!);
      });
    }

    function onMouseLeave() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      overlay!
        .getContext("2d")!
        .clearRect(0, 0, overlay!.width, overlay!.height);
      canvas!.style.cursor = "grab";
      setHoveredFeature(null);
    }

    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseleave", onMouseLeave);
    return () => {
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  // Pan by click+drag. Track the genomic position under the cursor on mousedown,
  // then shift the viewport so that position stays under the cursor as it moves.
  const onDragMove = useEffectEvent(
    (
      e: MouseEvent,
      dragStartX: number,
      dragStartVp: Viewport,
      canvasWidth: number,
    ) => {
      const span = dragStartVp.end - dragStartVp.start;
      const bpPerPixel = span / canvasWidth;
      const deltaBp = (e.clientX - dragStartX) * bpPerPixel;
      setViewport(
        clampViewport(
          dragStartVp.start - deltaBp,
          dragStartVp.end - deltaBp,
          chromosomeLength || span,
        ),
      );
    },
  );

  const onDragStart = useEffectEvent((e: MouseEvent) => ({
    startX: e.clientX,
    startVp: { ...viewport },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let dragStartX: number | null = null;
    let dragStartVp: Viewport | null = null;

    function onMouseDown(e: MouseEvent) {
      const { startX, startVp } = onDragStart(e);
      dragStartX = startX;
      dragStartVp = startVp;
      canvas!.style.cursor = "grabbing";
    }

    function onMouseMove(e: MouseEvent) {
      if (dragStartX === null || dragStartVp === null) return;
      onDragMove(
        e,
        dragStartX,
        dragStartVp,
        canvas!.getBoundingClientRect().width,
      );
    }

    function onMouseUp() {
      dragStartX = null;
      dragStartVp = null;
      canvas!.style.cursor = "grab";
    }

    canvas.style.cursor = "grab";
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const onWheel = useEffectEvent((e: WheelEvent, canvas: HTMLCanvasElement) => {
    e.preventDefault();
    if (chromosomeLength === 0) return;

    const rect = canvas.getBoundingClientRect();
    const cursorFraction = (e.clientX - rect.left) / rect.width;
    const span = viewport.end - viewport.start;
    const genomicCursor = viewport.start + cursorFraction * span;

    const zoomFactor = e.deltaY > 0 ? 1.2 : 0.8;
    const newSpan = span * zoomFactor;
    const newStart = genomicCursor - cursorFraction * newSpan;

    setViewport(clampViewport(newStart, newStart + newSpan, chromosomeLength));
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function handleWheel(e: WheelEvent) {
      onWheel(e, canvas!);
    }

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, []);

  // Re-render when features or wasm readiness changes
  useEffect(() => {
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    if (!renderer || !canvas || !wasmReady) return;
    if (canvas.width === 0 || canvas.height === 0) return;

    try {
      renderer.render(
        features,
        viewport.start,
        viewport.end,
        canvas.width,
        canvas.height,
      );
    } catch (e) {
      console.error("render() failed:", e);
    }
  }, [features, wasmReady, viewport]);

  // Draw strand arrows on the annotation canvas whenever features or viewport change.
  useEffect(() => {
    const canvas = canvasRef.current;
    const annotation = annotationRef.current;
    if (!canvas || !annotation || features.length === 0) return;

    const cw = canvas.width;
    const ch = canvas.height;
    if (cw === 0 || ch === 0) return;

    annotation.width = cw;
    annotation.height = ch;

    const ctx = annotation.getContext("2d")!;
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.font = "13px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const rows = packRows(features);

    for (let i = 0; i < features.length; i++) {
      const f = features[i];
      const x1 = genomicToScreen(f.start, viewport.start, viewport.end, cw);
      const x2 = genomicToScreen(f.end, viewport.start, viewport.end, cw);
      const screenWidth = x2 - x1;
      if (screenWidth <= 20) continue;

      const y1 = RULER_HEIGHT + rows[i] * ROW_HEIGHT + PADDING;
      const y2 = y1 + ROW_HEIGHT - 2 * PADDING;
      const cy = (y1 + y2) / 2;
      const cx = (x1 + x2) / 2;

      const arrow =
        f.strand === "Plus" ? "▶" : f.strand === "Minus" ? "◀" : null;

      if (screenWidth > 60 && arrow) {
        // Label mode: prefixed arrow + gene name, clipped to block bounds.
        const label = `${arrow} ${f.name}`;
        const truncated = truncateToFit(ctx, label, screenWidth - 6);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x1, y1, screenWidth, y2 - y1);
        ctx.clip();
        ctx.fillText(truncated, cx, cy);
        ctx.restore();
      } else if (arrow) {
        ctx.fillText(arrow, cx, cy);
      }

      // Highlight ring for search-jumped feature
      const hl = highlightedFeatureRef.current;
      if (hl && f.name === hl.name && f.start === hl.start) {
        ctx.save();
        ctx.strokeStyle = "rgba(250, 200, 80, 0.95)";
        ctx.lineWidth = 2.5;
        ctx.shadowColor = "rgba(250, 200, 80, 0.6)";
        ctx.shadowBlur = 6;
        ctx.strokeRect(x1 + 1, y1 + 1, x2 - x1 - 2, y2 - y1 - 2);
        ctx.restore();
      }
    }
  }, [features, viewport]);

  function zoomBy(factor: number) {
    const span = viewport.end - viewport.start;
    const mid = viewport.start + span / 2;
    const newSpan = span * factor;
    setViewport(
      clampViewport(
        mid - newSpan / 2,
        mid + newSpan / 2,
        chromosomeLength || span,
      ),
    );
  }

  const savedViewportRef = useRef<Viewport | null>(null);

  function jumpTo(start: number, end: number, feature?: Feature) {
    savedViewportRef.current = null;
    setViewport(clampViewport(start, end, chromosomeLength));
    if (feature) {
      highlightedFeatureRef.current = feature;
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => {
        highlightedFeatureRef.current = null;
      }, 1500);
    }
  }

  function previewViewport(start: number, end: number, feature?: Feature) {
    if (!savedViewportRef.current) savedViewportRef.current = viewport;
    setViewport(clampViewport(start, end, chromosomeLength));
    if (feature) highlightedFeatureRef.current = feature;
  }

  function cancelPreview() {
    if (savedViewportRef.current) {
      setViewport(savedViewportRef.current);
      savedViewportRef.current = null;
    }
    highlightedFeatureRef.current = null;
  }

  function panBy(fraction: number) {
    const span = viewport.end - viewport.start;
    const delta = span * fraction;
    setViewport(
      clampViewport(
        viewport.start + delta,
        viewport.end + delta,
        chromosomeLength || span,
      ),
    );
  }

  return (
    <div className="w-full border border-white/[0.07] rounded-md overflow-hidden">
      <div className="flex items-center gap-3 px-2.5 py-1.5 bg-[rgba(18,18,24,0.95)] border-b border-white/[0.07]">
        <GeneSearch
          allFeatures={allFeatures}
          chromosomeLength={chromosomeLength}
          onJump={jumpTo}
          onPreview={(s, e, f) => previewViewport(s, e, f)}
          onCancelPreview={cancelPreview}
        />
      </div>
      <ControlPanel
        viewport={viewport}
        chromosomeLength={chromosomeLength}
        onZoomIn={() => zoomBy(0.5)}
        onZoomOut={() => zoomBy(2)}
        onReset={() => setViewport(INITIAL_VIEWPORT)}
        onPanLeft={() => panBy(-0.2)}
        onPanRight={() => panBy(0.2)}
      />
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="block w-full h-100"
        />
        <canvas
          ref={annotationRef}
          className="absolute inset-0 w-full h-100 pointer-events-none"
        />
        <canvas
          ref={overlayRef}
          className="absolute inset-0 w-full h-100 pointer-events-none"
        />
        <GenomicAxis
          viewportStart={viewport.start}
          viewportEnd={viewport.end}
          width={canvasWidth}
        />
        <FeatureDetails hovered={hoveredFeature} />
        <LoadingState wasmReady={wasmReady} workerReady={workerReady} />
      </div>
      <GenomeBrush
        chromosomeLength={chromosomeLength}
        viewportStart={viewport.start}
        viewportEnd={viewport.end}
        allFeatures={allFeatures}
        onBrush={(start, end) =>
          setViewport(clampViewport(start, end, chromosomeLength))
        }
      />
    </div>
  );
}
