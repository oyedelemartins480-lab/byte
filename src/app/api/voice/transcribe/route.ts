import { aiConfig, transcribeReady } from "@/lib/ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE, json } from "@/lib/server-guards";
import type { Message, VoiceMeta } from "@/lib/types";

/** Transcribes a voice note with any OpenAI-compatible /audio/transcriptions endpoint (e.g. Groq Whisper). */
export async function POST(req: Request) {
  if (!transcribeReady()) return json({ error: "Transcripts are off. Set AI_TRANSCRIBE_MODEL." }, 503);
  const { messageId } = (await req.json().catch(() => ({}))) as { messageId?: string };
  if (!messageId || !UUID_RE.test(messageId)) return json({ error: "Bad message id." }, 400);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: "Sign in first." }, 401);

  // Row-level security: you can only see messages in your rooms. Only the sender can request a transcript.
  const { data: msg } = await supabase.from("messages").select("*").eq("id", messageId).maybeSingle();
  const m = msg as Message | null;
  if (!m || m.type !== "voice" || m.user_id !== user.id) return json({ error: "Voice note not found." }, 404);
  const meta = m.meta as unknown as VoiceMeta;
  if (meta.transcript) return json({ ok: true });

  const admin = createAdminClient();
  const { data: file, error: dlErr } = await admin.storage.from("attachments").download(meta.path);
  if (dlErr || !file) return json({ error: "Couldn't read the recording." }, 500);

  const c = aiConfig();
  const form = new FormData();
  const ext = meta.mime.includes("mp4") ? "m4a" : meta.mime.includes("ogg") ? "ogg" : "webm";
  form.append("file", file, `voice.${ext}`);
  form.append("model", c.transcribeModel);
  form.append("response_format", "json");

  const res = await fetch(`${c.transcribeBase}/audio/transcriptions`, {
    method: "POST",
    headers: c.transcribeKey ? { Authorization: `Bearer ${c.transcribeKey}` } : {},
    body: form,
  });
  if (!res.ok) return json({ error: `Transcription failed (${res.status}).` }, 502);
  const { text } = (await res.json()) as { text?: string };

  await admin
    .from("messages")
    .update({ meta: { ...meta, transcript: (text ?? "").trim().slice(0, 4000) || "(no speech detected)" } })
    .eq("id", messageId);
  return json({ ok: true });
}
