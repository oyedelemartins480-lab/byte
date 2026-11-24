import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export type WeekCardData = {
  name: string;
  range: string;
  hours: number;
  sessions: number;
  hit: number;
  avg: number | null;
  streak: number;
  days: { key: string; label: string; secs: number }[];
  dark: boolean;
};

const fontDir = join(process.cwd(), "src", "fonts", "og");
let fonts: Promise<{ name: string; data: Buffer; weight: 400 | 500 | 800 | 900; style: "normal" }[]> | null = null;
function loadFonts() {
  fonts ??= Promise.all([
    readFile(join(fontDir, "nunito-900.woff")).then((data) => ({ name: "Nunito", data, weight: 900 as const, style: "normal" as const })),
    readFile(join(fontDir, "nunito-800.woff")).then((data) => ({ name: "Nunito", data, weight: 800 as const, style: "normal" as const })),
    readFile(join(fontDir, "onest-400.woff")).then((data) => ({ name: "Onest", data, weight: 400 as const, style: "normal" as const })),
    readFile(join(fontDir, "onest-500.woff")).then((data) => ({ name: "Onest", data, weight: 500 as const, style: "normal" as const })),
  ]);
  return fonts;
}

/** Draws the 1200×630 weekly stat card. */
export async function weekCard({ name, range, hours, sessions, hit, avg, streak, days, dark }: WeekCardData) {
  const hoursLabel = hours >= 10 ? Math.round(hours).toString() : (Math.round(hours * 10) / 10).toString();
  const maxSecs = Math.max(...days.map((d) => d.secs), 1);
  const fg = dark ? "#f4f4f1" : "#0b0b0b";
  const bg = dark ? "#121212" : "#ffffff";
  const muted = dark ? "#9a9a96" : "#6b6b68";
  const sunk = dark ? "#1f1f1f" : "#f1f1ee";
  const line = dark ? "#2c2c2c" : "#e4e4e0";
  const lime = "#c6f432";

  const stat = (value: string, label: string) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontFamily: "Nunito", fontWeight: 900, fontSize: 64, lineHeight: 1, letterSpacing: -2 }}>{value}</span>
      <span style={{ fontFamily: "Onest", fontSize: 22, color: muted }}>{label}</span>
    </div>
  );

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: bg, color: fg, fontFamily: "Onest", position: "relative", overflow: "hidden" }}>
        {/* Decorative blobs */}
        <div style={{ position: "absolute", right: -140, top: -160, width: 520, height: 480, borderRadius: "46% 54% 42% 58% / 52% 40% 60% 48%", background: sunk, display: "flex" }} />
        <div style={{ position: "absolute", right: 300, bottom: -90, width: 200, height: 190, borderRadius: "58% 42% 50% 50% / 45% 55% 45% 55%", border: `3px solid ${line}`, display: "flex" }} />
        <div style={{ position: "absolute", right: 96, top: 96, width: 22, height: 22, borderRadius: 999, background: lime, display: "flex" }} />

        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, borderRadius: 14, background: fg, color: bg, fontFamily: "Nunito", fontWeight: 900, fontSize: 30, position: "relative" }}>
              b
              <div style={{ position: "absolute", right: 7, bottom: 8, width: 8, height: 8, borderRadius: 8, background: lime, display: "flex" }} />
            </div>
            <span style={{ fontFamily: "Nunito", fontWeight: 900, fontSize: 30 }}>byte</span>
            <span style={{ fontSize: 22, color: muted, marginLeft: 12 }}>{range}</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 26, color: muted }}>{name}&apos;s week</span>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 18 }}>
              <span style={{ fontFamily: "Nunito", fontWeight: 900, fontSize: 150, lineHeight: 0.9, letterSpacing: -6 }}>{hoursLabel}</span>
              <span style={{ fontFamily: "Nunito", fontWeight: 800, fontSize: 44, paddingBottom: 14 }}>{hours === 1 ? "hour locked in" : "hours locked in"}</span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 56 }}>
              {stat(String(sessions), sessions === 1 ? "session" : "sessions")}
              {stat(String(hit), hit === 1 ? "goal hit" : "goals hit")}
              {stat(avg === null ? "–" : String(avg), "focus score")}
              {stat(String(streak), streak === 1 ? "day streak" : "day streak")}
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 130 }}>
              {days.map((d, i) => (
                <div key={d.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      display: "flex",
                      width: 26,
                      height: Math.max(8, Math.round((d.secs / maxSecs) * 96)),
                      borderRadius: 8,
                      background: d.secs === 0 ? line : i === 6 ? lime : fg,
                    }}
                  />
                  <span style={{ fontSize: 16, color: muted }}>{d.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: await loadFonts(),
          },
  );
}
