import { useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import type { Feature } from "../hooks/useGenomeWorker";

interface Props {
  allFeatures: Feature[];
  chromosomeLength: number;
  onJump: (start: number, end: number, feature?: Feature) => void;
  onPreview: (start: number, end: number, feature?: Feature) => void;
  onCancelPreview: () => void;
}

function parseCoords(raw: string): [number, number] | null {
  const s = raw.replace(/,/g, "").replace(/^chr\w+:/i, "").trim();
  const m = s.match(/^(\d+)[-–](\d+)$/);
  if (!m) return null;
  let start = parseInt(m[1], 10);
  let end = parseInt(m[2], 10);
  if (isNaN(start) || isNaN(end) || start === end) return null;
  if (start > end) [start, end] = [end, start];
  return [start, end];
}

const MAX_RESULTS = 50;

export function GeneSearch({ allFeatures, chromosomeLength, onJump, onPreview, onCancelPreview }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = query.trim();
  const looksLikeCoords = parseCoords(trimmed) !== null || /\d.*[-–]\d/.test(trimmed);

  const filtered =
    !looksLikeCoords && trimmed.length >= 2
      ? allFeatures
          .filter((f) => f.name.toLowerCase().includes(trimmed.toLowerCase()))
          .slice(0, MAX_RESULTS)
      : [];

  function handleSelect(feature: Feature) {
    setQuery("");
    setOpen(false);
    setError(null);
    onJump(feature.start, feature.end, feature);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    setError(null);

    const coords = parseCoords(trimmed);
    if (coords) {
      const [start, end] = coords;
      if (chromosomeLength > 0 && (start < 0 || end > chromosomeLength)) {
        setError(`Out of range (0 – ${chromosomeLength.toLocaleString()})`);
        return;
      }
      setQuery("");
      setOpen(false);
      onJump(start, end);
      return;
    }

    if (/\d.*[-–]\d/.test(trimmed)) {
      setError("Invalid coordinate format. Try: 29000000-30000000");
    }
  }

  return (
    <div className="relative w-72 font-mono text-xs">
      <Popover open={open} onOpenChange={setOpen}>
        <Command shouldFilter={false}>
          <PopoverAnchor asChild>
            <CommandInput
              placeholder="Gene name or coords…"
              value={query}
              onValueChange={(v) => {
                setQuery(v);
                setError(null);
                const t = v.trim();
                const isCoords = parseCoords(t) !== null || /\d.*[-–]\d/.test(t);
                setOpen(t.length >= 2 && !isCoords);
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => { if (trimmed.length >= 2) setOpen(true); }}
              className="text-xs font-mono rounded-md border border-white/[0.07] bg-[rgba(18,18,24,0.95)] h-8"
            />
          </PopoverAnchor>
          <PopoverContent
            className="w-72 p-0 bg-[rgba(18,18,24,0.98)] border-white/[0.07]"
            align="start"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onInteractOutside={() => { onCancelPreview(); setOpen(false); }}
            onEscapeKeyDown={() => { onCancelPreview(); setOpen(false); }}
          >
            <CommandList>
              {filtered.length === 0 ? (
                <CommandEmpty className="text-xs py-3">No genes found.</CommandEmpty>
              ) : (
                <CommandGroup>
                  {filtered.map((f, i) => (
                    <CommandItem
                      key={`${f.name}-${f.start}-${i}`}
                      value={`${f.name}-${f.start}-${i}`}
                      onSelect={() => handleSelect(f)}
                      onMouseEnter={() => onPreview(f.start, f.end, f)}
                      onMouseLeave={() => onCancelPreview()}
                      className="text-xs font-mono cursor-pointer"
                    >
                      <span className="text-[#e0e0e0]">{f.name}</span>
                      <span className="ml-auto text-white/30">
                        {(f.start / 1_000_000).toFixed(2)} Mb
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </PopoverContent>
        </Command>
      </Popover>
      {error && (
        <p className="absolute top-full mt-1 left-0 text-[11px] text-red-400 font-mono px-1">
          {error}
        </p>
      )}
    </div>
  );
}
