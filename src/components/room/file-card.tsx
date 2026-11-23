"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { FileMeta } from "@/lib/types";
import { formatBytes } from "@/lib/utils";
import { FileIcon } from "../icons";

const cache = new Map<string, { url: string; at: number }>();
const TTL = 55 * 60 * 1000;

async function signedUrl(path: string) {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL) return hit.url;
  const { data, error } = await createClient().storage.from("attachments").createSignedUrl(path, 3600);
  if (error || !data) throw error ?? new Error("No URL");
  cache.set(path, { url: data.signedUrl, at: Date.now() });
  return data.signedUrl;
}

/** Shows an uploaded file: images inline, everything else as a download card. Files are private to room members. */
export function FileCard({ meta, pending }: { meta: FileMeta; pending?: boolean }) {
  const isImage = meta.mime.startsWith("image/") && !meta.mime.includes("svg");
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (pending) return;
    let alive = true;
    signedUrl(meta.path)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [meta.path, pending]);

  if (isImage && url && !failed) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block w-fit">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived storage URL */}
        <img
          src={url}
          alt={meta.name}
          loading="lazy"
          className="max-h-[320px] max-w-[min(420px,100%)] rounded-xl border border-line object-contain"
        />
      </a>
    );
  }

  const download = url ? `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(meta.name)}` : undefined;
  return (
    <div className="flex w-full max-w-[420px] items-center gap-3 rounded-xl border border-line bg-surface p-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sunk text-muted">
        <FileIcon />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold">{meta.name}</span>
        <span className="text-xs text-muted">
          {pending ? "Uploading…" : failed ? "Couldn't load this file" : formatBytes(meta.size)}
        </span>
      </div>
      {download && (
        <a href={download} className="btn min-h-9 rounded-lg border border-line px-3 text-sm font-medium text-fg no-underline">
          Download
        </a>
      )}
    </div>
  );
}
