"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import { CopyButton } from "@/components/copy-button";
import { LinkIcon } from "@/components/icons";
import {
  type ChatLine,
  Chips,
  ProfilePreview,
  SetupChatLayout,
  Spinner,
  TextAnswer,
} from "@/components/setup-chat";
import { useAuthHashError } from "@/lib/auth-hash";
import { createClient } from "@/lib/supabase/client";
import { parseInviteCode, suggestUsername } from "@/lib/utils";
import { NAME_KEY } from "../signup/signup-chat";

type Step = "name" | "username" | "role" | "tz" | "tzpick" | "room" | "roomname" | "invite" | "done";
type Props = { userId: string; defaultName: string; email: string; signIn: string; next: string | null; avatarUrl: string | null };

const ROLES = ["Frontend", "Backend", "Full-stack", "Design", "Product", "Data / AI", "Just studying"];
const ROOM_CHOICES = {
  lockin: "Start a lock-in room",
  build: "Start a build room",
  invite: "Join with an invite link",
  skip: "Skip for now",
} as const;
const USERNAME_RE = /^[a-z0-9_]{3,24}$/;
const STEP_INDEX: Record<Step, number> = {
  name: 1,
  username: 2,
  role: 3,
  tz: 4,
  tzpick: 4,
  room: 5,
  roomname: 5,
  invite: 5,
  done: 6,
};

const subscribe = () => () => {};

export function OnboardingChat(props: Props) {
  // localStorage and the browser's time zone only exist on the client.
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  if (!mounted) return null;
  return <Chat {...props} />;
}

