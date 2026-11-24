import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { GitHubEventMeta } from "@/components/room/integration-card";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_BODY = 2 * 1024 * 1024;

type Repo = { full_name: string; html_url: string };
type Payload = {
  action?: string;
  repository?: Repo;
  sender?: { login: string };
  ref?: string;
  compare?: string;
  deleted?: boolean;
  commits?: { id: string; message: string; url: string }[];
  pull_request?: { number: number; title: string; html_url: string; merged?: boolean; draft?: boolean };
  issue?: { number: number; title: string; html_url: string; pull_request?: unknown };
  release?: { name: string | null; tag_name: string; html_url: string; draft?: boolean };
};

function verify(secret: string, body: string, header: string | null) {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(body).digest("hex")}`);
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Turns a GitHub event into a room message, or null for events we don't post. */
function toMessage(event: string, p: Payload): { body: string; meta: GitHubEventMeta } | null {
  const repo = p.repository?.full_name ?? "repo";
  const actor = p.sender?.login;
  if (event === "push") {
    if (p.deleted || !p.commits?.length) return null;
    const branch = p.ref?.replace(/^refs\/heads\//, "");
    const n = p.commits.length;
    return {
      body: `${actor ?? "Someone"} pushed ${n} commit${n === 1 ? "" : "s"} to ${branch}`,
      meta: {
        source: "github",
        event: "push",
        repo,
        url: p.compare ?? p.repository?.html_url ?? "",
        actor,
        branch,
        title: `${n} new commit${n === 1 ? "" : "s"}`,
        total_commits: n,
        commits: p.commits.slice(-5).reverse().map((c) => ({ id: c.id, message: c.message.split("\n")[0].slice(0, 140), url: c.url })),
      },
    };
  }
  if (event === "pull_request" && p.pull_request) {
    const pr = p.pull_request;
    const action = p.action === "closed" && pr.merged ? "merged" : p.action;
    if (!["opened", "reopened", "closed", "merged", "ready_for_review"].includes(action ?? "")) return null;
    return {
      body: `${actor ?? "Someone"} ${action?.replaceAll("_", " ")} PR #${pr.number}: ${pr.title}`,
      meta: { source: "github", event: "pull_request", repo, url: pr.html_url, actor, action, number: pr.number, title: pr.title.slice(0, 200) },
    };
  }
  if (event === "issues" && p.issue) {
    if (!["opened", "closed", "reopened"].includes(p.action ?? "")) return null;
    return {
      body: `${actor ?? "Someone"} ${p.action} issue #${p.issue.number}: ${p.issue.title}`,
      meta: { source: "github", event: "issues", repo, url: p.issue.html_url, actor, action: p.action, number: p.issue.number, title: p.issue.title.slice(0, 200) },
    };
  }
  if (event === "release" && p.release && p.action === "published" && !p.release.draft) {
    const name = p.release.name || p.release.tag_name;
    return {
      body: `${actor ?? "Someone"} published release ${name}`,
      meta: { source: "github", event: "release", repo, url: p.release.html_url, actor, action: "published", title: name.slice(0, 200) },
    };
  }
  return null;
}

/** GitHub webhook: posts pushes, pull requests, issues and releases into the room. */
export async function POST(req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(roomId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return NextResponse.json({ error: "Too large" }, { status: 413 });
  const body = await req.text();
  if (body.length > MAX_BODY) return NextResponse.json({ error: "Too large" }, { status: 413 });

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Integrations need SUPABASE_SECRET_KEY on the server." }, { status: 503 });
  }
  const { data: integ } = await admin
    .from("room_integrations")
    .select("secret")
    .eq("room_id", roomId)
    .eq("kind", "github")
    .maybeSingle();
  // Same answer for "no integration" and "bad signature" so the URL can't be probed.
  if (!integ || !verify(integ.secret as string, body, req.headers.get("x-hub-signature-256")))
    return NextResponse.json({ error: "Signature didn't match" }, { status: 401 });

  const event = req.headers.get("x-github-event") ?? "";
  if (event === "ping") return NextResponse.json({ ok: true, message: "Byte is connected." });

  let payload: Payload;
  try {
    payload = JSON.parse(body) as Payload;
  } catch {
    return NextResponse.json({ error: "Send JSON (Content type: application/json)." }, { status: 400 });
  }
  const msg = toMessage(event, payload);
  if (!msg) return NextResponse.json({ ok: true, skipped: event });

  const { error } = await admin.from("messages").insert({ room_id: roomId, user_id: null, type: "integration", body: msg.body.slice(0, 4000), meta: msg.meta });
  if (error) return NextResponse.json({ error: "Couldn't post to the room." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
