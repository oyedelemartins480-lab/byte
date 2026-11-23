import { NOTES_SYSTEM, aiReady, chat, parseNotes, transcript } from "@/lib/ai";
import { sessionEnd } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { UUID_RE, json, sessionForUser } from "@/lib/server-guards";
import type { Message, SessionSummary } from "@/lib/types";

const NOTE_TYPES = ["text", "checkin", "progress", "done", "file", "voice"];

/**
 * Updates the live AI notes for a running session. Any member's browser may call it;
 * a database claim makes sure only one update runs at a time.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return json({ error: "Bad session id." }, 400);
  if (!aiReady()) return json({ error: "AI notes are off. Set AI_BASE_URL, AI_MODEL and SUPABASE_SECRET_KEY." }, 503);

  const ctx = await sessionForUser(id);
  if ("error" in ctx) return ctx.error;
  const { session, room } = ctx;
  if (!room.ai_enabled) return json({ error: "The room owner turned AI notes off." }, 403);

  const now = Date.now();
  if (now < new Date(session.starts_at).getTime() || now > sessionEnd(session) + 120_000) {
    return json({ skipped: "Session isn't running." }, 202);
  }

  const admin = createAdminClient();
  const { data: claimed } = await admin.rpc("claim_ai_job", { sid: id, job: "summary" });
  if (!claimed) return json({ skipped: "Another update is running." }, 202);

  const { data: prev } = await admin.from("session_summaries").select("*").eq("session_id", id).maybeSingle();
  const since = (prev as SessionSummary | null)?.last_message_at ?? session.starts_at;

  const { data: rows } = await admin
    .from("messages")
    .select("*")
    .eq("room_id", session.room_id)
    .in("type", NOTE_TYPES)
    .gt("created_at", since)
    .order("created_at", { ascending: true })
    .limit(150);
  const messages = (rows ?? []) as Message[];
  if (!messages.length) return json({ skipped: "Nothing new." }, 202);

  const ids = Array.from(new Set(messages.map((m) => m.user_id).filter(Boolean))) as string[];
  const { data: people } = await admin.from("profiles").select("id, name").in("id", ids);
  const names = new Map((people ?? []).map((p) => [p.id as string, p.name as string]));

  try {
    const previous = prev
      ? JSON.stringify({ summary: prev.summary, ...(prev.extracted as object) })
      : "(none yet)";
    const text = await chat({
      system: NOTES_SYSTEM,
      user: `Session: ${session.title}\n\nPrevious notes:\n${previous}\n\nNew messages:\n${transcript(messages, names)}`,
    });
    const notes = parseNotes(text);
    await admin.from("session_summaries").upsert({
      session_id: id,
      room_id: session.room_id,
      summary: notes.summary,
      extracted: { decisions: notes.decisions, tasks: notes.tasks, blockers: notes.blockers },
      last_message_at: messages[messages.length - 1].created_at,
      updated_at: new Date().toISOString(),
    });
    return json({ ok: true });
  } catch (e) {
    // Release the claim so the next trigger can retry.
    await admin.from("sessions").update({ summary_claimed_at: null }).eq("id", id);
    return json({ error: (e as Error).message }, 502);
  }
}
