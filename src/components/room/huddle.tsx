"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Participant as LkParticipant, RemoteTrack, Room as LkRoom, Track as LkTrack } from "livekit-client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Avatar } from "@/components/avatar";
import type { Member } from "@/lib/types";
import { HeadphonesIcon, MicIcon, MicOffIcon, PhoneOffIcon, ScreenIcon, XIcon } from "../icons";
import { Spinner } from "../setup-chat";

type Person = {
  id: string;
  name: string;
  avatar: string | null;
  local: boolean;
  speaking: boolean;
  muted: boolean;
  sharing: boolean;
};

type Screen = { owner: string; name: string; track: LkTrack };

/**
 * Voice huddles with screen share, on LiveKit. The client library only loads
 * when someone joins, so rooms stay light for everyone else.
 */
export function useHuddle({
  roomId,
  meId,
  members,
  channel,
  enabled,
}: {
  roomId: string;
  meId: string;
  members: Map<string, Member>;
  channel: React.RefObject<RealtimeChannel | null>;
  enabled: boolean;
}) {
  const roomRef = useRef<LkRoom | null>(null);
  const audioEls = useRef(new Set<HTMLMediaElement>());
  const [state, setState] = useState<"idle" | "joining" | "in">("idle");
  const [people, setPeople] = useState<Person[]>([]);
  const [screens, setScreens] = useState<Screen[]>([]);
  const [error, setError] = useState("");
  const [needsTap, setNeedsTap] = useState(false);
  const [lobby, setLobby] = useState<{ id: string; name: string }[]>([]);
  const membersRef = useRef(members);
  useEffect(() => {
    membersRef.current = members;
  }, [members]);

  // Who's in the huddle while you're not: fetched on load and when someone joins or leaves.
  const refreshLobby = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch(`/api/huddle/${roomId}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { participants: { id: string; name: string }[] };
      setLobby(json.participants ?? []);
    } catch {}
  }, [roomId, enabled]);

  useEffect(() => {
    // Runs once on mount (and when the room changes) to see who's already talking.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshLobby();
    const t = setInterval(refreshLobby, 60_000);
    return () => clearInterval(t);
  }, [refreshLobby]);

  const announce = useCallback(() => {
    void channel.current?.send({ type: "broadcast", event: "huddle-changed", payload: {} });
  }, [channel]);

  const sync = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const all: LkParticipant[] = [room.localParticipant, ...room.remoteParticipants.values()];
    const shots: Screen[] = [];
    setPeople(
      all.map((p) => {
        const member = membersRef.current.get(p.identity);
        let avatar: string | null = member?.avatar_url ?? null;
        if (!avatar && p.metadata) {
          try {
            avatar = (JSON.parse(p.metadata) as { avatar_url?: string | null }).avatar_url ?? null;
          } catch {}
        }
        const screenPub = [...p.trackPublications.values()].find((t) => t.source === "screen_share" && t.track);
        if (screenPub?.track) shots.push({ owner: p.identity, name: p.name || member?.name || "Someone", track: screenPub.track });
        return {
          id: p.identity,
          name: p.name || member?.name || "Someone",
          avatar,
          local: p.identity === room.localParticipant.identity,
          speaking: p.isSpeaking,
          muted: !p.isMicrophoneEnabled,
          sharing: Boolean(screenPub),
        };
      }),
    );
    setScreens(shots);
    setNeedsTap(!room.canPlaybackAudio);
  }, []);

  const cleanup = useCallback(() => {
    audioEls.current.forEach((el) => el.remove());
    audioEls.current.clear();
    roomRef.current = null;
    setPeople([]);
    setScreens([]);
    setState("idle");
  }, []);

  const join = useCallback(async () => {
    if (roomRef.current) return;
    setError("");
    setState("joining");
    try {
      const res = await fetch(`/api/huddle/${roomId}/token`, { method: "POST" });
      const json = (await res.json()) as { url?: string; token?: string; error?: string };
      if (!res.ok || !json.url || !json.token) throw new Error(json.error ?? "Couldn't start the huddle.");
      const { Room, RoomEvent, Track } = await import("livekit-client");
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      roomRef.current = room;
      room
        .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          if (track.kind === Track.Kind.Audio) {
            const el = track.attach();
            el.style.display = "none";
            document.body.appendChild(el);
            audioEls.current.add(el);
          }
          sync();
        })
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          track.detach().forEach((el) => {
            audioEls.current.delete(el);
            el.remove();
          });
          sync();
        })
        .on(RoomEvent.ParticipantConnected, sync)
        .on(RoomEvent.ParticipantDisconnected, sync)
        .on(RoomEvent.ActiveSpeakersChanged, sync)
        .on(RoomEvent.TrackMuted, sync)
        .on(RoomEvent.TrackUnmuted, sync)
        .on(RoomEvent.LocalTrackPublished, sync)
        .on(RoomEvent.LocalTrackUnpublished, sync)
        .on(RoomEvent.TrackPublished, sync)
        .on(RoomEvent.TrackUnpublished, sync)
        .on(RoomEvent.AudioPlaybackStatusChanged, sync)
        .on(RoomEvent.Disconnected, () => {
          cleanup();
          announce();
        });
      await room.connect(json.url, json.token);
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch {
        setError("Byte can't use your microphone, so you joined muted. Allow it in your browser's site settings.");
      }
      setState("in");
      sync();
      announce();
    } catch (e) {
      await roomRef.current?.disconnect();
      cleanup();
      setError(e instanceof Error ? e.message : "Couldn't start the huddle.");
    }
  }, [roomId, sync, cleanup, announce]);

  const leave = useCallback(async () => {
    await roomRef.current?.disconnect();
    cleanup();
    announce();
    void refreshLobby();
  }, [cleanup, announce, refreshLobby]);

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled);
      setError("");
    } catch {
      setError("Byte can't use your microphone. Allow it in your browser's site settings.");
    }
    sync();
  }, [sync]);

  const toggleScreen = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.localParticipant.setScreenShareEnabled(!room.localParticipant.isScreenShareEnabled, { audio: true });
      setError("");
    } catch (e) {
      if ((e as Error)?.name !== "NotAllowedError") setError("Couldn't share your screen.");
    }
    sync();
  }, [sync]);

  const unlockAudio = useCallback(async () => {
    await roomRef.current?.startAudio();
    sync();
  }, [sync]);

  // Leave cleanly when the page goes away.
  useEffect(() => {
    const bye = () => void roomRef.current?.disconnect();
    window.addEventListener("pagehide", bye);
    return () => {
      window.removeEventListener("pagehide", bye);
      bye();
    };
  }, []);

  return {
    state,
    people,
    screens,
    lobby: lobby.filter((p) => p.id !== meId),
    error,
    clearError: () => setError(""),
    needsTap,
    join,
    leave,
    toggleMic,
    toggleScreen,
    unlockAudio,
    refreshLobby,
  };
}

const noop = () => () => {};

export type HuddleApi = ReturnType<typeof useHuddle>;

/** Header button: join the huddle, with faces of whoever is already in it. */
export function HuddleButton({ huddle, members }: { huddle: HuddleApi; members: Map<string, Member> }) {
  if (huddle.state === "in") return null;
  const inside = huddle.lobby;
  return (
    <button
      type="button"
      onClick={() => void huddle.join()}
      disabled={huddle.state === "joining"}
      title={inside.length ? `Join ${inside.map((p) => p.name).join(", ")} in the huddle` : "Start a voice huddle"}
      className={`btn min-h-10 shrink-0 gap-2 rounded-[10px] border px-2.5 text-sm font-medium sm:px-3 ${
        inside.length ? "border-fg bg-sunk text-fg" : "border-line bg-surface text-fg"
      }`}
    >
      {huddle.state === "joining" ? <Spinner size={14} /> : <HeadphonesIcon size={16} />}
      {inside.length > 0 && (
        <span className="flex -space-x-2">
          {inside.slice(0, 3).map((p) => (
            <Avatar key={p.id} name={p.name} url={members.get(p.id)?.avatar_url} size={22} className="ring-2 ring-sunk" />
          ))}
        </span>
      )}
      <span className="sr-only lg:not-sr-only">{inside.length ? `Join huddle` : "Huddle"}</span>
    </button>
  );
}

/** The bar shown while you're in the huddle, plus the shared-screen viewer. */
export function HuddleBar({ huddle }: { huddle: HuddleApi }) {
  const [focused, setFocused] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string | null>(null);
  const me = huddle.people.find((p) => p.local);
  const canShare = useSyncExternalStore(
    noop,
    () => Boolean(navigator.mediaDevices?.getDisplayMedia),
    () => false,
  );
  const screen = huddle.screens.find((s) => s.owner === focused) ?? huddle.screens[0];

  if (huddle.state !== "in" && !huddle.error) return null;
  if (huddle.state !== "in")
    return (
      <p role="alert" className="m-0 flex items-center gap-3 border-b border-line bg-surface px-4 py-2.5 text-sm text-err sm:px-5">
        <span className="flex-1">{huddle.error}</span>
        <button type="button" onClick={huddle.clearError} aria-label="Dismiss" className="btn size-8 rounded-lg text-muted">
          <XIcon size={16} />
        </button>
      </p>
    );

  return (
    <section aria-label="Voice huddle" className="border-b border-line bg-surface">
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 sm:px-5">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex size-2.5 rounded-full bg-live" />
          </span>
          Huddle
        </span>
        <ul className="m-0 flex min-w-0 flex-1 list-none flex-wrap items-center gap-2 p-0">
          {huddle.people.map((p) => (
            <li key={p.id} title={`${p.local ? "You" : p.name}${p.muted ? " (muted)" : ""}${p.sharing ? " · sharing screen" : ""}`} className="relative">
              <span className={`block rounded-full ring-2 transition-shadow ${p.speaking && !p.muted ? "ring-live" : "ring-transparent"}`}>
                <Avatar name={p.name} url={p.avatar} size={32} tone={p.local ? "inv" : "sunk"} />
              </span>
              {p.muted && (
                <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-surface text-err ring-1 ring-line">
                  <MicOffIcon size={10} />
                </span>
              )}
              {p.sharing && (
                <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-inv text-inv-fg">
                  <ScreenIcon size={9} />
                </span>
              )}
              <span className="sr-only">
                {p.local ? "You" : p.name}
                {p.muted ? ", muted" : ""}
                {p.speaking ? ", speaking" : ""}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-1.5">
          {huddle.needsTap && (
            <button type="button" onClick={() => void huddle.unlockAudio()} className="btn min-h-10 rounded-[10px] bg-hi px-3 text-sm font-semibold text-hi-fg">
              Tap to hear everyone
            </button>
          )}
          <button
            type="button"
            onClick={() => void huddle.toggleMic()}
            aria-pressed={!me?.muted}
            aria-label={me?.muted ? "Unmute" : "Mute"}
            title={me?.muted ? "Unmute" : "Mute"}
            className={`btn size-10 rounded-[10px] border ${me?.muted ? "border-err/40 bg-sunk text-err" : "border-line text-fg"}`}
          >
            {me?.muted ? <MicOffIcon size={18} /> : <MicIcon size={18} />}
          </button>
          {canShare && (
            <button
              type="button"
              onClick={() => void huddle.toggleScreen()}
              aria-pressed={Boolean(me?.sharing)}
              aria-label={me?.sharing ? "Stop sharing your screen" : "Share your screen"}
              title={me?.sharing ? "Stop sharing" : "Share screen"}
              className={`btn size-10 rounded-[10px] border ${me?.sharing ? "border-fg bg-inv text-inv-fg" : "border-line text-fg"}`}
            >
              <ScreenIcon size={18} />
            </button>
          )}
          <button
            type="button"
            onClick={() => void huddle.leave()}
            className="btn min-h-10 rounded-[10px] bg-err px-3 text-sm font-semibold text-bg"
          >
            <PhoneOffIcon size={16} /> <span className="sr-only sm:not-sr-only">Leave</span>
          </button>
        </div>
      </div>

      {huddle.error && (
        <p role="alert" className="m-0 px-4 pb-2.5 text-[13px] text-err sm:px-5">
          {huddle.error}
        </p>
      )}

      {screen && hidden !== screen.owner + screen.track.sid && (
        <div className="border-t border-line bg-bg p-3 sm:px-5">
          <div className="mb-2 flex items-center gap-2 text-[13px] text-muted">
            <ScreenIcon size={14} />
            <span className="flex-1 truncate">
              {screen.owner === me?.id ? "You're sharing your screen" : `${screen.name} is sharing their screen`}
            </span>
            {huddle.screens.length > 1 &&
              huddle.screens.map((s) => (
                <button
                  key={s.owner}
                  type="button"
                  onClick={() => setFocused(s.owner)}
                  className={`btn min-h-8 rounded-lg px-2 text-[13px] ${s.owner === screen.owner ? "bg-sunk font-semibold text-fg" : "text-muted"}`}
                >
                  {s.name}
                </button>
              ))}
            <button type="button" onClick={() => setHidden(screen.owner + screen.track.sid)} className="btn min-h-8 rounded-lg px-2 text-[13px] text-muted">
              Hide
            </button>
          </div>
          <ScreenView track={screen.track} />
        </div>
      )}
    </section>
  );
}

function ScreenView({ track }: { track: LkTrack }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      onDoubleClick={(e) => void (e.currentTarget as HTMLVideoElement).requestFullscreen?.()}
      title="Double-click for full screen"
      className="max-h-[55vh] w-full rounded-xl bg-black object-contain"
    />
  );
}
