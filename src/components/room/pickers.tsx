"use client";

import { useEffect, useRef, useState } from "react";
import { STICKERS } from "@/lib/stickers";
import type { GifMeta, StickerMeta } from "@/lib/types";
import { SearchIcon, XIcon } from "../icons";
import { Spinner } from "../setup-chat";

/** Popover shell: closes on Escape and outside click. */
export function Popover({
  label,
  onClose,
  children,
  className = "",
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      className={`rise absolute bottom-full left-0 z-20 mb-2 flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_20px_50px_-20px_rgba(0,0,0,0.35)] ${className}`}
    >
      {children}
    </div>
  );
}

type GifResult = GifMeta & { id: string };

export function GifPicker({ onPick, onClose }: { onPick: (g: GifMeta) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GifResult[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setState("loading");
      try {
        const res = await fetch(`/api/gifs?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "GIF search failed.");
        setResults(json.results);
        setState("ready");
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError((e as Error).message);
        setState("error");
      }
    }, q ? 300 : 0);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  return (
    <Popover label="Pick a GIF" onClose={onClose} className="h-[380px] w-[min(380px,calc(100vw-32px))]">
      <div className="flex items-center gap-2 border-b border-line p-2">
        <label className="flex min-h-10 flex-1 items-center gap-2 rounded-[10px] bg-sunk px-3 text-muted focus-within:ring-1 focus-within:ring-fg">
          <SearchIcon size={16} />
          <span className="sr-only">Search GIFs</span>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search GIFs"
            className="min-w-0 flex-1 border-0 bg-transparent text-base text-fg outline-none placeholder:text-muted"
          />
        </label>
        <button type="button" aria-label="Close GIFs" onClick={onClose} className="btn size-10 rounded-lg text-muted">
          <XIcon size={16} />
        </button>
      </div>
      <div className="scroll-thin flex-1 overflow-y-auto p-2">
        {state === "loading" && (
          <div className="flex h-full items-center justify-center text-muted">
            <Spinner />
          </div>
        )}
        {state === "error" && <p className="m-0 p-3 text-sm text-muted">{error}</p>}
        {state === "ready" && results.length === 0 && (
          <p className="m-0 p-3 text-sm text-muted">No GIFs for &ldquo;{q}&rdquo;. Try another word.</p>
        )}
        {state === "ready" && (
          <div className="columns-2 gap-2">
            {results.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => onPick({ url: g.url, preview: g.preview, width: g.width, height: g.height, title: g.title })}
                className="btn mb-2 block w-full overflow-hidden rounded-lg bg-sunk p-0"
                aria-label={g.title || "GIF"}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- third-party animated GIF */}
                <img src={g.preview ?? g.url} alt="" loading="lazy" className="block h-auto w-full" />
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="m-0 border-t border-line px-3 py-1.5 text-[11px] text-muted">Powered by GIPHY</p>
    </Popover>
  );
}

export function StickerPicker({ onPick, onClose }: { onPick: (s: StickerMeta) => void; onClose: () => void }) {
  return (
    <Popover label="Pick a sticker" onClose={onClose} className="w-[min(340px,calc(100vw-32px))]">
      <div className="grid grid-cols-4 gap-1.5 p-2.5">
        {STICKERS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s)}
            aria-label={`Send the ${s.label} sticker`}
            className="btn row aspect-square rounded-xl p-1.5"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- local SVG sticker */}
            <img src={s.src} alt="" className="size-full" />
          </button>
        ))}
      </div>
    </Popover>
  );
}
