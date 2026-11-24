"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { initials } from "@/lib/utils";

/** Calm mode, shared from the app shell so avatars can stop animating. */
export const CalmContext = createContext(false);

const isGif = (url: string) => /\.gif($|\?)/i.test(url);

/**
 * A round profile photo with an initials fallback. In calm mode animated GIFs
 * are frozen on their first frame.
 */
export function Avatar({
  name,
  url,
  size = 36,
  tone = "sunk",
  className = "",
  animate,
}: {
  name: string;
  url?: string | null;
  size?: number;
  tone?: "sunk" | "inv";
  className?: string;
  /** Force animation on (e.g. the settings preview) regardless of calm mode. */
  animate?: boolean;
}) {
  const calm = useContext(CalmContext);
  const [broken, setBroken] = useState<string | null>(null);
  const freeze = Boolean(url && isGif(url) && calm && !animate);
  const showImage = url && broken !== url;
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) };

  return (
    <span
      aria-hidden="true"
      style={style}
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold ${
        tone === "inv" ? "bg-inv text-inv-fg" : "bg-sunk text-fg"
      } ${className}`}
    >
      {initials(name)}
      {showImage &&
        (freeze ? (
          <FrozenImage url={url} size={size} onError={() => setBroken(url)} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            width={size}
            height={size}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setBroken(url)}
            className="absolute inset-0 size-full object-cover"
          />
        ))}
    </span>
  );
}

/** Draws the first frame of a GIF onto a canvas so it stays still. */
function FrozenImage({ url, size, onError }: { url: string; size: number; onError: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const failed = useRef(onError);
  useEffect(() => {
    failed.current = onError;
  });
  useEffect(() => {
    const img = new Image();
    img.referrerPolicy = "no-referrer";
    img.onload = () => {
      const c = ref.current;
      const ctx = c?.getContext("2d");
      if (!c || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      c.width = size * dpr;
      c.height = size * dpr;
      const s = Math.min(img.naturalWidth, img.naturalHeight);
      const sx = (img.naturalWidth - s) / 2;
      const sy = (img.naturalHeight - s) / 2;
      ctx.drawImage(img, sx, sy, s, s, 0, 0, c.width, c.height);
    };
    img.onerror = () => failed.current();
    img.src = url;
  }, [url, size]);
  return <canvas ref={ref} className="absolute inset-0 size-full" />;
}
