"use client";

import { useState } from "react";
import { DownloadIcon, ShareIcon } from "@/components/icons";
import { Spinner } from "@/components/setup-chat";

/** Preview, download and share the weekly stat card. */
export function WeekCardShare({ name }: { name: string }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [loaded, setLoaded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [version] = useState(() => Date.now());
  const src = `/api/card/week?theme=${theme}&v=${version}`;
  const file = `byte-week-${theme}.png`;

  async function share() {
    setNote("");
    setBusy(true);
    try {
      const blob = await fetch(src).then((r) => {
        if (!r.ok) throw new Error();
        return r.blob();
      });
      const f = new File([blob], file, { type: "image/png" });
      if (navigator.canShare?.({ files: [f] })) {
        await navigator.share({ files: [f], title: `${name}'s week on Byte`, text: "My week locked in on Byte." });
      } else if (navigator.clipboard && "ClipboardItem" in window) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setNote("Copied the image. Paste it into X, LinkedIn or your group chat.");
      } else {
        setNote("Sharing isn't available here. Download the image instead.");
      }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") setNote("Couldn't share that. Try Download instead.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="card-h" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="card-h" className="m-0 text-lg font-semibold">
            Your week, as a card
          </h2>
          <p className="m-0 text-sm text-muted">The last 7 days. Post it, send it to your team, keep each other honest.</p>
        </div>
        <div role="radiogroup" aria-label="Card theme" className="flex gap-1 rounded-[10px] border border-line p-0.5">
          {(["light", "dark"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={theme === t}
              onClick={() => setTheme(t)}
              className={`btn min-h-8 rounded-lg px-3 text-[13px] capitalize ${theme === t ? "bg-sunk font-semibold text-fg" : "text-muted"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-line bg-sunk" style={{ aspectRatio: "1200 / 630" }}>
        {loaded !== src && (
          <span className="absolute inset-0 flex items-center justify-center text-muted">
            <Spinner size={20} />
          </span>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={`${name}'s week on Byte: hours locked in, sessions, goals hit, focus score and streak`}
          width={1200}
          height={630}
          onLoad={() => setLoaded(src)}
          className={`absolute inset-0 size-full object-cover transition-opacity ${loaded === src ? "opacity-100" : "opacity-0"}`}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <a href={src} download={file} className="btn min-h-11 rounded-[10px] bg-inv px-4 font-semibold text-inv-fg">
          <DownloadIcon size={16} /> Download PNG
        </a>
        <button type="button" onClick={share} disabled={busy} className="btn min-h-11 rounded-[10px] border border-line px-4 font-medium text-fg">
          {busy ? <Spinner /> : <ShareIcon size={16} />} Share
        </button>
        {note && (
          <p role="status" className="m-0 text-sm text-muted">
            {note}
          </p>
        )}
      </div>
    </section>
  );
}
