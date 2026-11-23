"use client";

import { useEffect, useState } from "react";
import type { VoiceMeta } from "@/lib/types";
import { Spinner } from "../setup-chat";
import { signedUrl } from "./file-card";

function fmt(sec: number) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function VoiceCard({
  meta,
  pending,
  transcribing,
}: {
  meta: VoiceMeta;
  pending?: boolean;
  transcribing?: boolean;
}) {
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

  return (
    <div className="flex w-full max-w-[420px] flex-col gap-2 rounded-xl border border-line bg-surface p-3">
      <div className="flex items-center gap-3">
        {url ? (
          <audio controls preload="metadata" src={url} className="h-9 min-w-0 flex-1">
            <track kind="captions" />
          </audio>
        ) : (
          <span className="flex h-9 flex-1 items-center gap-2 text-sm text-muted">
            {failed ? "Couldn't load this voice note" : pending ? "Sending voice note…" : <Spinner size={12} />}
          </span>
        )}
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted">{fmt(meta.duration)}</span>
      </div>
      {meta.transcript ? (
        <p className="m-0 text-sm leading-normal text-muted">{meta.transcript}</p>
      ) : transcribing ? (
        <p className="m-0 flex items-center gap-2 text-xs text-muted">
          <Spinner size={10} /> Transcribing…
        </p>
      ) : null}
    </div>
  );
}
