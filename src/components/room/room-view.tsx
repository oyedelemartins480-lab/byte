"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import type { FileMeta, GifMeta, Member, Message, Reaction, Room, StickerMeta } from "@/lib/types";
import { CopyButton } from "../copy-button";
import { HashIcon, LinkIcon, PanelIcon, TimerIcon } from "../icons";
import { Spinner } from "../setup-chat";
import { Composer } from "./composer";
import { MessageItem, type ReactionGroup } from "./message-item";
import { SidePanel } from "./side-panel";

const PAGE = 50;
const MAX_FILE = 25 * 1024 * 1024;
const GROUP_MS = 5 * 60 * 1000;

const subscribe = () => () => {};
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" });

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return dayFmt.format(d);
}

type Toast = { text: string; action?: { label: string; run: () => void } };

export function RoomView({
  room,
  meId,
  initialMembers,
  initialMessages,
  initialReactions,
  initialHasMore,
}: {
  room: Room;
  meId: string;
  initialMembers: Member[];
  initialMessages: Message[];
  initialReactions: Reaction[];
  initialHasMore: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const origin = useSyncExternalStore(
    subscribe,
    () => process.env.NEXT_PUBLIC_SITE_URL || window.location.origin,
    () => "",
  );

  const [members, setMembers] = useState(initialMembers);
  const [messages, setMessages] = useState(initialMessages);
  const [reactions, setReactions] = useState(initialReactions);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [typing, setTyping] = useState<Record<string, number>>({});
  const [panel, setPanel] = useState<boolean | null>(null); // null = auto (open on wide screens)
  const [toast, setToast] = useState<Toast | null>(null);
  const [connected, setConnected] = useState(true);

  const listRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastTypingSent = useRef(0);
  const prevHeight = useRef<number | null>(null);
  const pendingDelete = useRef<{ id: string; timer: ReturnType<typeof setTimeout>; commit: () => void } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const usernames = useMemo(() => new Set(members.map((m) => m.username)), [members]);
  const me = byId.get(meId);
  const msgById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);

  const showToast = useCallback((t: Toast, ms = 5000) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);

  // ── Message state helpers ────────────────────────────────────────────
  const upsert = useCallback((incoming: Message) => {
    setMessages((prev) => {
      const i = prev.findIndex((m) => m.id === incoming.id);
      if (i >= 0) {
        const next = prev.slice();
        next[i] = { ...incoming, pending: false, failed: false };
        return next;
      }
      const next = [...prev, incoming];
      // Out-of-order arrivals are rare; keep the list sorted when they happen.
      if (prev.length && prev[prev.length - 1].created_at > incoming.created_at) {
        next.sort((a, b) => a.created_at.localeCompare(b.created_at));
      }
      return next;
    });
  }, []);

  const catchUp = useCallback(async () => {
    const newest = [...messages].reverse().find((m) => !m.pending)?.created_at;
    let q = supabase.from("messages").select("*").eq("room_id", room.id).order("created_at", { ascending: true }).limit(200);
    if (newest) q = q.gt("created_at", newest);
    const { data } = await q;
    (data as Message[] | null)?.forEach(upsert);
  }, [messages, room.id, supabase, upsert]);
  const catchUpRef = useRef(catchUp);
  useEffect(() => {
    catchUpRef.current = catchUp;
  }, [catchUp]);

  // ── Realtime ─────────────────────────────────────────────────────────
  useEffect(() => {
    let subscribedOnce = false;
    const filter = `room_id=eq.${room.id}`;
    const ch = supabase
      .channel(`room:${room.id}`, { config: { broadcast: { self: false } } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter }, (p) => {
        const m = p.new as Message;
        upsert(m);
        setTyping((t) => {
          if (!(m.user_id in t)) return t;
          const next = { ...t };
          delete next[m.user_id];
          return next;
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter }, (p) =>
        upsert(p.new as Message),
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "reactions", filter }, (p) => {
        const r = p.new as Reaction;
        setReactions((prev) =>
          prev.some((x) => x.message_id === r.message_id && x.user_id === r.user_id && x.emoji === r.emoji)
            ? prev
            : [...prev, r],
        );
      })
      // Postgres DELETE events can't be filtered by room, so removals travel on this room's channel instead.
      .on("broadcast", { event: "reaction-removed" }, ({ payload }) => {
        const r = payload as Reaction;
        setReactions((prev) =>
          prev.filter((x) => !(x.message_id === r.message_id && x.user_id === r.user_id && x.emoji === r.emoji)),
        );
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "room_members", filter }, async (p) => {
        const row = p.new as { user_id: string; role: "owner" | "member" };
        const { data } = await supabase.from("profiles").select("id, name, username, role").eq("id", row.user_id).maybeSingle();
        if (data)
          setMembers((prev) =>
            prev.some((m) => m.id === data.id) ? prev : [...prev, { ...(data as Omit<Member, "member_role">), member_role: row.role }],
          );
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const uid = (payload as { user_id?: string }).user_id;
        if (uid && uid !== meId) setTyping((t) => ({ ...t, [uid]: Date.now() }));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnected(true);
          if (subscribedOnce) void catchUpRef.current(); // fill the gap after a reconnect
          subscribedOnce = true;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setConnected(false);
        }
      });
    channelRef.current = ch;
    return () => {
      channelRef.current = null;
      void supabase.removeChannel(ch);
    };
  }, [room.id, meId, supabase, upsert]);

  // Expire typing indicators.
  useEffect(() => {
    if (!Object.keys(typing).length) return;
    const t = setInterval(() => {
      const now = Date.now();
      setTyping((prev) => {
        const next = Object.fromEntries(Object.entries(prev).filter(([, at]) => now - at < 4000));
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 1500);
    return () => clearInterval(t);
  }, [typing]);

  // Commit a pending delete if the user leaves the room before the undo window ends.
  useEffect(
    () => () => {
      const p = pendingDelete.current;
      if (p) {
        clearTimeout(p.timer);
        p.commit();
      }
    },
    [],
  );

  // ── Scrolling ────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (prevHeight.current !== null) {
      el.scrollTop += el.scrollHeight - prevHeight.current; // keep position after loading older messages
      prevHeight.current = null;
    } else if (atBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, mounted]);

  function onScroll() {
    const el = listRef.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  async function loadOlder() {
    const oldest = messages.find((m) => !m.pending);
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("room_id", room.id)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(PAGE + 1);
    if (error) {
      setLoadingOlder(false);
      return showToast({ text: "Couldn't load older messages." });
    }
    const rows = (data ?? []) as Message[];
    const older = rows.slice(0, PAGE).reverse();
    if (older.length) {
      const { data: rx } = await supabase
        .from("reactions")
        .select("message_id, user_id, emoji")
        .in(
          "message_id",
          older.map((m) => m.id),
        );
      setReactions((prev) => [...prev, ...((rx ?? []) as Reaction[])]);
    }
    prevHeight.current = listRef.current?.scrollHeight ?? null;
    setMessages((prev) => [...older, ...prev]);
    setHasMore(rows.length > PAGE);
    setLoadingOlder(false);
  }

  const jumpTo = useCallback(
    (id: string) => {
      const el = document.getElementById(`m-${id}`);
      if (!el) return showToast({ text: "That message is further back. Load older messages to see it." });
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.animate([{ background: "var(--hi)" }, { background: "transparent" }], { duration: 1400, easing: "ease-out" });
    },
    [showToast],
  );

  // ── Sending ──────────────────────────────────────────────────────────
  async function insert(m: Message) {
    const { error } = await supabase.from("messages").insert({
      id: m.id,
      room_id: m.room_id,
      user_id: m.user_id,
      type: m.type,
      body: m.body,
      meta: m.meta,
      reply_to: m.reply_to,
    });
    setMessages((prev) =>
      prev.map((x) => (x.id === m.id ? { ...x, pending: false, failed: Boolean(error && error.code !== "23505") } : x)),
    );
  }

  function send(type: Message["type"], body: string, meta: Record<string, unknown> = {}) {
    const m: Message = {
      id: crypto.randomUUID(),
      room_id: room.id,
      user_id: meId,
      type,
      body,
      meta,
      reply_to: replyTo?.id ?? null,
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      pending: true,
    };
    atBottom.current = true;
    setMessages((prev) => [...prev, m]);
    setReplyTo(null);
    void insert(m);
  }

  function retry(m: Message) {
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, failed: false, pending: true } : x)));
    void insert(m);
  }

  async function uploadFiles(list: FileList) {
    for (const file of Array.from(list).slice(0, 5)) {
      if (file.size > MAX_FILE) {
        showToast({ text: `${file.name} is over 25 MB. Share a link to it instead.` });
        continue;
      }
      const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80) || "file";
      const meta: FileMeta = {
        path: `${room.id}/${crypto.randomUUID()}-${safe}`,
        name: file.name,
        size: file.size,
        mime: file.type || "application/octet-stream",
      };
      const m: Message = {
        id: crypto.randomUUID(),
        room_id: room.id,
        user_id: meId,
        type: "file",
        body: "",
        meta,
        reply_to: null,
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
        pending: true,
      };
      atBottom.current = true;
      setMessages((prev) => [...prev, m]);
      const { error } = await supabase.storage.from("attachments").upload(meta.path, file, { contentType: meta.mime });
      if (error) {
        setMessages((prev) => prev.filter((x) => x.id !== m.id));
        showToast({ text: `Couldn't upload ${file.name}: ${error.message}` });
        continue;
      }
      await insert(m);
    }
  }

  function toggleReaction(messageId: string, emoji: string) {
    const mine = reactions.some((r) => r.message_id === messageId && r.user_id === meId && r.emoji === emoji);
    const row = { message_id: messageId, user_id: meId, emoji };
    if (mine) {
      setReactions((prev) => prev.filter((r) => !(r.message_id === messageId && r.user_id === meId && r.emoji === emoji)));
      void supabase
        .from("reactions")
        .delete()
        .match(row)
        .then(({ error }) => {
          if (error) setReactions((prev) => [...prev, row]);
          else void channelRef.current?.send({ type: "broadcast", event: "reaction-removed", payload: row });
        });
    } else {
      setReactions((prev) => [...prev, row]);
      void supabase
        .from("reactions")
        .insert({ ...row, room_id: room.id })
        .then(({ error }) => {
          if (error && error.code !== "23505")
            setReactions((prev) => prev.filter((r) => !(r.message_id === messageId && r.user_id === meId && r.emoji === emoji)));
        });
    }
  }

  function deleteMessage(m: Message) {
    // Finish any earlier delete first, then start an undo window for this one.
    if (pendingDelete.current) {
      clearTimeout(pendingDelete.current.timer);
      pendingDelete.current.commit();
    }
    const original = m;
    const deletedAt = new Date().toISOString();
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, deleted_at: deletedAt } : x)));
    const commit = () => {
      pendingDelete.current = null;
      void supabase
        .from("messages")
        .update({ deleted_at: deletedAt, body: "", meta: {} })
        .eq("id", m.id)
        .then(({ error }) => {
          if (error) {
            setMessages((prev) => prev.map((x) => (x.id === m.id ? original : x)));
            showToast({ text: "Couldn't delete that message." });
          }
        });
    };
    const timer = setTimeout(commit, 5000);
    pendingDelete.current = { id: m.id, timer, commit };
    showToast({
      text: "Message deleted",
      action: {
        label: "Undo",
        run: () => {
          clearTimeout(timer);
          pendingDelete.current = null;
          setMessages((prev) => prev.map((x) => (x.id === m.id ? original : x)));
          setToast(null);
        },
      },
    });
  }

  function sendTyping() {
    const now = Date.now();
    if (now - lastTypingSent.current < 2500) return;
    lastTypingSent.current = now;
    void channelRef.current?.send({ type: "broadcast", event: "typing", payload: { user_id: meId } });
  }

  // ── Derived view data ────────────────────────────────────────────────
  const reactionGroups = useMemo(() => {
    const map = new Map<string, Map<string, ReactionGroup>>();
    for (const r of reactions) {
      let g = map.get(r.message_id);
      if (!g) map.set(r.message_id, (g = new Map()));
      const e = g.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false, names: [] };
      e.count += 1;
      e.mine ||= r.user_id === meId;
      e.names.push(byId.get(r.user_id)?.name ?? "Someone");
      g.set(r.emoji, e);
    }
    return map;
  }, [reactions, meId, byId]);

  const typingNames = Object.keys(typing)
    .map((id) => byId.get(id)?.name.split(" ")[0])
    .filter(Boolean) as string[];

  const panelClass =
    panel === null ? "hidden xl:flex" : panel ? "flex" : "hidden";
  const togglePanel = () =>
    setPanel((p) => {
      const wide = typeof window !== "undefined" && window.matchMedia("(min-width: 1280px)").matches;
      const currentlyOpen = p === null ? wide : p;
      return !currentlyOpen;
    });

  const isLockin = room.type === "lockin";

  return (
    <div className="flex h-full min-h-0">
      <section aria-label={room.name} className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-line px-4 py-2.5 sm:gap-3 sm:px-5">
          <div className="flex min-w-0 flex-1 flex-col">
            <h1 className="m-0 flex items-center gap-2 truncate text-[17px] font-semibold">
              <span className="text-muted">{isLockin ? <TimerIcon size={16} /> : <HashIcon size={16} />}</span>
              <span className="truncate">{room.name}</span>
            </h1>
            <span className="text-[13px] text-muted">
              {isLockin ? "Lock-in room" : "Build room"} · {members.length} {members.length === 1 ? "member" : "members"}
            </span>
          </div>
          {!connected && (
            <span
              role="status"
              title="Reconnecting…"
              className="flex shrink-0 items-center gap-2 rounded-full bg-sunk px-2.5 py-1.5 text-[13px] text-muted sm:px-3"
            >
              <Spinner size={12} /> <span className="sr-only sm:not-sr-only">Reconnecting…</span>
            </span>
          )}
          <CopyButton
            text={origin ? `${origin}/join/${room.invite_code}` : ""}
            label="Invite link"
            copiedLabel="Link copied"
            className="min-h-10 min-w-10 shrink-0 rounded-[10px] border border-line bg-surface px-2.5 text-sm font-medium text-fg sm:px-3.5"
            labelClassName="sr-only sm:not-sr-only"
          >
            <LinkIcon size={16} />
          </CopyButton>
          <button
            type="button"
            onClick={togglePanel}
            aria-label="Toggle room details"
            title="Room details"
            className="btn size-10 shrink-0 rounded-[10px] border border-line bg-surface text-fg"
          >
            <PanelIcon size={18} />
          </button>
        </header>

        {isLockin && (
          <p className="m-0 border-b border-line bg-hi px-5 py-2 text-[13px] text-hi-fg">
            Timed sessions with goals and hourly check-ins arrive in the next update. For now this is a quiet room for your
            group.
          </p>
        )}

        <div
          ref={listRef}
          onScroll={onScroll}
          role="log"
          aria-label="Messages"
          aria-live="polite"
          className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 py-4 sm:px-3"
        >
          {!mounted ? (
            <div className="flex h-full items-center justify-center text-muted">
              <Spinner />
            </div>
          ) : (
            <>
              {hasMore ? (
                <div className="flex justify-center pb-3">
                  <button
                    type="button"
                    onClick={loadOlder}
                    disabled={loadingOlder}
                    className="btn min-h-9 rounded-full border border-line px-4 text-[13px] font-medium text-muted"
                  >
                    {loadingOlder ? <Spinner size={12} /> : null} Load older messages
                  </button>
                </div>
              ) : (
                <div className="mx-2 mb-4 flex flex-col gap-1 rounded-[14px] border border-line bg-surface p-4">
                  <span className="font-semibold">This is the start of {room.name}</span>
                  <span className="text-sm text-muted">
                    Share the invite link so your team can join. Messages here stay on your laptops, not your phones.
                  </span>
                </div>
              )}

              {messages.map((m, i) => {
                const prev = messages[i - 1];
                const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
                const grouped =
                  !newDay &&
                  !!prev &&
                  prev.user_id === m.user_id &&
                  prev.type !== "system" &&
                  m.type !== "system" &&
                  !m.reply_to &&
                  new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < GROUP_MS;
                const replyMsg = m.reply_to ? msgById.get(m.reply_to) : undefined;
                return (
                  <div key={m.id}>
                    {newDay && (
                      <div className="mx-2 my-3 flex items-center gap-3 text-xs text-muted">
                        <span className="h-px flex-1 bg-line" />
                        {dayLabel(m.created_at)}
                        <span className="h-px flex-1 bg-line" />
                      </div>
                    )}
                    <MessageItem
                      m={m}
                      author={byId.get(m.user_id)}
                      grouped={grouped}
                      isMine={m.user_id === meId}
                      reactions={Array.from(reactionGroups.get(m.id)?.values() ?? [])}
                      reply={replyMsg ? { message: replyMsg, author: byId.get(replyMsg.user_id) } : undefined}
                      usernames={usernames}
                      meUsername={me?.username ?? ""}
                      onReply={setReplyTo}
                      onReact={toggleReaction}
                      onDelete={deleteMessage}
                      onRetry={retry}
                      onJumpTo={jumpTo}
                    />
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div className="relative">
          <div aria-live="polite" className="h-5 px-6 text-xs text-muted">
            {typingNames.length > 0 &&
              `${typingNames.slice(0, 2).join(" and ")}${typingNames.length > 2 ? " and others" : ""} ${
                typingNames.length === 1 ? "is" : "are"
              } typing…`}
          </div>
          {toast && (
            <div
              role="status"
              className="rise absolute bottom-full left-1/2 z-30 mb-2 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-inv px-4 py-2.5 text-sm text-inv-fg shadow-lg"
            >
              <span>{toast.text}</span>
              {toast.action && (
                <button type="button" onClick={toast.action.run} className="btn p-0 font-semibold underline">
                  {toast.action.label}
                </button>
              )}
            </div>
          )}
          <Composer
            roomName={room.name}
            members={members}
            meId={meId}
            replyTo={replyTo}
            replyAuthor={replyTo ? byId.get(replyTo.user_id) : undefined}
            onCancelReply={() => setReplyTo(null)}
            onSend={(text) => send("text", text)}
            onGif={(g: GifMeta) => send("gif", "", g as unknown as Record<string, unknown>)}
            onSticker={(s: StickerMeta) => send("sticker", "", s as unknown as Record<string, unknown>)}
            onFiles={uploadFiles}
            onTyping={sendTyping}
          />
        </div>
      </section>

      <aside
        aria-label="Room details"
        className={`${panelClass} fixed inset-y-0 right-0 z-30 w-[min(340px,90vw)] flex-col border-l border-line bg-surface xl:static xl:z-auto xl:w-[320px]`}
      >
        <SidePanel
          room={room}
          meId={meId}
          members={members}
          messages={messages}
          origin={origin}
          onClose={() => setPanel(false)}
          onJumpTo={jumpTo}
        />
      </aside>
    </div>
  );
}
