"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Counts seconds with the Byte tab visible (focus), hidden (away) or on a research
 * break, and reports them every 30 seconds. Byte never sees which other sites you use.
 */
export function useFocusTracker(sessionId: string | null, active: boolean, onBreak: boolean) {
  const acc = useRef({ focus: 0, away: 0, brk: 0 });
  const breakRef = useRef(onBreak);
  useEffect(() => {
    breakRef.current = onBreak;
  }, [onBreak]);

  useEffect(() => {
    if (!sessionId || !active) return;
    const supabase = createClient();
    let last = Date.now();

    const tick = () => {
      const now = Date.now();
      const secs = Math.min(5, Math.max(0, Math.round((now - last) / 1000)));
      last = now;
      if (!secs) return;
      if (breakRef.current) acc.current.brk += secs;
      else if (document.visibilityState === "visible") acc.current.focus += secs;
      else acc.current.away += secs;
    };

    const flush = () => {
      tick();
      const { focus, away, brk } = acc.current;
      if (focus + away + brk === 0) return;
      acc.current = { focus: 0, away: 0, brk: 0 };
      void supabase.rpc("report_focus", { sid: sessionId, focus, away, brk });
    };

    // Background tabs throttle timers, so measure elapsed time rather than counting ticks.
    const tickTimer = setInterval(tick, 1000);
    const flushTimer = setInterval(flush, 30_000);
    const onVisibility = () => {
      tick();
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      clearInterval(tickTimer);
      clearInterval(flushTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [sessionId, active]);
}
