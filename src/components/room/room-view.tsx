"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { sessionEnd, sessionPhase } from "@/lib/session";
import { createClient } from "@/lib/supabase/client";
import { publicOrigin } from "@/lib/site";
import type {
  FileMeta,
  GifMeta,
  Member,
  Message,
  Participant,
  Reaction,
  Room,
  Session,
  SessionRecapRow,
  SessionSummary,
  StickerMeta,
  VoiceMeta,
} from "@/lib/types";
import { useNow } from "@/lib/use-now";
import { CopyButton } from "../copy-button";
import { HashIcon, LinkIcon, PanelIcon, TimerIcon } from "../icons";
import { Spinner } from "../setup-chat";
import { Board } from "../session/board";
import { RECAP_GRACE_MS, SessionBar, type CheckinFn } from "../session/session-bar";
import { SessionDialog } from "../session/session-dialog";
import { useFocusTracker } from "../session/use-focus-tracker";
import { Composer } from "./composer";
import { HuddleBar, HuddleButton, useHuddle } from "./huddle";
import { MessageItem, type ReactionGroup } from "./message-item";
import { SidePanel } from "./side-panel";

const PAGE = 50;
const MAX_FILE = 25 * 1024 * 1024;
const GROUP_MS = 5 * 60 * 1000;
const SESSION_EVENT_TYPES = new Set(["checkin", "progress", "done"]);
const NOTE_TYPES = new Set(["text", "checkin", "progress", "done", "file", "voice"]);

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

export type RoomViewProps = {
  room: Room;
  meId: string;
  initialMembers: Member[];
  initialMessages: Message[];
  initialReactions: Reaction[];
  initialHasMore: boolean;
  initialSession: Session | null;
  initialParticipants: Participant[];
  initialEvents: Message[];
  initialSummary: SessionSummary | null;
  initialRecaps: SessionRecapRow[];
  calm: boolean;
  aiConfigured: boolean;
  transcribeOn: boolean;
  huddleOn: boolean;
  notionOn: boolean;
};

