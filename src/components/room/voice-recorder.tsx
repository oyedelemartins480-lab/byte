"use client";

import { useEffect, useRef, useState } from "react";
import { XIcon } from "../icons";

const MAX_SECONDS = 180;

function pickMime() {
  if (typeof MediaRecorder === "undefined") return "";
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

/** Records from the PC mic. Click to start, click Send to stop and send, X to throw it away. */
export function VoiceRecorder({
  onDone,
  onCancel,
  onError,
}: {
  onDone: (blob: Blob, seconds: number, mime: string) => void;
  onCancel: () => void;
  onError: (msg: string) => void;
}) {
  const [seconds, setSeconds] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const keep = useRef(false);
  const cbs = useRef({ onDone, onCancel, onError });
  useEffect(() => {
    cbs.current = { onDone, onCancel, onError };
  });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        const mime = pickMime();
        const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        rec.current = r;
        r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
        r.onstop = () => {
          stream?.getTracks().forEach((t) => t.stop());
          const secs = (Date.now() - started.current) / 1000;
          if (keep.current && secs >= 1) {
            const type = r.mimeType || mime || "audio/webm";
            cbs.current.onDone(new Blob(chunks.current, { type }), secs, type);
          } else if (keep.current) {
            cbs.current.onError("That was too short to send.");
          }
        };
        started.current = Date.now();
        r.start(250);
        timer = setInterval(() => {
          const s = Math.floor((Date.now() - started.current) / 1000);
          setSeconds(s);
          if (s >= MAX_SECONDS) {
            keep.current = true;
            r.stop();
          }
        }, 250);
      } catch {
        cbs.current.onError("Byte couldn't use your microphone. Allow mic access in your browser and try again.");
        cbs.current.onCancel();
      }
    })();
    return () => {
      cancelled = true;
      clearInterval(timer);
      if (rec.current && rec.current.state !== "inactive") rec.current.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const stop = (send: boolean) => {
    keep.current = send;
    if (rec.current && rec.current.state !== "inactive") rec.current.stop();
    if (!send) cbs.current.onCancel();
  };

  return (
    <div className="flex min-h-12 items-center gap-3 px-2" role="status" aria-live="polite">
      <span className="size-2.5 animate-pulse rounded-full bg-err motion-reduce:animate-none" aria-hidden="true" />
      <span className="font-mono text-sm tabular-nums">
        {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
      </span>
      <span className="flex-1 text-sm text-muted">Recording… (up to 3 minutes)</span>
      <button type="button" aria-label="Throw away recording" onClick={() => stop(false)} className="btn size-10 rounded-[10px] text-muted">
        <XIcon size={16} />
      </button>
      <button type="button" onClick={() => stop(true)} className="btn min-h-10 rounded-[10px] bg-inv px-4 font-semibold text-inv-fg">
        Send
      </button>
    </div>
  );
}
