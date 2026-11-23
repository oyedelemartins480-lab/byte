import type { Metadata } from "next";
import { SignupChat } from "./signup-chat";

export const metadata: Metadata = { title: "Sign up · Byte" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <SignupChat next={next ?? null} />;
}