function tzLabel(tz: string) {
  try {
    const parts = new Intl.DateTimeFormat("en", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(new Date());
    const offset = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    return `${tz.replace(/_/g, " ")} (${offset})`;
  } catch {
    return tz;
  }
}

function firstLines(name: string): ChatLine[] {
  return name
    ? [
        { from: "bot", text: `You're signed in. Welcome to Byte, ${name.split(" ")[0]}.` },
        { from: "bot", text: "Pick a username. It's how people @mention you." },
      ]
    : [
        { from: "bot", text: "You're signed in. Welcome to Byte." },
        { from: "bot", text: "What should your team call you?" },
      ];
}

function Chat({ userId, defaultName, email, signIn, next, avatarUrl }: Props) {
  const router = useRouter();
  useAuthHashError(); // you're signed in; a leftover "link expired" hash is just noise
  const supabase = useMemo(() => createClient(), []);
  const detectedTz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);
  const allZones = useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return [detectedTz];
    }
  }, [detectedTz]);

  const typedName = (window.localStorage.getItem(NAME_KEY) ?? "").trim();
  const startName = typedName || defaultName;

  const [step, setStep] = useState<Step>(startName ? "username" : "name");
  const [lines, setLines] = useState<ChatLine[]>(() => firstLines(startName));
  const [name, setName] = useState(startName);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("");
  const [tz, setTz] = useState("");
  const [pickTz, setPickTz] = useState(detectedTz);
  const [draft, setDraft] = useState(() => (startName ? suggestUsername(startName, email) : ""));
  const [roomKind, setRoomKind] = useState<"lockin" | "build">("build");
  const [room, setRoom] = useState<{ id: string; invite: string; lockin: boolean } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const say = (...add: ChatLine[]) => setLines((l) => [...l, ...add]);

  function restart() {
    setStep(startName ? "username" : "name");
    setLines(firstLines(startName));
    setName(startName);
    setUsername("");
    setRole("");
    setTz("");
    setDraft(startName ? suggestUsername(startName, email) : "");
    setError("");
    setRoom(null);
  }

  async function saveProfile(timezone: string) {
    setBusy(true);
    const { error: err } = await supabase.from("profiles").insert({
      id: userId,
      name,
      username,
      role: role || null,
      timezone,
      avatar_url: avatarUrl,
    });
    setBusy(false);
    if (err) {
      if (err.code === "23505") {
        say({ from: "bot", text: `Someone grabbed @${username} a moment ago. Pick another username.` });
        setDraft(`${username}_`);
        setStep("username");
      } else {
        setError(`We couldn't save your profile: ${err.message}`);
      }
      return false;
    }
    window.localStorage.removeItem(NAME_KEY);
    return true;
  }

  async function confirmTz(timezone: string, answer: string) {
    setTz(timezone);
    say({ from: "me", text: answer });
    if (!(await saveProfile(timezone))) return;
    if (next) {
      say({ from: "bot", text: "You're all set. Taking you to your invite now." });
      setStep("done");
      router.replace(next);
      return;
    }
    say({ from: "bot", text: "Last one. Do you want to start a room, or join your team's?" });
    setStep("room");
  }

  let controls: React.ReactNode = null;
  switch (step) {
    case "name":
      controls = (
        <TextAnswer
          id="ob-name"
          label="Your name"
          autoComplete="name"
          maxLength={60}
          value={draft}
          error={error}
          onChange={(v) => {
            setDraft(v);
            setError("");
          }}
          onSubmit={() => {
            const v = draft.trim();
            if (!v) return setError("Type a name so your team knows who you are.");
            setName(v);
            say({ from: "me", text: v }, { from: "bot", text: "Now pick a username. It's how people @mention you." });
            setDraft(suggestUsername(v, email));
            setStep("username");
          }}
        />
      );
      break;

    case "username":
      controls = (
        <TextAnswer
          id="ob-username"
          label="username"
          prefix="@"
          autoComplete="username"
          maxLength={24}
          value={draft}
          busy={busy}
          error={error}
          onChange={(v) => {
            setDraft(v.toLowerCase().replace(/^@/, ""));
            setError("");
          }}
          onSubmit={async () => {
            const u = draft.trim();
            if (!USERNAME_RE.test(u))
              return setError("Use 3 to 24 lowercase letters, numbers or underscores.");
            setBusy(true);
            const { data, error: err } = await supabase.from("profiles").select("id").eq("username", u).maybeSingle();
            setBusy(false);
            if (err) return setError(`We couldn't check that username: ${err.message}`);
            if (data && data.id !== userId)
              return setError(`@${u} is taken. Try @${u}_ or @${u}${Math.floor(10 + Math.random() * 89)}.`);
            setUsername(u);
            setDraft("");
            say({ from: "me", text: `@${u}` }, { from: "bot", text: "What do you mostly do on your team?" });
            setStep("role");
          }}
        />
      );
      break;

    case "role":
      controls = (
        <Chips
          options={[...ROLES, "Skip"]}
          onPick={(r) => {
            setRole(r === "Skip" ? "" : r);
            say(
              { from: "me", text: r },
              {
                from: "bot",
                text: `Looks like you're on ${tzLabel(detectedTz)}. Lock-in times will use this. Right?`,
              },
            );
            setStep("tz");
          }}
        />
      );
      break;

    case "tz":
      controls = busy ? (
        <Saving />
      ) : (
        <>
          <Chips
            options={["Yes, that's right", "Pick another"]}
            onPick={(o) => {
              if (o === "Pick another") {
                say({ from: "me", text: o }, { from: "bot", text: "No problem. Which time zone are you on?" });
                setStep("tzpick");
              } else {
                void confirmTz(detectedTz, o);
              }
            }}
          />
          {error && (
            <p role="alert" className="m-0 text-sm text-err">
              {error}
            </p>
          )}
        </>
      );
      break;

    case "tzpick":
      controls = (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) void confirmTz(pickTz, tzLabel(pickTz));
          }}
        >
          <label htmlFor="ob-tz" className="sr-only">
            Time zone
          </label>
          <div className="flex gap-2">
            <select
              id="ob-tz"
              value={pickTz}
              onChange={(e) => setPickTz(e.target.value)}
              className="min-h-12 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 text-base text-fg"
            >
              {allZones.map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            <button type="submit" disabled={busy} className="btn min-h-12 rounded-xl bg-inv px-5 font-semibold text-inv-fg">
              {busy ? <Spinner /> : "Use this"}
            </button>
          </div>
          {error && (
            <p role="alert" className="m-0 text-sm text-err">
              {error}
            </p>
          )}
        </form>
      );
      break;

    case "room":
      controls = (
        <Chips
          options={Object.values(ROOM_CHOICES)}
          onPick={(o) => {
            say({ from: "me", text: o });
            if (o === ROOM_CHOICES.skip) {
              say({ from: "bot", text: "Cool. You can start or join a room any time from the sidebar." });
              setStep("done");
              router.push("/app");
            } else if (o === ROOM_CHOICES.invite) {
              say({ from: "bot", text: "Paste the invite link your team sent you." });
              setDraft("");
              setStep("invite");
            } else {
              const kind = o === ROOM_CHOICES.lockin ? "lockin" : "build";
              setRoomKind(kind);
              setDraft(kind === "lockin" ? "Morning lock-in" : `${name.split(" ")[0]}'s project`);
              say({ from: "bot", text: "What should we call it? You can change it later." });
              setStep("roomname");
            }
          }}
        />
      );
      break;

    case "roomname":
      controls = (
        <TextAnswer
          id="ob-roomname"
          label="Room name"
          maxLength={60}
          value={draft}
          busy={busy}
          error={error}
          onChange={(v) => {
            setDraft(v);
            setError("");
          }}
          onSubmit={async () => {
            const n = draft.trim();
            if (!n) return setError("Give the room a name, even a short one.");
            setBusy(true);
            const { data, error: err } = await supabase.rpc("create_room", { room_name: n, room_type: roomKind });
            setBusy(false);
            if (err || !data) return setError(`We couldn't create the room: ${err?.message ?? "unknown error"}`);
            const created = data as { id: string; invite_code: string };
            setRoom({
              id: created.id,
              invite: `${window.location.origin}/join/${created.invite_code}`,
              lockin: roomKind === "lockin",
            });
            say(
              { from: "me", text: n },
              { from: "bot", text: `You're in, ${name.split(" ")[0]}. Your room is ready. Share this link with your team and you're set.` },
            );
            setStep("done");
          }}
        />
      );
      break;

    case "invite":
      controls = (
        <TextAnswer
          id="ob-invite"
          label="https://…/join/…"
          type="url"
          value={draft}
          error={error}
          onChange={(v) => {
            setDraft(v);
            setError("");
          }}
          onSubmit={() => {
            const code = parseInviteCode(draft);
            if (!code) return setError("That doesn't look like a Byte invite link. It should end in /join/ and a code.");
            setStep("done");
            router.push(`/join/${code}`);
          }}
        />
      );
      break;

    case "done":
      controls = room ? null : <Saving label="Taking you there…" />;
      break;
  }

  return (
    <SetupChatLayout
      step={STEP_INDEX[step]}
      total={6}
      lines={lines}
      controls={controls}
      onRestart={step === "done" || STEP_INDEX[step] >= 5 ? undefined : restart}
      aside={
        <ProfilePreview
          name={name}
          username={username || (step === "username" ? draft : "")}
          role={role}
          timezone={tz ? tzLabel(tz) : undefined}
          signIn={signIn}
        />
      }
    >
      {room && (
        <div className="ml-[38px] flex max-w-[440px] flex-col gap-3 rounded-2xl border border-line bg-bg p-4 rise">
          <span className="text-[13px] text-muted">Your invite link</span>
          <div className="flex items-center gap-2 rounded-[10px] border border-line bg-surface py-1.5 pl-3 pr-1.5">
            <LinkIcon size={16} className="shrink-0 text-muted" />
            <span className="flex-1 truncate font-mono text-sm">{room.invite.replace(/^https?:\/\//, "")}</span>
            <CopyButton text={room.invite} className="min-h-9 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-fg" />
          </div>
          {room.lockin && (
            <p className="m-0 text-[13px] leading-normal text-muted">
              In the room, hit &ldquo;Start lock-in&rdquo;, pick a time, and everyone drops a goal. Byte checks in every hour
              and posts a recap at the end.
            </p>
          )}
          <button
            type="button"
            onClick={() => router.push(`/app/r/${room.id}`)}
            className="btn min-h-12 rounded-[10px] bg-inv px-[18px] font-semibold text-inv-fg"
          >
            Open my room
          </button>
        </div>
      )}
    </SetupChatLayout>
  );
}

function Saving({ label = "Saving your profile…" }: { label?: string }) {
  return (
    <div role="status" className="flex min-h-11 items-center gap-2 text-sm text-muted">
      <Spinner /> {label}
    </div>
  );
}
