"use client";

import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useActionState, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { setAvatar, setCalmMode, signOut, updateProfile } from "@/app/actions";
import { Avatar } from "@/components/avatar";
import { BellIcon, GoogleIcon, LeafIcon, LogoutIcon, TrashIcon, UploadIcon } from "@/components/icons";
import { Spinner } from "@/components/setup-chat";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/supabase/server";
import { disableReminders, enableReminders, notificationsSupported, remindersOn, REMINDERS_EVENT } from "@/lib/reminders";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const subscribe = () => () => {};
function subscribeReminders(cb: () => void) {
  window.addEventListener(REMINDERS_EVENT, cb);
  return () => window.removeEventListener(REMINDERS_EVENT, cb);
}

const input =
  "min-h-12 w-full rounded-xl border border-line bg-bg px-3.5 text-base text-fg outline-none placeholder:text-muted focus-visible:border-fg focus-visible:ring-1 focus-visible:ring-fg aria-[invalid=true]:border-err";

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 font-display text-xl font-extrabold tracking-[-0.01em]">{title}</h2>
        {hint && <p className="m-0 text-sm text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function SettingsForm({
  profile,
  email,
  provider,
  googlePhoto,
  gravatar,
}: {
  profile: Profile;
  email: string;
  provider: string;
  googlePhoto: string | null;
  gravatar: string | null;
}) {
  return (
    <div className="flex flex-col gap-5 pb-10">
      <PhotoCard profile={profile} googlePhoto={googlePhoto} gravatar={gravatar} />
      <ProfileCard profile={profile} />
      <PreferencesCard calmMode={Boolean(profile.calm_mode)} />
      <Card title="Account">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[15px] font-semibold">{email}</span>
            <span className="text-[13px] text-muted">Signed in with {provider}</span>
          </div>
          <form action={signOut}>
            <button type="submit" className="btn min-h-11 rounded-[10px] border border-line px-4 font-medium text-fg">
              <LogoutIcon size={16} /> Log out
            </button>
          </form>
        </div>
      </Card>
    </div>
  );
}

