"use client";

import { useEffect, useRef, useState } from "react";
import { driveReady, pickDriveFiles } from "@/lib/google-drive";
import type { Attachment } from "@/lib/types";
import { Spinner } from "../setup-chat";
import { Popover } from "./pickers";

type NotionItem = { id: string; title: string; url: string; icon: string | null; kind: "page" | "database"; edited: string | null };

const ago = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
function edited(iso: string | null) {
  if (!iso) return "";
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (Math.abs(mins) < 60) return ago.format(mins, "minute");
  if (Math.abs(mins) < 1440) return ago.format(Math.round(mins / 60), "hour");
  return ago.format(Math.round(mins / 1440), "day");
}

/** Composer button: share a Google Drive file or a Notion page into the room. */
export function ShareMenu({
  notionOn,
  roomPath,
  onShare,
  onError,
}: {
  notionOn: boolean;
  roomPath: string;
  onShare: (items: Attachment[]) => void;
  onError: (msg: string) => void;
}) {
  const [open, setOpen] = useState<null | "menu" | "notion">(null);
  const [busy, setBusy] = useState(false);
  if (!driveReady && !notionOn) return null;

  async function drive() {
    setOpen(null);
    setBusy(true);
    try {
      const files = await pickDriveFiles();
      if (files.length)
        onShare(files.map((f) => ({ source: "drive", title: f.name.slice(0, 200), url: f.url, mime: f.mimeType, icon: f.iconUrl })));
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn't open Google Drive.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Share from Google Drive or Notion"
        title="Share from Google Drive or Notion"
        aria-expanded={open !== null}
        onClick={() => setOpen(open ? null : "menu")}
        className={`btn row h-9 min-w-9 rounded-lg px-1.5 text-muted ${open ? "bg-sunk text-fg" : ""}`}
      >
        {busy ? (
          <Spinner size={14} />
        ) : (
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="2" />
            <rect x="14" y="3" width="7" height="7" rx="2" />
            <rect x="3" y="14" width="7" height="7" rx="2" />
            <path d="M17.5 14v7M14 17.5h7" />
          </svg>
        )}
      </button>
      {open === "menu" && (
        <Popover label="Share from" onClose={() => setOpen(null)} className="w-[240px] p-1.5">
          <span className="px-2 pb-1 pt-0.5 text-xs text-muted">Share from</span>
          {driveReady && (
            <button type="button" onClick={() => void drive()} className="btn row justify-start gap-3 rounded-lg px-2 py-2 text-left text-sm text-fg">
              <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-md bg-sunk text-xs">▲</span>
              <span className="flex flex-col">
                <span className="font-medium">Google Drive</span>
                <span className="text-xs text-muted">Docs, Sheets, Slides, files</span>
              </span>
            </button>
          )}
          {notionOn && (
            <button type="button" onClick={() => setOpen("notion")} className="btn row justify-start gap-3 rounded-lg px-2 py-2 text-left text-sm text-fg">
              <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-md bg-fg font-serif text-xs font-bold text-bg">N</span>
              <span className="flex flex-col">
                <span className="font-medium">Notion</span>
                <span className="text-xs text-muted">Pages and databases</span>
              </span>
            </button>
          )}
        </Popover>
      )}
      {open === "notion" && (
        <NotionPicker
          roomPath={roomPath}
          onClose={() => setOpen(null)}
          onPick={(item) => {
            setOpen(null);
            onShare([{ source: "notion", title: item.title.slice(0, 200), url: item.url, icon: item.icon, kind: item.kind }]);
          }}
        />
      )}
    </div>
  );
}

function NotionPicker({ roomPath, onClose, onPick }: { roomPath: string; onClose: () => void; onPick: (i: NotionItem) => void }) {
  const [q, setQ] = useState("");
  const [state, setState] = useState<{ loading: boolean; connected: boolean | null; items: NotionItem[]; error: string }>({
    loading: true,
    connected: null,
    items: [],
    error: "",
  });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      setState((s) => ({ ...s, loading: true, error: "" }));
      try {
        const res = await fetch(`/api/integrations/notion/search?q=${encodeURIComponent(q)}`);
        const j = (await res.json()) as { connected?: boolean; items?: NotionItem[]; error?: string };
        if (!live) return;
        if (!res.ok) setState({ loading: false, connected: true, items: [], error: j.error ?? "Couldn't search Notion." });
        else setState({ loading: false, connected: Boolean(j.connected), items: j.items ?? [], error: "" });
      } catch {
        if (live) setState({ loading: false, connected: true, items: [], error: "Couldn't reach Notion." });
      }
    }, q ? 300 : 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  useEffect(() => {
    if (state.connected) inputRef.current?.focus();
  }, [state.connected]);

  return (
    <Popover label="Share a Notion page" onClose={onClose} className="w-[min(360px,calc(100vw-32px))] p-0">
      {state.connected === false ? (
        <div className="flex flex-col gap-3 p-4">
          <span className="font-display text-lg font-extrabold">Connect Notion</span>
          <span className="text-sm text-muted">
            Pick which Notion pages Byte can see, then share them here in one click. Only you can browse your Notion; the room sees the pages you share.
          </span>
          <a
            href={`/api/integrations/notion/connect?next=${encodeURIComponent(roomPath)}`}
            className="btn min-h-10 rounded-[10px] bg-inv px-4 text-sm font-semibold text-inv-fg no-underline"
          >
            Connect Notion
          </a>
        </div>
      ) : (
        <div className="flex flex-col">
          <div className="border-b border-line p-2">
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search your Notion"
              aria-label="Search your Notion"
              className="min-h-10 w-full rounded-[10px] border border-line bg-bg px-3 text-sm text-fg outline-none placeholder:text-muted focus-visible:border-fg"
            />
          </div>
          <div className="scroll-thin max-h-[300px] overflow-y-auto p-1.5">
            {state.loading && state.items.length === 0 ? (
              <span className="flex items-center justify-center gap-2 p-5 text-sm text-muted">
                <Spinner size={14} /> Searching…
              </span>
            ) : state.error ? (
              <p role="alert" className="m-0 p-4 text-sm text-err">
                {state.error}
              </p>
            ) : state.items.length === 0 ? (
              <p className="m-0 p-4 text-sm text-muted">
                {q ? "Nothing matches." : "No pages yet."} Only pages you gave Byte access to show up.{" "}
                <a href={`/api/integrations/notion/connect?next=${encodeURIComponent(roomPath)}`} className="font-medium text-fg">
                  Add pages
                </a>
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                {state.items.map((i) => (
                  <li key={i.id}>
                    <button
                      type="button"
                      onClick={() => onPick(i)}
                      className="btn row w-full justify-start gap-2.5 rounded-lg px-2 py-2 text-left text-sm text-fg"
                    >
                      <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center text-base">
                        {i.icon && !/^https:\/\//.test(i.icon) ? i.icon : "📄"}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium">{i.title}</span>
                        <span className="text-xs text-muted">
                          {i.kind === "database" ? "Database" : "Page"}
                          {i.edited ? ` · edited ${edited(i.edited)}` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Popover>
  );
}
