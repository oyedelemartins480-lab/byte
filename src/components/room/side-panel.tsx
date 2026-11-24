"use client";

import { useMemo, useState, useTransition } from "react";
import { deleteRoom, leaveRoom, removeMember, renameRoom, resetInvite } from "@/app/actions";
import { createClient } from "@/lib/supabase/client";
import type { FileMeta, Member, Message, Participant, Recap, Room, Session, SessionSummary } from "@/lib/types";
import { extractLinks, formatBytes } from "@/lib/utils";
import { Avatar } from "@/components/avatar";
import { useConfirm } from "@/components/confirm-dialog";
import { CopyButton } from "../copy-button";
import { FileIcon, LinkIcon, XIcon } from "../icons";
import { Board } from "../session/board";
import { NotesPanel } from "../session/notes-panel";
import { IntegrationsPanel } from "./integrations-panel";
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
  onMemberRemoved,
  onRoomDeleted,
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
  onMemberRemoved: (userId: string) => void;
  onRoomDeleted: () => void;
}) {
  const [tab, setTab] = useState<Tab>("session");
  const [code, setCode] = useState(room.invite_code);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const isOwner = room.owner_id === meId;
  const confirm = useConfirm();
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
                <RenameRoom room={room} onRenamed={(name) => onRoomChange({ name })} />
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
                  <Avatar name={m.name} url={m.avatar_url} size={32} tone={m.id === meId ? "inv" : "sunk"} />
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
                  {m.member_role === "owner" ? (
                    <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">Owner</span>
                  ) : (
                    isOwner && (
                      <button
                        type="button"
                        disabled={pending}
                        aria-label={`Remove ${m.name} from the room`}
                        onClick={async () => {
                          const ok = await confirm({
                            title: `Remove ${m.name}?`,
                            body: `They'll leave ${room.name} right away and can only come back with an invite link. Their messages stay.`,
                            confirmLabel: "Remove",
                            danger: true,
                          });
                          if (!ok) return;
                          start(async () => {
                            setError("");
                            const res = await removeMember(room.id, m.id);
                            if (res?.error) setError(res.error);
                            else onMemberRemoved(m.id);
                          });
                        }}
                        className="btn min-h-8 rounded-lg px-2 text-[13px] font-medium text-muted hover:text-err"
                      >
                        Remove
                      </button>
                    )
                  )}
                </li>
              ))}
            </ul>

            {isOwner && <IntegrationsPanel roomId={room.id} meId={meId} origin={origin} />}

            {isOwner && <DeleteRoom room={room} onDeleted={onRoomDeleted} />}

            {!isOwner && (
              <button
                type="button"
                onClick={async () => {
                  const ok = await confirm({
                    title: `Leave ${room.name}?`,
                    body: "You'll need an invite link to come back.",
                    confirmLabel: "Leave room",
                    danger: true,
                  });
                  if (ok)
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

function RenameRoom({ room, onRenamed }: { room: Room; onRenamed: (name: string) => void }) {
  const [name, setName] = useState(room.name);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; ok?: boolean }>({});
  const changed = name.trim() !== room.name && name.trim().length > 0;
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!changed) return;
        start(async () => {
          const res = await renameRoom(room.id, name);
          if (res?.error) setMsg({ error: res.error });
          else {
            setMsg({ ok: true });
            onRenamed(name.trim());
          }
        });
      }}
    >
      <label htmlFor="room-rename" className="text-sm font-medium">
        Room name
      </label>
      <div className="flex gap-2">
        <input
          id="room-rename"
          value={name}
          maxLength={60}
          onChange={(e) => {
            setName(e.target.value);
            setMsg({});
          }}
          className="min-h-10 min-w-0 flex-1 rounded-[10px] border border-line bg-bg px-3 text-sm text-fg outline-none focus-visible:border-fg focus-visible:ring-1 focus-visible:ring-fg"
        />
        <button type="submit" disabled={!changed || pending} className="btn min-h-10 rounded-[10px] bg-inv px-3.5 text-sm font-semibold text-inv-fg">
          {pending ? <Spinner size={14} /> : "Rename"}
        </button>
      </div>
      {msg.error && (
        <p role="alert" className="m-0 text-xs text-err">
          {msg.error}
        </p>
      )}
      {msg.ok && (
        <p role="status" className="m-0 text-xs text-muted">
          Renamed for everyone.
        </p>
      )}
    </form>
  );
}

function DeleteRoom({ room, onDeleted }: { room: Room; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn mt-auto self-start p-0 text-[13px] font-medium text-err underline">
        Delete room
      </button>
    );
  return (
    <section aria-labelledby="delete-h" className="mt-auto flex flex-col gap-2.5 rounded-[14px] border border-err/50 p-3.5">
      <h3 id="delete-h" className="m-0 text-sm font-semibold text-err">
        Delete {room.name}?
      </h3>
      <p className="m-0 text-[13px] leading-normal text-muted">
        Every message, file, session and recap in this room goes for everyone. This can&apos;t be undone. Type the room name to confirm.
      </p>
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        aria-label="Type the room name to confirm"
        placeholder={room.name}
        autoComplete="off"
        className="min-h-10 rounded-[10px] border border-line bg-bg px-3 text-sm text-fg outline-none focus-visible:border-err focus-visible:ring-1 focus-visible:ring-err"
      />
      {error && (
        <p role="alert" className="m-0 text-xs text-err">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="btn min-h-10 rounded-[10px] px-3 text-sm font-medium text-fg">
          Cancel
        </button>
        <button
          type="button"
          disabled={typed.trim() !== room.name || pending}
          onClick={() =>
            start(async () => {
              const res = await deleteRoom(room.id);
              if (res?.error) setError(res.error);
              else onDeleted();
            })
          }
          className="btn min-h-10 rounded-[10px] bg-err px-3.5 text-sm font-semibold text-bg"
        >
          {pending ? <Spinner size={14} /> : null} Delete room
        </button>
      </div>
    </section>
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
