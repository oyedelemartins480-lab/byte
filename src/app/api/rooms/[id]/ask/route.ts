import { ASK_SYSTEM, aiReady, chat, transcript } from "@/lib/ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { UUID_RE, json, roomForUser } from "@/lib/server-guards";
import type { Message } from "@/lib/types";

const STOP = new Set(
  "the a an and or but of to in on at for with about what who when where why how did does do we our us you i is are was were be been it this that these those there their they them can could would should will just any some from by as into up out not no yes have has had me my your".split(
    " ",
  ),
);

/** Turns a question into an OR full-text query: "what did we decide about auth?" → "decide or auth". */
function keywords(q: string) {
  const words = q
    .toLowerCase()
    .replace(/@ai\b/g, "")
    .match(/[a-z0-9][a-z0-9\-_.]{2,}/g);
  return Array.from(new Set((words ?? []).filter((w) => !STOP.has(w)))).slice(0, 8).join(" or ");
}

/** @ai ask the room: answers from this room's own history only. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return json({ error: "Bad room id." }, 400);
  if (!aiReady()) return json({ error: "@ai is off. Set AI_BASE_URL, AI_MODEL and SUPABASE_SECRET_KEY." }, 503);

  const body = (await req.json().catch(() => ({}))) as { question?: string; messageId?: string };
  const question = String(body.question ?? "").replace(/^\s*@ai\b/i, "").trim().slice(0, 500);
  if (!question) return json({ error: "Ask a question after @ai." }, 400);
  const replyTo = body.messageId && UUID_RE.test(body.messageId) ? body.messageId : null;

  const ctx = await roomForUser(id);
  if ("error" in ctx) return ctx.error;
  const { supabase, room } = ctx;
  if (!room.ai_enabled) return json({ error: "The room owner turned AI off for this room." }, 403);

  const admin = createAdminClient();
  const { count } = await admin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("room_id", id)
    .eq("type", "ai")
    .gte("created_at", new Date(Date.now() - 60_000).toISOString());
  if ((count ?? 0) >= 6) return json({ error: "Byte AI is answering a lot right now. Try again in a minute." }, 429);

  const terms = keywords(question);
  const [found, recaps, recent] = await Promise.all([
    terms
      ? supabase
          .from("messages")
          .select("*")
          .eq("room_id", id)
          .is("deleted_at", null)
          .in("type", ["text", "checkin", "progress", "done", "voice", "file"])
          .textSearch("fts", terms, { type: "websearch", config: "english" })
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
    terms
      ? supabase
          .from("session_recaps")
          .select("summary, recap, created_at")
          .eq("room_id", id)
          .textSearch("fts", terms, { type: "websearch", config: "english" })
          .limit(4)
      : Promise.resolve({ data: [] }),
    supabase
      .from("messages")
      .select("*")
      .eq("room_id", id)
      .is("deleted_at", null)
      .in("type", ["text", "checkin", "progress", "done", "voice", "file"])
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  const byId = new Map<string, Message>();
  for (const m of [...((found.data ?? []) as Message[]), ...((recent.data ?? []) as Message[])]) byId.set(m.id, m);
  const messages = Array.from(byId.values()).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const latestRecaps = (recaps.data ?? []).length
    ? recaps.data ?? []
    : (await supabase.from("session_recaps").select("summary, recap, created_at").eq("room_id", id).order("created_at", { ascending: false }).limit(2)).data ?? [];

  const ids = Array.from(new Set(messages.map((m) => m.user_id).filter(Boolean))) as string[];
  const { data: people } = ids.length ? await admin.from("profiles").select("id, name").in("id", ids) : { data: [] };
  const names = new Map((people ?? []).map((p) => [p.id as string, p.name as string]));

  const recapText = latestRecaps
    .map((r) => {
      const rec = r.recap as { session_title?: string; tasks?: { who: string; what: string }[]; decisions?: string[] };
      return `Recap of "${rec.session_title ?? "a session"}" (${String(r.created_at).slice(0, 10)}): ${r.summary} Decisions: ${(
        rec.decisions ?? []
      ).join("; ")}. Tasks: ${(rec.tasks ?? []).map((t) => `${t.who}: ${t.what}`).join("; ")}.`;
    })
    .join("\n");

  try {
    const answer = await chat({
      system: ASK_SYSTEM,
      maxTokens: 400,
      user: `Room: ${room.name}\n\nPast session recaps:\n${recapText || "(none)"}\n\nRoom messages (UTC times):\n${
        transcript(messages, names) || "(none)"
      }\n\nQuestion: ${question}`,
    });
    const { error } = await admin.from("messages").insert({
      room_id: id,
      user_id: null,
      type: "ai",
      body: (answer || "I couldn't find that in this room's history.").slice(0, 3000),
      reply_to: replyTo,
      meta: { question },
    });
    if (error) throw new Error(error.message);
    return json({ ok: true });
  } catch (e) {
    return json({ error: `Byte AI couldn't answer: ${(e as Error).message}` }, 502);
  }
}
