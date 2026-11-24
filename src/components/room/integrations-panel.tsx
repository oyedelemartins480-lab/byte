"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useConfirm } from "../confirm-dialog";
import { CopyButton } from "../copy-button";
import { GitHubIcon } from "../icons";
import { Spinner } from "../setup-chat";

/** Owner-only: connect a GitHub repo so pushes and PRs post into the room. */
export function IntegrationsPanel({ roomId, meId, origin }: { roomId: string; meId: string; origin: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [secret, setSecret] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const confirm = useConfirm();

  useEffect(() => {
    let live = true;
    void supabase
      .from("room_integrations")
      .select("secret")
      .eq("room_id", roomId)
      .eq("kind", "github")
      .maybeSingle()
      .then(({ data }) => {
        if (live) setSecret((data?.secret as string | undefined) ?? null);
      });
    return () => {
      live = false;
    };
  }, [supabase, roomId]);

  async function connect() {
    setBusy(true);
    setError("");
    const { data, error: err } = await supabase
      .from("room_integrations")
      .insert({ room_id: roomId, kind: "github", created_by: meId })
      .select("secret")
      .single();
    setBusy(false);
    if (err) return setError(err.message);
    setSecret(data.secret as string);
    setOpen(true);
  }

  async function disconnect() {
    const ok = await confirm({
      title: "Disconnect GitHub?",
      body: "Pushes and pull requests stop posting in this room. Delete the webhook on GitHub too.",
      confirmLabel: "Disconnect",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    const { error: err } = await supabase.from("room_integrations").delete().eq("room_id", roomId).eq("kind", "github");
    setBusy(false);
    if (err) return setError(err.message);
    setSecret(null);
  }

  const hook = origin ? `${origin}/api/integrations/github/${roomId}` : "";

  return (
    <section aria-labelledby="integrations-h" className="flex flex-col gap-3 rounded-[14px] border border-line p-3.5">
      <h3 id="integrations-h" className="m-0 text-sm font-semibold">
        Integrations
      </h3>
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-inv text-inv-fg">
          <GitHubIcon size={18} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium">GitHub</span>
          <span className="text-xs leading-normal text-muted">
            Pushes, pull requests, issues and releases post here, and @ai can answer from them.
          </span>
        </div>
        {secret === undefined ? (
          <Spinner size={14} />
        ) : secret ? (
          <span className="rounded-full bg-hi px-2 py-0.5 text-[11px] font-semibold text-hi-fg">On</span>
        ) : (
          <button type="button" disabled={busy} onClick={connect} className="btn min-h-9 rounded-lg bg-inv px-3 text-[13px] font-semibold text-inv-fg">
            {busy ? <Spinner size={12} /> : null} Connect
          </button>
        )}
      </div>

      {secret && (
        <>
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="btn self-start p-0 text-[13px] font-medium text-muted underline">
            {open ? "Hide setup" : "Show setup"}
          </button>
          {open && (
            <ol className="m-0 flex flex-col gap-2.5 pl-4 text-[13px] leading-normal">
              <li>
                On GitHub, open your repo → <b>Settings</b> → <b>Webhooks</b> → <b>Add webhook</b>.
              </li>
              <li className="flex flex-col gap-1.5">
                <span>
                  <b>Payload URL</b>
                </span>
                <Field value={hook} />
              </li>
              <li>
                <b>Content type</b>: <code className="rounded bg-sunk px-1">application/json</code>
              </li>
              <li className="flex flex-col gap-1.5">
                <span>
                  <b>Secret</b> (only room owners can see it)
                </span>
                <Field value={secret} />
              </li>
              <li>
                Pick <b>Let me select individual events</b>: Pushes, Pull requests, Issues, Releases. Save. GitHub sends a ping and you&apos;re done.
              </li>
            </ol>
          )}
          <button type="button" disabled={busy} onClick={disconnect} className="btn self-start p-0 text-[13px] font-medium text-err underline">
            Disconnect GitHub
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="m-0 text-xs text-err">
          {error}
        </p>
      )}
      <p className="m-0 text-xs leading-normal text-muted">
        Notion, Google Docs/Sheets/Slides, Drive and Figma links show a preview card automatically when shared in chat.
      </p>
    </section>
  );
}

function Field({ value }: { value: string }) {
  return (
    <span className="flex items-center gap-2 rounded-[10px] border border-line bg-surface py-1 pl-2.5 pr-1">
      <span className="min-w-0 flex-1 truncate font-mono text-xs">{value}</span>
      <CopyButton text={value} className="min-h-7 rounded-md bg-inv px-2.5 text-xs font-semibold text-inv-fg" />
    </span>
  );
}