export function RoomView({
  room: initialRoom,
  meId,
  initialMembers,
  initialMessages,
  initialReactions,
  initialHasMore,
  initialSession,
  initialParticipants,
  initialEvents,
  initialSummary,
  initialRecaps,
  calm,
  aiConfigured,
  transcribeOn,
  huddleOn,
  notionOn,
}: RoomViewProps) {
  const supabase = useMemo(() => createClient(), []);
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const origin = useSyncExternalStore(
    subscribe,
    publicOrigin,
    () => "",
  );
  const now = useNow(15_000); // coarse clock for session phase changes

  const [room, setRoom] = useState(initialRoom);
  const [members, setMembers] = useState(initialMembers);
  const [messages, setMessages] = useState(initialMessages);
  const [reactions, setReactions] = useState(initialReactions);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [typing, setTyping] = useState<Record<string, number>>({});
  const [panel, setPanel] = useState<boolean | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [connected, setConnected] = useState(true);
  const [aiThinking, setAiThinking] = useState<string | null>(null);

  const [session, setSession] = useState<Session | null>(initialSession);
  const [participants, setParticipants] = useState(initialParticipants);
  const [events, setEvents] = useState(initialEvents);
  const [summary, setSummary] = useState(initialSummary);
  const [recaps, setRecaps] = useState(initialRecaps);
  const [sessionDialog, setSessionDialog] = useState(false);
  const [view, setView] = useState<"board" | "chat" | null>(null);
  const [recapBusy, setRecapBusy] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastTypingSent = useRef(0);
  const prevHeight = useRef<number | null>(null);
  const pendingDelete = useRef<{ id: string; timer: ReturnType<typeof setTimeout>; commit: () => void } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionRef = useRef<Session | null>(initialSession);
  const lastSummaryCall = useRef(0);
  const lastRecapCall = useRef(0);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const usernames = useMemo(() => new Set([...members.map((m) => m.username), "ai"]), [members]);
  const me = byId.get(meId);
  const msgById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const isOwner = room.owner_id === meId;
  const aiOn = aiConfigured && room.ai_enabled;

  const showToast = useCallback((t: Toast, ms = 5000) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);

  // ── State helpers ────────────────────────────────────────────────────
  const upsert = useCallback((incoming: Message) => {
    setMessages((prev) => {
      const i = prev.findIndex((m) => m.id === incoming.id);
      if (i >= 0) {
        const next = prev.slice();
        next[i] = { ...incoming, pending: false, failed: false };
        return next;
      }
      const next = [...prev, incoming];
      if (prev.length && prev[prev.length - 1].created_at > incoming.created_at) {
        next.sort((a, b) => a.created_at.localeCompare(b.created_at));
      }
      return next;
    });
    if (incoming.session_id && SESSION_EVENT_TYPES.has(incoming.type) && incoming.session_id === sessionRef.current?.id) {
      setEvents((prev) => (prev.some((e) => e.id === incoming.id) ? prev : [...prev, incoming]));
    }
  }, []);

  const upsertParticipant = useCallback((p: Participant) => {
    if (p.session_id !== sessionRef.current?.id) return;
    setParticipants((prev) => {
      const i = prev.findIndex((x) => x.user_id === p.user_id);
      if (i < 0) return [...prev, p];
      const next = prev.slice();
      next[i] = p;
      return next;
    });
  }, []);

  const adoptSession = useCallback((s: Session) => {
    const cur = sessionRef.current;
    if (cur && cur.id !== s.id && s.starts_at < cur.starts_at) return;
    if (!cur || cur.id !== s.id) {
      setParticipants([]);
      setEvents([]);
      setSummary(null);
      setView(null);
    }
    sessionRef.current = s;
    setSession(s);
  }, []);

  const catchUp = useCallback(async () => {
    const newest = [...messages].reverse().find((m) => !m.pending)?.created_at;
    let q = supabase.from("messages").select("*").eq("room_id", room.id).order("created_at", { ascending: true }).limit(200);
    if (newest) q = q.gt("created_at", newest);
    const { data } = await q;
    (data as Message[] | null)?.forEach(upsert);
    const cur = sessionRef.current;
    if (cur) {
      const [{ data: s }, { data: parts }] = await Promise.all([
        supabase.from("sessions").select("*").eq("id", cur.id).maybeSingle(),
        supabase.from("session_participants").select("*").eq("session_id", cur.id),
      ]);
      if (s) adoptSession(s as Session);
      (parts as Participant[] | null)?.forEach(upsertParticipant);
    }
  }, [messages, room.id, supabase, upsert, adoptSession, upsertParticipant]);
  const catchUpRef = useRef(catchUp);
  useEffect(() => {
    catchUpRef.current = catchUp;
  }, [catchUp]);

  // Someone removed us (or deleted the room): say so and go home.
  const router = useRouter();
  const leaveFor = useCallback(
    (text: string) => {
      try {
        sessionStorage.setItem("byte:notice", text);
      } catch {}
      router.replace("/app");
      router.refresh();
    },
    [router],
  );
  const leaveForRef = useRef(leaveFor);
  useEffect(() => {
    leaveForRef.current = leaveFor;
  }, [leaveFor]);

  const huddle = useHuddle({ roomId: room.id, meId, members: byId, channel: channelRef, enabled: huddleOn });
  const huddleRefreshRef = useRef(huddle.refreshLobby);
  useEffect(() => {
    huddleRefreshRef.current = huddle.refreshLobby;
  }, [huddle.refreshLobby]);

  // ── Realtime ─────────────────────────────────────────────────────────
  useEffect(() => {
    let subscribedOnce = false;
    const filter = `room_id=eq.${room.id}`;
    const ch = supabase
      .channel(`room:${room.id}`, { config: { private: true, broadcast: { self: false } } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter }, (p) => {
        const m = p.new as Message;
        upsert(m);
        if (m.type === "ai") setAiThinking((q) => (q && m.reply_to === q ? null : q));
        if (m.user_id)
          setTyping((t) => {
            if (!(m.user_id! in t)) return t;
            const next = { ...t };
            delete next[m.user_id!];
            return next;
          });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter }, (p) => upsert(p.new as Message))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "reactions", filter }, (p) => {
        const r = p.new as Reaction;
        setReactions((prev) =>
          prev.some((x) => x.message_id === r.message_id && x.user_id === r.user_id && x.emoji === r.emoji) ? prev : [...prev, r],
        );
      })
      .on("broadcast", { event: "reaction-removed" }, ({ payload }) => {
        const r = payload as Reaction;
        setReactions((prev) =>
          prev.filter((x) => !(x.message_id === r.message_id && x.user_id === r.user_id && x.emoji === r.emoji)),
        );
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "room_members", filter }, async (p) => {
        const row = p.new as { user_id: string; role: "owner" | "member" };
        const { data } = await supabase.from("profiles").select("id, name, username, role, avatar_url").eq("id", row.user_id).maybeSingle();
        if (data)
          setMembers((prev) =>
            prev.some((m) => m.id === data.id) ? prev : [...prev, { ...(data as Omit<Member, "member_role">), member_role: row.role }],
          );
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${room.id}` }, (p) =>
        setRoom((r) => ({ ...r, ...(p.new as Room) })),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter }, (p) => {
        if (p.eventType !== "DELETE") adoptSession(p.new as Session);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "session_participants", filter }, (p) => {
        if (p.eventType !== "DELETE") upsertParticipant(p.new as Participant);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "session_summaries", filter }, (p) => {
        const s = p.new as SessionSummary;
        if (p.eventType !== "DELETE" && s.session_id === sessionRef.current?.id) setSummary(s);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "session_recaps", filter }, (p) => {
        const r = p.new as SessionRecapRow;
        setRecaps((prev) => [r, ...prev.filter((x) => x.session_id !== r.session_id)].slice(0, 3));
        setRecapBusy(false);
      })
      .on("broadcast", { event: "member-removed" }, ({ payload }) => {
        const uid = (payload as { user_id?: string }).user_id;
        if (!uid) return;
        if (uid === meId) leaveForRef.current("You were removed from this room.");
        else setMembers((prev) => prev.filter((m) => m.id !== uid));
      })
      .on("broadcast", { event: "huddle-changed" }, () => void huddleRefreshRef.current())
      .on("broadcast", { event: "room-deleted" }, () => leaveForRef.current("The owner deleted this room."))
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const uid = (payload as { user_id?: string }).user_id;
        if (uid && uid !== meId) setTyping((t) => ({ ...t, [uid]: Date.now() }));
      });
    // Private channel: send the signed-in user's token first so Supabase can check membership.
    let cancelled = false;
    void supabase.realtime
      .setAuth()
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;
        ch.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            setConnected(true);
            if (subscribedOnce) void catchUpRef.current();
            subscribedOnce = true;
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            setConnected(false);
          }
        });
      });
    channelRef.current = ch;
    return () => {
      cancelled = true;
      channelRef.current = null;
      void supabase.removeChannel(ch);
    };
  }, [room.id, meId, supabase, upsert, adoptSession, upsertParticipant]);

  useEffect(() => {
    if (!Object.keys(typing).length) return;
    const t = setInterval(() => {
      const n = Date.now();
      setTyping((prev) => {
        const next = Object.fromEntries(Object.entries(prev).filter(([, at]) => n - at < 4000));
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 1500);
    return () => clearInterval(t);
  }, [typing]);

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

  // ── Session derived state + background triggers ──────────────────────
  const phase = session ? sessionPhase(session, now) : null;
  const myPart = participants.find((p) => p.user_id === meId);
  const sessionVisible =
    !!session &&
    (phase !== "ended" ||
      session.recap_status !== "done" ||
      (!!myPart?.goal && !myPart.dropped_at)) &&
    sessionEnd(session) > now - 6 * 60 * 60_000;
  const boardMode = room.type === "lockin" && sessionVisible && (view ?? (phase === "live" ? "board" : "chat")) === "board";

  useFocusTracker(
    session?.id ?? null,
    phase === "live" && !!myPart?.goal && !myPart.dropped_at,
    !!myPart?.on_break,
  );

  // Live AI notes: refresh after ~20 new messages, or after 10 quiet minutes with something new.
  useEffect(() => {
    if (!session || phase !== "live" || !aiOn) return;
    const since = summary?.last_message_at ?? session.starts_at;
    const fresh = messages.filter((m) => NOTE_TYPES.has(m.type) && !m.pending && m.created_at > since).length;
    const lastUpdate = new Date(summary?.updated_at ?? session.starts_at).getTime();
    const due = fresh >= 20 || (fresh >= 3 && now - lastUpdate > 10 * 60_000);
    if (!due || Date.now() - lastSummaryCall.current < 90_000) return;
    lastSummaryCall.current = Date.now();
    void fetch(`/api/sessions/${session.id}/summary`, { method: "POST" });
  }, [messages, session, phase, aiOn, summary, now]);

  const requestRecap = useCallback(
    async (manual = false) => {
      const s = sessionRef.current;
      if (!s) return;
      if (!manual && Date.now() - lastRecapCall.current < 60_000) return;
      lastRecapCall.current = Date.now();
      setRecapBusy(true);
      const res = await fetch(`/api/sessions/${s.id}/recap`, { method: "POST" });
      if (res.status >= 400) {
        setRecapBusy(false);
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        if (manual) showToast({ text: error ?? "Couldn't post the recap." });
      } else if (res.status === 202) {
        setTimeout(() => setRecapBusy(false), 8000);
      }
    },
    [showToast],
  );

  // Post the recap automatically once everyone has dropped, or 15 minutes after the end.
  useEffect(() => {
    if (!session || phase !== "ended" || session.recap_status === "done" || session.recap_status === "working") return;
    const holders = participants.filter((p) => p.goal);
    const allIn = holders.length > 0 && holders.every((p) => p.dropped_at);
    const graceOver = now > sessionEnd(session) + RECAP_GRACE_MS;
    if (allIn || graceOver || holders.length === 0) void requestRecap();
  }, [session, phase, participants, now, requestRecap]);

  const checkin: CheckinFn = useCallback(
    async (kind, body, met, pages) => {
      if (!session) return "No session.";
      const { data, error } = await supabase.rpc("session_checkin", {
        sid: session.id,
        kind,
        body,
        met: met ?? null,
        page: pages?.page ?? null,
        total_pages: pages?.total ?? null,
      });
      if (error) return error.message;
      if (data) upsert(data as Message);
      const { data: p } = await supabase
        .from("session_participants")
        .select("*")
        .eq("session_id", session.id)
        .eq("user_id", meId)
        .maybeSingle();
      if (p) upsertParticipant(p as Participant);
      return null;
    },
    [session, supabase, upsert, upsertParticipant, meId],
  );

  async function setBreak(on: boolean) {
    if (!session || !myPart) return;
    upsertParticipant({ ...myPart, on_break: on });
    const { error } = await supabase.rpc("set_break", { sid: session.id, on_break_now: on });
    if (error) {
      upsertParticipant(myPart);
      showToast({ text: "Couldn't change your break. Try again." });
    }
  }

  async function endSession() {
    if (!session) return;
    const { error } = await supabase.rpc("end_session", { sid: session.id });
    if (error) showToast({ text: error.message });
  }

  // ── Scrolling ────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (prevHeight.current !== null) {
      el.scrollTop += el.scrollHeight - prevHeight.current;
      prevHeight.current = null;
    } else if (atBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, mounted, boardMode]);

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
      setView("chat");
      requestAnimationFrame(() => {
        const el = document.getElementById(`m-${id}`);
        if (!el) return showToast({ text: "That message is further back. Load older messages to see it." });
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.animate([{ background: "var(--hi)" }, { background: "transparent" }], { duration: 1400, easing: "ease-out" });
      });
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
    const failed = Boolean(error && error.code !== "23505");
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, pending: false, failed } : x)));
    // Ping anyone you @mentioned or replied to (desktop notifications).
    if (!failed && (m.reply_to || /(^|\s)@[a-z0-9_]{3,24}\b/i.test(m.body.replace(/(^|\s)@ai\b/gi, "")))) {
      void fetch("/api/push/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: m.id }),
        keepalive: true,
      }).catch(() => {});
    }
    return !failed;
  }

  function draft(type: Message["type"], body: string, meta: Record<string, unknown> = {}, reply: string | null = null): Message {
    return {
      id: crypto.randomUUID(),
      room_id: room.id,
      user_id: meId,
      type,
      body,
      meta,
      reply_to: reply,
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      pending: true,
    };
  }

  async function send(type: Message["type"], body: string, meta: Record<string, unknown> = {}) {
    const m = draft(type, body, meta, replyTo?.id ?? null);
    atBottom.current = true;
    setMessages((prev) => [...prev, m]);
    setReplyTo(null);
    const ok = await insert(m);

    if (ok && type === "text" && /(^|\s)@ai\b/i.test(body)) {
      if (!aiConfigured) return showToast({ text: "@ai is off on this server. Add an AI provider to turn it on." });
      if (!room.ai_enabled) return showToast({ text: "The room owner turned AI off for this room." });
      setAiThinking(m.id);
      const res = await fetch(`/api/rooms/${room.id}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: body, messageId: m.id }),
      });
      if (!res.ok) {
        setAiThinking(null);
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        showToast({ text: error ?? "Byte AI couldn't answer." }, 7000);
      }
      setTimeout(() => setAiThinking((q) => (q === m.id ? null : q)), 45_000);
    }
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
      const m = draft("file", "", meta as unknown as Record<string, unknown>);
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

  async function sendVoice(blob: Blob, seconds: number, mime: string) {
    const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
    const meta: VoiceMeta = {
      path: `${room.id}/${crypto.randomUUID()}-voice.${ext}`,
      mime,
      size: blob.size,
      duration: Math.round(seconds),
    };
    const m = draft("voice", "", meta as unknown as Record<string, unknown>);
    atBottom.current = true;
    setMessages((prev) => [...prev, m]);
    const { error } = await supabase.storage.from("attachments").upload(meta.path, blob, { contentType: mime });
    if (error) {
      setMessages((prev) => prev.filter((x) => x.id !== m.id));
      return showToast({ text: `Couldn't send the voice note: ${error.message}` });
    }
    if ((await insert(m)) && transcribeOn) {
      void fetch("/api/voice/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: m.id }),
      });
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

  function editMessage(m: Message, body: string) {
    const original = m;
    const editedAt = new Date().toISOString();
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, body, edited_at: editedAt } : x)));
    void supabase
      .from("messages")
      .update({ body })
      .eq("id", m.id)
      .then(({ error }) => {
        if (error) {
          setMessages((prev) => prev.map((x) => (x.id === m.id ? original : x)));
          showToast({ text: "Couldn't save your edit." });
        }
      });
  }

  function deleteMessage(m: Message) {
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
    if (calm) return; // calm mode: don't broadcast typing either
    const n = Date.now();
    if (n - lastTypingSent.current < 2500) return;
    lastTypingSent.current = n;
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

  const typingNames = calm
    ? []
    : (Object.keys(typing)
        .map((id) => byId.get(id)?.name.split(" ")[0])
        .filter(Boolean) as string[]);

  const lastRecap = useMemo(() => {
    const prior = recaps.find((r) => !session || r.session_id !== session.id || phase === "ended");
    return prior?.recap ?? null;
  }, [recaps, session, phase]);

  const panelClass = panel === null ? "hidden xl:flex" : panel ? "flex" : "hidden";
  const togglePanel = () =>
    setPanel((p) => {
      const wide = typeof window !== "undefined" && window.matchMedia("(min-width: 1280px)").matches;
      const currentlyOpen = p === null ? wide : p;
      return !currentlyOpen;
    });

  const isLockin = room.type === "lockin";
  const canStart = !session || (phase === "ended" && (session.recap_status === "done" || now > sessionEnd(session) + RECAP_GRACE_MS));

  return (
    <div className="flex h-full min-h-0">
      <section aria-label={room.name} className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-line px-4 py-2.5 sm:gap-3 sm:px-5">
          <div className="flex min-w-0 flex-1 flex-col">
            <h1 className="m-0 flex items-center gap-2 truncate text-[17px] font-semibold">
              <span className="text-muted">{isLockin ? <TimerIcon size={16} /> : <HashIcon size={16} />}</span>
              <span className="truncate">{room.name}</span>
            </h1>
            <span className="truncate text-[13px] text-muted">
              {isLockin ? "Lock-in room" : "Build room"} · {members.length} {members.length === 1 ? "member" : "members"}
              {room.visibility === "public" ? " · open to everyone" : ""}
              {aiOn ? " · AI notes on" : ""}
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
          {isLockin && sessionVisible && (
            <div role="tablist" aria-label="View" className="hidden rounded-[10px] border border-line p-0.5 sm:flex">
              {(["board", "chat"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={(boardMode ? "board" : "chat") === v}
                  onClick={() => setView(v)}
                  className={`btn min-h-9 rounded-lg px-3 text-sm font-medium ${
                    (boardMode ? "board" : "chat") === v ? "bg-inv text-inv-fg" : "text-muted"
                  }`}
                >
                  {v === "board" ? "Board" : "Chat"}
                </button>
              ))}
            </div>
          )}
          {canStart && (
            <button
              type="button"
              onClick={() => setSessionDialog(true)}
              className="btn min-h-10 shrink-0 rounded-[10px] bg-inv px-3 text-sm font-semibold text-inv-fg sm:px-3.5"
            >
              <TimerIcon size={16} />
              <span className="sr-only sm:not-sr-only">{isLockin ? "Start lock-in" : "Start session"}</span>
            </button>
          )}
          {huddleOn && <HuddleButton huddle={huddle} members={byId} />}
          <CopyButton
            text={origin ? `${origin}/join/${room.invite_code}` : ""}
            label="Invite link"
            copiedLabel="Link copied"
            className="min-h-10 min-w-10 shrink-0 rounded-[10px] border border-line bg-surface px-2.5 text-sm font-medium text-fg sm:px-3.5"
            labelClassName="sr-only lg:not-sr-only"
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

        {huddleOn && <HuddleBar huddle={huddle} />}

        {session && sessionVisible && (
          <SessionBar
            session={session}
            participants={participants}
            events={events}
            meId={meId}
            canEnd={session.created_by === meId || isOwner}
            onCheckin={checkin}
            onBreak={setBreak}
            onEnd={endSession}
            onRecap={() => void requestRecap(true)}
            recapBusy={recapBusy}
          />
        )}

        {isLockin && sessionVisible && (
          <div role="tablist" aria-label="View" className="flex gap-1 border-b border-line p-2 sm:hidden">
            {(["board", "chat"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={(boardMode ? "board" : "chat") === v}
                onClick={() => setView(v)}
                className={`btn min-h-9 flex-1 rounded-lg text-sm font-medium ${
                  (boardMode ? "board" : "chat") === v ? "bg-inv text-inv-fg" : "text-muted"
                }`}
              >
                {v === "board" ? "Board" : "Chat"}
              </button>
            ))}
          </div>
        )}

        {boardMode && session ? (
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            <Board session={session} participants={participants} events={events} members={byId} meId={meId} />
            <p className="m-0 mt-6 text-[13px] text-muted">
              Chat is quiet during a lock-in: nothing pings anyone. Switch to Chat if you need the team.
            </p>
          </div>
        ) : (
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
                      {isLockin
                        ? "Start a lock-in, drop your goals, and check in as you go. Share the invite link so your people can join."
                        : "Share the invite link so your team can join. Start a session when it's time to build."}
                    </span>
                  </div>
                )}

                {messages.map((m, i) => {
                  const prev = messages[i - 1];
                  const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
                  const grouped =
                    !newDay &&
                    !!prev &&
                    !!m.user_id &&
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
                        author={m.user_id ? byId.get(m.user_id) : undefined}
                        grouped={grouped}
                        isMine={m.user_id === meId}
                        reactions={Array.from(reactionGroups.get(m.id)?.values() ?? [])}
                        reply={replyMsg ? { message: replyMsg, author: replyMsg.user_id ? byId.get(replyMsg.user_id) : undefined } : undefined}
                        usernames={usernames}
                        meUsername={me?.username ?? ""}
                        calm={calm}
                        transcribeOn={transcribeOn}
                        onReply={setReplyTo}
                        onReact={toggleReaction}
                        onDelete={deleteMessage}
                        onEdit={editMessage}
                        onRetry={retry}
                        onJumpTo={jumpTo}
                      />
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        <div className="relative">
          <div aria-live="polite" className="h-5 px-6 text-xs text-muted">
            {aiThinking
              ? "Byte AI is reading the room…"
              : typingNames.length > 0 &&
                `${typingNames.slice(0, 2).join(" and ")}${typingNames.length > 2 ? " and others" : ""} ${
                  typingNames.length === 1 ? "is" : "are"
                } typing…`}
          </div>
          {toast && (
            <div
              role="status"
              className="rise absolute bottom-full left-1/2 z-30 mb-2 flex w-max max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-3 rounded-xl bg-inv px-4 py-2.5 text-sm text-inv-fg shadow-lg"
            >
              <span>{toast.text}</span>
              {toast.action && (
                <button type="button" onClick={toast.action.run} className="btn shrink-0 p-0 font-semibold underline">
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
            replyAuthor={replyTo?.user_id ? byId.get(replyTo.user_id) : undefined}
            onCancelReply={() => setReplyTo(null)}
            onSend={(text) => {
              if (boardMode) setView("chat");
              void send("text", text);
            }}
            onGif={(g: GifMeta) => void send("gif", "", g as unknown as Record<string, unknown>)}
            onSticker={(s: StickerMeta) => void send("sticker", "", s as unknown as Record<string, unknown>)}
            onFiles={uploadFiles}
            onTyping={sendTyping}
            onVoice={(b, s, mime) => void sendVoice(b, s, mime)}
            onError={(msg) => showToast({ text: msg }, 7000)}
            aiAvailable={aiOn}
            notionOn={notionOn}
            roomPath={`/app/r/${room.id}`}
            onShare={(items) => {
              if (boardMode) setView("chat");
              for (const a of items) void send("text", a.url, { attachment: a });
            }}
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
          onRoomChange={(r) => setRoom((cur) => ({ ...cur, ...r }))}
          session={session}
          sessionLive={phase === "live"}
          participants={participants}
          events={events}
          summary={summary}
          lastRecap={lastRecap}
          aiState={!aiConfigured ? "not-configured" : room.ai_enabled ? "on" : "room-off"}
          showBoard={!isLockin && sessionVisible}
          beforeMemberRemoved={async (uid) => {
            // Tell them while they can still hear the room (private channels drop non-members).
            await channelRef.current?.send({ type: "broadcast", event: "member-removed", payload: { user_id: uid } });
          }}
          onMemberRemoved={(uid) => setMembers((prev) => prev.filter((m) => m.id !== uid))}
          beforeRoomDeleted={async () => {
            await channelRef.current?.send({ type: "broadcast", event: "room-deleted", payload: {} });
          }}
          onRoomDeleted={() => leaveFor("Room deleted.")}
        />
      </aside>

      <SessionDialog
        open={sessionDialog}
        roomId={room.id}
        roomType={room.type}
        onClose={() => setSessionDialog(false)}
        onCreated={(s) => {
          adoptSession(s);
          setView(null);
          void supabase
            .from("session_participants")
            .select("*")
            .eq("session_id", s.id)
            .then(({ data }) => (data as Participant[] | null)?.forEach(upsertParticipant));
        }}
      />
    </div>
  );
}
