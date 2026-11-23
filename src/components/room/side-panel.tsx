"use client";

import { useMemo, useState, useTransition } from "react";
import { leaveRoom, resetInvite } from "@/app/actions";
import { createClient } from "@/lib/supabase/client";
import type { FileMeta, Member, Message, Participant, Recap, Room, Session, SessionSummary } from "@/lib/types";
import { extractLinks, formatBytes, initials } from "@/lib/utils";
import { CopyButton } from "../copy-button";
import { FileIcon, LinkIcon, XIcon } from "../icons";
import { Board } from "../session/board";
import { NotesPanel } from "../session/notes-panel";
import { Spinner } from "../setup-chat";
import { fmtTime } from "./message-item";

type Tab = "session" | "people" | "links" | "files";

export function SidePanel({
  room,
  meId,
  members,
  messages,
  origin,
  onClose,
  onJumpTo,
  onRoomChange,
  session,
  sessionLive,
  participants,
  events,
  summary,
  lastRecap,
  aiState,
  showBoard,
}: {
  room: Room;
  meId: string;
  members: Member[];
  messages: Message[];
  origin: string;
  onClose: () => void;
  onJumpTo: (id: string) => void;
  onRoomChange: (r: Partial<Room>) => void;
  session: Session | null;
  sessionLive: boolean;
  participants: Participant[];
  events: Message[];
  summary: SessionSummary | null;
  lastRecap: Recap | null;
  aiState: "on" | "room-off" | "not-configured";
  showBoard: boolean;
}) {
  const [tab, setTab] = useState<Tab>("session");
  const [code, setCode] = useState(room.invite_code);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const isOwner = room.owner_id === meId;
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const live = messages.filter((m) => !m.deleted_at && !m.pending);
  const links = useMemo(
    () =>
      live
        .filter((m) => m.type === "text")
        .flatMap((m) => extractLinks(m.body).map((url) => ({ url, m })))
        .reverse(),
    [live],
  );
  const files = useMemo(() => live.filter((m) => m.type === "file").reverse(), [live]);
  const invite = origin ? `${origin}/join/${code}` : "";

  async function updateRoom(patch: Partial<Pick<Room, "ai_enabled" | "visibility">>) {
    setError("");
    onRoomChange(patch);
    const { error: err } = await createClient().from("rooms").update(patch).eq("id", room.id);
    if (err) {
      onRoomChange({ ai_enabled: room.ai_enabled, visibility: room.visibility });
      setError(`Couldn't save: ${err.message}`);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-line p-3">
        <div role="tablist" aria-label="Room details" className="flex flex-1 gap-1">
          {(
            [
              ["session", "Session"],
              ["people", "People"],
              ["links", "Links"],
              ["files", "Files"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`btn min-h-9 flex-1 whitespace-nowrap rounded-lg px-1.5 text-[13px] font-medium ${
                tab === k ? "bg-inv text-inv-fg" : "text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" aria-label="Close panel" onClick={onClose} className="btn size-9 rounded-lg text-muted">
          <XIcon size={16} />
        </button>
      </div>

      <div className="scroll-thin flex flex-1 flex-col gap-5 overflow-y-auto p-4">
        {tab === "session" && (
          <>
            <NotesPanel summary={summary} live={sessionLive} aiState={aiState} lastRecap={lastRecap} />
            {showBoard && session && (
              <section className="flex flex-col gap-3">
                <h3 className="m-0 text-sm font-semibold">Who&apos;s locked in</h3>
                <Board session={session} participants={participants} events={events} members={byId} meId={meId} />
              </section>
            )}
          </>
        )}

        {tab === "people" && (
          <>
            <section aria-labelledby="invite-h" className="flex flex-col gap-2.5 rounded-[14px] border border-line bg-bg p-3.5">
              <h3 id="invite-h" className="m-0 text-sm font-semibold">
                Invite link
              </h3>
              <p className="m-0 text-[13px] text-muted">Anyone with this link can join the room.</p>
              <div className="flex items-center gap-2 rounded-[10px] border border-line bg-surface py-1.5 pl-3 pr-1.5">
                <LinkIcon size={16} className="shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate font-mono text-[13px]">
                  {invite.replace(/^https?:\/\//, "") || "…"}
                </span>
                <CopyButton text={invite} className="min-h-8 rounded-lg bg-inv px-3 text-[13px] font-semibold text-inv-fg" />
              </div>
              {isOwner && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      setError("");
                      const res = await resetInvite(room.id);
                      if (res.code) setCode(res.code);
                      else setError(res.error ?? "Couldn't reset the link.");
                    })
                  }
                  className="btn self-start p-0 text-[13px] font-medium text-muted underline"
                >
                  {pending ? <Spinner size={12} /> : null} Reset link (the old one stops working)
                </button>
              )}
            </section>

            {isOwner && (
              <section aria-labelledby="settings-h" className="flex flex-col gap-3 rounded-[14px] border border-line p-3.5">
                <h3 id="settings-h" className="m-0 text-sm font-semibold">
                  Room settings
                </h3>
                <Toggle
                  label="AI notes and @ai"
                  hint="Live notes, recaps written by AI, and answers from the room's history."
                  checked={room.ai_enabled}
                  onChange={(v) => void updateRoom({ ai_enabled: v })}
                />
                <Toggle
                  label="Open to everyone"
                  hint="Shows the room in Discover so anyone signed in can join and lock in with you."
                  checked={room.visibility === "public"}
                  onChange={(v) => void updateRoom({ visibility: v ? "public" : "private" })}
                />
              </section>
            )}
            {error && (
              <p role="alert" className="m-0 text-[13px] text-err">
                {error}
              </p>
            )}

            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {members.map((m) => (
                <li key={m.id} className="flex items-center gap-3 rounded-[10px] px-1 py-1.5">
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      m.id === meId ? "bg-inv text-inv-fg" : "bg-sunk text-fg"
                    }`}
                  >
                    {initials(m.name)}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold">
                      {m.name}
                      {m.id === meId && <span className="font-normal text-muted"> (you)</span>}
                    </span>
                    <span className="truncate text-xs text-muted">
                      @{m.username}
                      {m.role ? ` · ${m.role}` : ""}
                    </span>
                  </div>
                  {m.member_role === "owner" && (
                    <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">Owner</span>
                  )}
                </li>
              ))}
            </ul>

            {!isOwner && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Leave ${room.name}? You'll need a new invite link to come back.`))
                    start(async () => {
                      const res = await leaveRoom(room.id);
                      if (res?.error) setError(res.error);
                    });
                }}
                className="btn mt-auto self-start p-0 text-[13px] font-medium text-err underline"
              >
                Leave room
              </button>
            )}
          </>
        )}

        {tab === "links" &&
          (links.length === 0 ? (
            <Empty text="Links people share in chat collect here automatically." />
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {links.map(({ url, m }, i) => (
                <li key={`${m.id}-${i}`} className="flex flex-col gap-1 rounded-xl border border-line p-3">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-sm font-semibold text-fg no-underline hover:underline"
                  >
                    {prettyUrl(url)}
                  </a>
                  <button type="button" onClick={() => onJumpTo(m.id)} className="btn justify-start p-0 text-left text-xs text-muted">
                    {(m.user_id && byId.get(m.user_id)?.name) ?? "Someone"} · {fmtTime(m.created_at)}
                  </button>
                </li>
              ))}
            </ul>
          ))}

        {tab === "files" &&
          (files.length === 0 ? (
            <Empty text="Files and images shared in chat show up here. Drop one in with the paperclip." />
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {files.map((m) => {
                const f = m.meta as unknown as FileMeta;
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => onJumpTo(m.id)}
                      className="btn row w-full justify-start gap-3 rounded-xl border border-line p-3 text-left"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sunk text-muted">
                        <FileIcon size={16} />
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-semibold">{f.name}</span>
                        <span className="text-xs text-muted">
                          {formatBytes(f.size)} · {(m.user_id && byId.get(m.user_id)?.name) ?? "Someone"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ))}
      </div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs leading-normal text-muted">{hint}</span>
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden="true"
        className="relative mt-0.5 h-6 w-10 shrink-0 rounded-full bg-sunk transition-colors peer-checked:bg-inv peer-focus-visible:ring-2 peer-focus-visible:ring-fg after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-surface after:shadow-sm after:transition-transform peer-checked:after:translate-x-4"
      />
    </label>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="m-0 rounded-xl border border-dashed border-line p-4 text-sm leading-normal text-muted">{text}</p>;
}

function prettyUrl(url: string) {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname}`.slice(0, 80);
  } catch {
    return url;
  }
}
