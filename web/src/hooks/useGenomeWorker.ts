// Typed React hook wrapping the genome WebWorker.
import { useCallback, useEffect, useRef, useState } from 'react';

export interface Feature {
  chrom: string;
  start: number;
  end: number;
  name: string;
  strand: 'Plus' | 'Minus' | 'Unknown';
}

interface WorkerState {
  ready: boolean;
  chromosomeLength: number;
  features: Feature[];
  allFeatures: Feature[];
}

export function useGenomeWorker() {
  const workerRef = useRef<Worker | null>(null);
  const [state, setState] = useState<WorkerState>({
    ready: false,
    chromosomeLength: 0,
    features: [],
    allFeatures: [],
  });

  useEffect(() => {
    const worker = new Worker(
      new URL('../workers/genome.worker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as WorkerResponse;
      if (msg.type === 'ready') {
        setState(s => ({ ...s, ready: true, chromosomeLength: msg.chromosomeLength }));
      } else if (msg.type === 'result') {
        setState(s => ({ ...s, features: msg.features }));
      } else if (msg.type === 'allFeatures') {
        setState(s => ({ ...s, allFeatures: msg.features }));
      }
    };

    workerRef.current = worker;

    // Load the BED file once the worker is up
    fetch('/data/sample.bed')
      .then(r => r.arrayBuffer())
      .then(buf => worker.postMessage({ type: 'load', data: buf }, [buf]));

    return () => worker.terminate();
  }, []);

  const query = useCallback((start: number, end: number) => {
    workerRef.current?.postMessage({ type: 'query', start, end });
  }, []);

  const queryAll = useCallback(() => {
    workerRef.current?.postMessage({ type: 'queryAll' });
  }, []);

  return { ...state, query, queryAll };
}

// --- Types ---

type WorkerResponse =
  | { type: 'ready'; chromosomeLength: number }
  | { type: 'result'; features: Feature[] }
  | { type: 'allFeatures'; features: Feature[] };
