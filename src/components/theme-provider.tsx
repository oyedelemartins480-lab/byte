"use client";

import { ThemeProvider as NextThemes, useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "./icons";

/** Follows the user's system theme by default; the toggle overrides it. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}

const subscribe = () => () => {};

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  // Only render the icon on the client, where the resolved theme is known.
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <button
      type="button"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => setTheme(dark ? "light" : "dark")}
      className={`btn size-11 shrink-0 rounded-[10px] border border-line bg-surface text-fg ${className}`}
    >
      {mounted ? dark ? <SunIcon /> : <MoonIcon /> : <span className="size-[18px]" />}
    </button>
  );
}