function PhotoCard({ profile, googlePhoto, gravatar }: { profile: Profile; googlePhoto: string | null; gravatar: string | null }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const fileRef = useRef<HTMLInputElement>(null);
  const [current, setCurrent] = useState(profile.avatar_url);
  const [busy, setBusy] = useState<null | "upload" | "google" | "gravatar" | "remove">(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  async function apply(url: string | null, kind: NonNullable<typeof busy>) {
    setBusy(kind);
    setError("");
    setNote("");
    const before = current;
    setCurrent(url); // optimistic
    const res = await setAvatar(url);
    setBusy(null);
    if (res?.error) {
      setCurrent(before);
      setError(res.error);
      return false;
    }
    setNote(url ? "Photo updated." : "Photo removed. Your initials show instead.");
    router.refresh();
    return true;
  }

  async function upload(file: File) {
    setError("");
    setNote("");
    const ext = TYPES[file.type];
    if (!ext) return setError("Use a PNG, JPG, WebP or GIF.");
    if (file.size > MAX_BYTES) return setError("That file is over 5 MB. Try a smaller one.");
    setBusy("upload");
    const path = `${profile.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
    if (upErr) {
      setBusy(null);
      return setError(`Upload failed: ${upErr.message}`);
    }
    const url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    const ok = await apply(url, "upload");
    if (ok) {
      // Tidy up older uploads; failures here don't matter.
      const { data } = await supabase.storage.from("avatars").list(profile.id, { limit: 100 });
      const old = (data ?? []).map((f) => `${profile.id}/${f.name}`).filter((p) => p !== path);
      if (old.length) await supabase.storage.from("avatars").remove(old);
    } else {
      await supabase.storage.from("avatars").remove([path]);
    }
  }

  return (
    <Card title="Photo" hint="PNG, JPG, WebP or GIF up to 5 MB. GIFs animate, except for people using calm mode.">
      <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        <div className="relative">
          <Avatar name={profile.name} url={current} size={96} tone="inv" animate />
          {busy === "upload" && (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white">
              <Spinner size={20} />
            </span>
          )}
        </div>
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void upload(f);
              }}
            />
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => fileRef.current?.click()}
              className="btn min-h-11 rounded-[10px] bg-inv px-4 font-semibold text-inv-fg"
            >
              {busy === "upload" ? <Spinner /> : <UploadIcon size={16} />} {busy === "upload" ? "Uploading…" : "Upload photo"}
            </button>
            {googlePhoto && current !== googlePhoto && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => apply(googlePhoto, "google")}
                className="btn min-h-11 rounded-[10px] border border-line px-4 font-medium text-fg"
              >
                {busy === "google" ? <Spinner /> : <GoogleIcon size={16} />} Use Google photo
              </button>
            )}
            {gravatar && current !== gravatar && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => apply(gravatar, "gravatar")}
                className="btn min-h-11 rounded-[10px] border border-line px-4 font-medium text-fg"
              >
                {busy === "gravatar" && <Spinner />} Use Gravatar
              </button>
            )}
            {current && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => apply(null, "remove")}
                className="btn min-h-11 rounded-[10px] px-3 font-medium text-muted"
              >
                {busy === "remove" ? <Spinner /> : <TrashIcon size={16} />} Remove
              </button>
            )}
          </div>
          {!googlePhoto && !gravatar && !current && (
            <p className="m-0 text-[13px] text-muted">
              Tip: add a photo at gravatar.com with this email and Byte picks it up here.
            </p>
          )}
          {error && (
            <p role="alert" className="m-0 text-sm text-err">
              {error}
            </p>
          )}
          {note && (
            <p role="status" className="m-0 text-sm text-muted">
              {note}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

function ProfileCard({ profile }: { profile: Profile }) {
  const [state, action, pending] = useActionState(updateProfile, undefined);
  const zones = useMemo(() => {
    try {
      const list = Intl.supportedValuesOf("timeZone");
      return list.includes(profile.timezone) ? list : [profile.timezone, ...list];
    } catch {
      return [profile.timezone];
    }
  }, [profile.timezone]);
  const bad = (f: string) => (state?.field === f ? true : undefined);

  return (
    <Card title="Profile" hint="Your name, @username and role show next to your messages and on the lock-in board.">
      <form action={action} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <label htmlFor="s-name" className="text-sm font-medium">
            Name
          </label>
          <input id="s-name" name="name" defaultValue={profile.name} maxLength={60} required autoComplete="name" aria-invalid={bad("name")} className={input} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="s-username" className="text-sm font-medium">
            Username
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">@</span>
            <input
              id="s-username"
              name="username"
              defaultValue={profile.username}
              maxLength={24}
              required
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={bad("username")}
              aria-describedby="s-username-hint"
              className={`${input} pl-8`}
            />
          </div>
          <span id="s-username-hint" className="text-[13px] text-muted">
            3–24 lowercase letters, numbers or underscores. Changing it changes how people @mention you.
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label htmlFor="s-role" className="text-sm font-medium">
              Role <span className="font-normal text-muted">(optional)</span>
            </label>
            <input id="s-role" name="role" defaultValue={profile.role ?? ""} maxLength={40} placeholder="Frontend, Design…" aria-invalid={bad("role")} className={input} />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="s-tz" className="text-sm font-medium">
              Time zone
            </label>
            <select id="s-tz" name="timezone" defaultValue={profile.timezone} aria-invalid={bad("timezone")} className={`${input} pr-8`}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {state?.error && (
            <p role="alert" className="m-0 mr-auto text-sm text-err">
              {state.error}
            </p>
          )}
          {state?.ok && !pending && (
            <p role="status" className="m-0 mr-auto text-sm text-muted">
              Saved.
            </p>
          )}
          <button type="submit" disabled={pending} className="btn min-h-11 rounded-[10px] bg-inv px-5 font-semibold text-inv-fg">
            {pending ? (
              <>
                <Spinner /> Saving…
              </>
            ) : (
              "Save changes"
            )}
          </button>
        </div>
      </form>
    </Card>
  );
}

function PreferencesCard({ calmMode }: { calmMode: boolean }) {
  const router = useRouter();
  const [calm, setCalm] = useState(calmMode);
  const [pending, start] = useTransition();
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);

  return (
    <Card title="Preferences">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium" id="theme-label">
          Theme
        </span>
        <div role="radiogroup" aria-labelledby="theme-label" className="grid grid-cols-3 gap-2">
          {(["system", "light", "dark"] as const).map((t) => {
            const on = mounted && (theme ?? "system") === t;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setTheme(t)}
                className={`btn min-h-11 rounded-[10px] border text-sm ${on ? "border-fg bg-sunk font-semibold text-fg" : "border-line text-muted"}`}
              >
                {t === "system" ? "Match system" : t === "light" ? "Light" : "Dark"}
              </button>
            );
          })}
        </div>
      </div>
      <RemindersSwitch />
      <button
        type="button"
        role="switch"
        aria-checked={calm}
        disabled={pending}
        onClick={() => {
          const next = !calm;
          setCalm(next);
          start(async () => {
            const res = await setCalmMode(next);
            if (res?.error) setCalm(!next);
            else router.refresh();
          });
        }}
        className="btn flex items-start justify-start gap-3 rounded-xl border border-line p-3.5 text-left"
      >
        <LeafIcon size={18} className="mt-0.5 shrink-0 text-muted" />
        <span className="flex flex-1 flex-col gap-0.5">
          <span className="text-sm font-semibold text-fg">Calm mode</span>
          <span className="text-[13px] text-muted">Hides typing indicators, folds away GIFs and stickers, and freezes animated photos.</span>
        </span>
        <span
          aria-hidden="true"
          className={`relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors ${calm ? "bg-inv" : "bg-sunk"}`}
        >
          <span className={`absolute top-0.5 size-5 rounded-full bg-surface shadow transition-[left] ${calm ? "left-[18px]" : "left-0.5"}`} />
        </span>
      </button>
    </Card>
  );
}

function RemindersSwitch() {
  const on = useSyncExternalStore(subscribeReminders, remindersOn, () => false);
  const supported = useSyncExternalStore(subscribe, notificationsSupported, () => true);
  const [note, setNote] = useState("");
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={!supported}
        onClick={async () => {
          setNote("");
          if (on) return disableReminders();
          const res = await enableReminders();
          if (!res.on) setNote(res.blocked ? "Your browser is blocking notifications for Byte. Allow them in the site settings (the icon left of the address bar), then try again." : "This browser can't show notifications.");
        }}
        className="btn flex items-start justify-start gap-3 rounded-xl border border-line p-3.5 text-left"
      >
        <BellIcon size={18} className="mt-0.5 shrink-0 text-muted" />
        <span className="flex flex-1 flex-col gap-0.5">
          <span className="text-sm font-semibold text-fg">Lock-in reminders</span>
          <span className="text-[13px] text-muted">
            {supported
              ? "A notification 10 minutes before a session in your rooms, when it starts, and when a check-in is due. Works while Byte is open in a tab, on this device."
              : "This browser can't show notifications. Use Add to calendar on a scheduled session instead."}
          </span>
        </span>
        <span aria-hidden="true" className={`relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors ${on ? "bg-inv" : "bg-sunk"}`}>
          <span className={`absolute top-0.5 size-5 rounded-full bg-surface shadow transition-[left] ${on ? "left-[18px]" : "left-0.5"}`} />
        </span>
      </button>
      {note && (
        <p role="alert" className="m-0 text-[13px] text-err">
          {note}
        </p>
      )}
    </div>
  );
}
