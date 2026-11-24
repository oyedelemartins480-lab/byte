"use client";

import { useEffect, useState } from "react";
import type { Unfurl } from "@/lib/unfurl";
import { GitHubIcon } from "../icons";

const cache = new Map<string, Promise<Unfurl | null>>();
function load(url: string) {
  let p = cache.get(url);
  if (!p) {
    p = fetch(`/api/unfurl?url=${encodeURIComponent(url)}`)
      .then((r) => (r.ok ? r.json() : { preview: null }))
      .then((j: { preview: Unfurl | null }) => j.preview)
      .catch(() => null);
    cache.set(url, p);
  }
  return p;
}

const BRAND: Record<string, { label: string; className: string }> = {
  notion: { label: "N", className: "bg-fg text-bg font-serif" },
  gdoc: { label: "D", className: "bg-[#2f6fe4] text-white" },
  gsheet: { label: "S", className: "bg-[#1e8e3e] text-white" },
  gslides: { label: "P", className: "bg-[#f4b400] text-black" },
  gdrive: { label: "▲", className: "bg-sunk text-fg text-[11px]" },
  figma: { label: "F", className: "bg-[#0d0d0d] text-white" },
};

const STATE: Record<string, string> = { open: "Open", closed: "Closed", merged: "Merged", draft: "Draft" };

/** A compact card under a message for the first link in it. */
export function LinkPreview({ url, calm }: { url: string; calm: boolean }) {
  const [data, setData] = useState<Unfurl | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void load(url).then((d) => {
      if (live) setData(d);
    });
    return () => {
      live = false;
    };
  }, [url]);

  if (!data) return null;
  const brand = BRAND[data.kind];
  const gh = data.github;
  const title = data.title ?? (data.kind === "web" ? null : `${data.site} link`);
  const privateNote = !data.title && data.kind !== "web" && data.kind !== "github" ? "Private — open it to view" : null;
  const showImage = !calm && data.image && data.kind !== "github";

  return (
    <a
      href={data.url}
      target="_blank"
      rel="noopener noreferrer"
      className="row flex max-w-[460px] gap-3 rounded-xl border border-line bg-surface p-3 text-fg no-underline"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-1.5 text-xs text-muted">
          {data.kind === "github" ? (
            <GitHubIcon size={13} />
          ) : brand ? (
            <span aria-hidden="true" className={`flex size-4 items-center justify-center rounded text-[10px] font-bold ${brand.className}`}>
              {brand.label}
            </span>
          ) : null}
          <span className="truncate">{gh ? gh.repo : data.site}</span>
          {gh?.number && <span>#{gh.number}</span>}
        </span>
        {title && <span className="line-clamp-2 text-sm font-semibold leading-snug">{title}</span>}
        {(data.description || privateNote) && (
          <span className="line-clamp-2 text-[13px] leading-snug text-muted">{data.description ?? privateNote}</span>
        )}
        {gh && (gh.state || gh.stars !== undefined) && (
          <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
            {gh.state && (
              <span
                className={`rounded-full px-2 py-0.5 font-semibold ${
                  gh.state === "merged" ? "bg-inv text-inv-fg" : gh.state === "open" ? "bg-hi text-hi-fg" : "bg-sunk text-muted"
                }`}
              >
                {STATE[gh.state]}
              </span>
            )}
            {gh.author && <span>by @{gh.author}</span>}
            {gh.stars !== undefined && <span>★ {gh.stars.toLocaleString()}</span>}
            {gh.language && <span>{gh.language}</span>}
          </span>
        )}
      </span>
      {showImage && (
        // eslint-disable-next-line @next/next/no-img-element -- third-party preview image
        <img
          src={data.image!}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => (e.currentTarget.style.display = "none")}
          className="size-[72px] shrink-0 rounded-lg bg-sunk object-cover"
        />
      )}
    </a>
  );
}
