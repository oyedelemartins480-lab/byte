"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VoiceMeta } from "@/lib/types";
import { Spinner } from "../setup-chat";
import { signedUrl } from "./file-card";

const BARS = 44;
const SPEEDS = [1, 1.5, 2] as const;

function fmt(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** A stand-in waveform (stable per note) shown until the real one is decoded. */
function placeholderPeaks(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return Array.from({ length: BARS }, (_, i) => {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const r = ((h >>> 0) % 1000) / 1000;
    const envelope = Math.sin((Math.PI * (i + 1)) / (BARS + 1)) * 0.5 + 0.35;
    return Math.min(1, 0.18 + r * 0.55 * envelope + 0.12);
  });
}

// Real waveform from the audio file, decoded once per note.
const peakCache = new Map<string, Promise<number[] | null>>();
function loadPeaks(path: string, url: string) {
  let p = peakCache.get(path);
  if (!p) {
    p = (async () => {
      try {
        const buf = await fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()));
        if (buf.byteLength > 8 * 1024 * 1024) return null;
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        const audio = await ctx.decodeAudioData(buf);
        void ctx.close();
        const data = audio.getChannelData(0);
        const step = Math.max(1, Math.floor(data.length / BARS));
        const raw = Array.from({ length: BARS }, (_, i) => {
          let sum = 0;
          const end = Math.min(data.length, (i + 1) * step);
          for (let j = i * step; j < end; j++) sum += data[j] * data[j];
          return Math.sqrt(sum / Math.max(1, end - i * step));
        });
        const max = Math.max(...raw, 0.0001);
        return raw.map((v) => Math.max(0.12, Math.min(1, (v / max) ** 0.8)));
      } catch {
        return null;
      }
    })();
    peakCache.set(path, p);
  }
  return p;
}

// Only one voice note plays at a time across the page.
let playing: HTMLAudioElement | null = null;

export function VoiceCard({
  meta,
  pending,
  transcribing,
}: {
  meta: VoiceMeta;
  pending?: boolean;
  transcribing?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const waveRef = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [showText, setShowText] = useState(true);
  const fallback = useMemo(() => placeholderPeaks(meta.path), [meta.path]);
  const total = meta.duration > 0 ? meta.duration : 1;
  const progress = Math.min(1, time / total);

  useEffect(() => {
    if (pending) return;
    let alive = true;
    signedUrl(meta.path)
      .then((u) => {
        if (!alive) return;
        setUrl(u);
        void loadPeaks(meta.path, u).then((p) => alive && p && setPeaks(p));
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [meta.path, pending]);

  // Smooth progress while playing.
  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    const tick = () => {
      const a = audioRef.current;
      if (a) setTime(a.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  const toggle = useCallback(async () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      if (playing && playing !== a) playing.pause();
      playing = a;
      a.playbackRate = speed;
      try {
        await a.play();
      } catch {
        setFailed(true);
      }
    } else {
      a.pause();
    }
  }, [speed]);

  const seekTo = useCallback(
    (fraction: number) => {
      const a = audioRef.current;
      if (!a) return;
      const t = Math.max(0, Math.min(1, fraction)) * total;
      a.currentTime = t;
      setTime(t);
    },
    [total],
  );

  const seekFromPointer = (clientX: number) => {
    const el = waveRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    seekTo((clientX - r.left) / r.width);
  };

  const bars = peaks ?? fallback;
  const ready = Boolean(url) && !failed;

  return (
    <div className="flex w-full max-w-[400px] flex-col gap-2">
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface py-2 pl-2 pr-3">
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={!ready}
          aria-label={isPlaying ? "Pause voice note" : "Play voice note"}
          className="btn size-10 shrink-0 rounded-full bg-inv text-inv-fg"
        >
          {pending || (!url && !failed) ? (
            <Spinner size={14} />
          ) : isPlaying ? (
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <rect x="2.5" y="1.5" width="3.2" height="11" rx="1.2" />
              <rect x="8.3" y="1.5" width="3.2" height="11" rx="1.2" />
            </svg>
          ) : (
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className="translate-x-px">
              <path d="M3.5 1.9v10.2a.9.9 0 0 0 1.37.77l8.1-5.1a.9.9 0 0 0 0-1.54l-8.1-5.1A.9.9 0 0 0 3.5 1.9z" />
            </svg>
          )}
        </button>

        <div
          ref={waveRef}
          role="slider"
          tabIndex={ready ? 0 : -1}
          aria-label="Voice note position"
          aria-valuemin={0}
          aria-valuemax={Math.round(total)}
          aria-valuenow={Math.round(time)}
          aria-valuetext={`${fmt(time)} of ${fmt(total)}`}
          onPointerDown={(e) => {
            if (!ready) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            seekFromPointer(e.clientX);
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) seekFromPointer(e.clientX);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") seekTo((time + 5) / total);
            else if (e.key === "ArrowLeft") seekTo((time - 5) / total);
            else if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              void toggle();
            } else return;
            e.preventDefault();
          }}
          className={`flex h-9 min-w-0 flex-1 touch-none items-center gap-[2px] rounded-md outline-none focus-visible:ring-2 focus-visible:ring-fg ${
            ready ? "cursor-pointer" : "opacity-60"
          }`}
        >
          {bars.map((v, i) => {
            const played = (i + 0.5) / bars.length <= progress;
            return (
              <span
                key={i}
                aria-hidden="true"
                className={`min-w-[2px] flex-1 rounded-full transition-colors duration-150 ${played ? "bg-fg" : "bg-line"}`}
                style={{ height: `${Math.round(v * 100)}%` }}
              />
            );
          })}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="font-mono text-xs tabular-nums text-muted">
            {isPlaying || time > 0 ? fmt(time) : fmt(total)}
          </span>
          <button
            type="button"
            onClick={() => {
              const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
              setSpeed(next);
              if (audioRef.current) audioRef.current.playbackRate = next;
            }}
            aria-label={`Playback speed ${speed}×, change speed`}
            className="btn min-h-5 rounded-full bg-sunk px-1.5 font-mono text-[11px] font-semibold tabular-nums text-fg"
          >
            {speed}×
          </button>
        </div>

        {url && (
          <audio
            ref={audioRef}
            src={url}
            preload="metadata"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => {
              setIsPlaying(false);
              setTime(0);
              if (audioRef.current) audioRef.current.currentTime = 0;
            }}
            onError={() => setFailed(true)}
            className="hidden"
          />
        )}
      </div>

      {failed && <p className="m-0 text-xs text-err">Couldn&apos;t load this voice note.</p>}

      {meta.transcript ? (
        <div className="flex flex-col gap-1 pl-1">
          <button
            type="button"
            onClick={() => setShowText((v) => !v)}
            aria-expanded={showText}
            className="btn self-start p-0 text-xs font-medium text-muted underline-offset-2 hover:underline"
          >
            {showText ? "Hide transcript" : "Show transcript"}
          </button>
          {showText && <p className="m-0 text-sm leading-normal text-fg">{meta.transcript}</p>}
        </div>
      ) : transcribing ? (
        <p className="m-0 flex items-center gap-2 pl-1 text-xs text-muted">
          <Spinner size={10} /> Transcribing…
        </p>
      ) : null}
    </div>
  );
}
