import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeNextServer } from "@/lib/utils";
import { getSession } from "@/lib/supabase/server";
import { OnboardingChat } from "./onboarding-chat";

export const metadata: Metadata = { title: "Set up · Byte" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next: rawNext } = await searchParams;
  const next = safeNextServer(rawNext);
  const { user, profile } = await getSession();
  if (!user) redirect("/signup");
  if (profile) redirect(next ?? "/app");

  const meta = user.user_metadata ?? {};
  const defaultName = String(meta.full_name ?? meta.name ?? "").trim();
  const signIn = user.app_metadata?.provider === "google" ? "Google" : "Email link";

  return (
    <OnboardingChat
      userId={user.id}
      defaultName={defaultName}
      email={user.email ?? ""}
      signIn={signIn}
      next={next}
    />
  );
}
