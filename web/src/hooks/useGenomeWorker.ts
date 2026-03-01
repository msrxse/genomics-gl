// Typed React hook wrapping the genome WebWorker.
import { useEffect, useRef, useState } from 'react';

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
}

export function useGenomeWorker() {
  const workerRef = useRef<Worker | null>(null);
  const [state, setState] = useState<WorkerState>({
    ready: false,
    chromosomeLength: 0,
    features: [],
  });

  useEffect(() => {
    const worker = new Worker(
      new URL('./genome.worker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as WorkerResponse;
      if (msg.type === 'ready') {
        setState(s => ({ ...s, ready: true, chromosomeLength: msg.chromosomeLength }));
      } else if (msg.type === 'result') {
        setState(s => ({ ...s, features: msg.features }));
      }
    };

    workerRef.current = worker;

    // Load the BED file once the worker is up
    fetch('/data/sample.bed')
      .then(r => r.arrayBuffer())
      .then(buf => worker.postMessage({ type: 'load', data: buf }, [buf]));

    return () => worker.terminate();
  }, []);

  function query(start: number, end: number) {
    workerRef.current?.postMessage({ type: 'query', start, end });
  }

  return { ...state, query };
}

// --- Types ---

type WorkerResponse =
  | { type: 'ready'; chromosomeLength: number }
  | { type: 'result'; features: Feature[] };
