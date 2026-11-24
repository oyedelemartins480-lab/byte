import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Blob, Squiggle } from "@/components/decor";
import { findGravatar, providerPhoto } from "@/lib/avatar";
import { getSession } from "@/lib/supabase/server";
import { notionConfig } from "@/lib/notion";
import { createAdminClient } from "@/lib/supabase/admin";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Profile & settings · Byte" };

async function notionWorkspace(userId: string) {
  if (!notionConfig().ready) return null;
  try {
    const { data } = await createAdminClient()
      .from("user_connections")
      .select("workspace_name, workspace_icon")
      .eq("user_id", userId)
      .eq("provider", "notion")
      .maybeSingle();
    return data ? { name: (data.workspace_name as string) ?? "Notion", icon: (data.workspace_icon as string) ?? null } : null;
  } catch {
    return null;
  }
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ notion?: string }> }) {
  const { user, profile } = await getSession();
  if (!user || !profile) redirect("/login?next=/app/settings");
  const { notion: notionResult } = await searchParams;

  const [gravatar, notion] = await Promise.all([findGravatar(user.email), notionWorkspace(user.id)]);
  const provider = user.app_metadata?.provider === "google" ? "Google" : "Email";

  return (
    <div className="scroll-thin relative isolate h-full overflow-y-auto overflow-x-hidden">
      <Blob variant={2} float className="-right-24 -top-24 -z-10 size-[320px] opacity-70" />
      <Blob variant={3} outline tone="line" className="right-[22%] top-28 -z-10 size-[150px]" />
      <div className="mx-auto flex max-w-[720px] flex-col gap-8 px-5 py-8 sm:px-8">
        <header className="relative flex flex-col gap-2 pt-4">
          <Squiggle className="left-0 top-0 h-4 w-20" />
          <h1 className="m-0 font-display text-[36px] font-extrabold leading-tight tracking-[-0.02em]">Profile & settings</h1>
          <p className="m-0 text-muted">How your team sees you, and how Byte behaves for you.</p>
        </header>
        <SettingsForm
          profile={profile}
          email={user.email ?? ""}
          provider={provider}
          googlePhoto={providerPhoto(user)}
          gravatar={gravatar}
          notion={{ ready: notionConfig().ready, workspace: notion, result: notionResult ?? null }}
        />
      </div>
    </div>
  );
}
