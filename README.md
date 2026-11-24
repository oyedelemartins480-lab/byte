# Byte

**WhatsApp is where you talk. Byte is where you lock in.**

Byte is a web app for team work sessions: real-time rooms, timed lock-ins with goals and hourly check-ins, AI notes and recaps, and a focus score. It all lives on your laptop, so your phone stays face down.

This build covers all five phases of the v1 PRD plus the v1.5 and v2 extras: profile photos, message editing, room management, lock-in reminders, a shareable weekly stat card, a reading tracker, voice huddles with screen share, and GitHub/Notion/Google/Figma integrations.

## What's in it

**Accounts and rooms**
- Landing page for first-time visitors, in light and dark (follows the system theme, with a toggle).
- Chatbot sign-up: name, then Google or an emailed magic link. No passwords.
- Onboarding chat: username, role, time zone, then start a room, join with a link, or skip.
- Build rooms (one project) and Lock-in rooms (own goals, together). Invite links at `/join/<code>`; owners can reset them.

**Chat**
- Real-time messages, replies, emoji reactions, @mentions, code blocks, typing indicator, delete with undo.
- GIFs (GIPHY), an original sticker pack, files up to 25 MB, and voice notes recorded from the PC mic.
- Side panel: session notes, people, room settings, and links and files collected from the chat.

**Lock-in sessions (Phase 2)**
- Start now or schedule: length presets (25 min to 4 h) and check-ins every 30, 45 or 60 minutes.
- Everyone drops a goal. Byte prompts each person at every check-in, and updates land on a shared progress board.
- At the end, everyone drops what they did and says whether they hit their goal. The creator or room owner can end early.
- Lock-in rooms show a full Board view; Build rooms show the board in the side panel.

**AI (Phase 3)**
- Live notes during a session: summary, decisions, tasks and blockers, refreshed after ~20 new messages or 10 quiet minutes.
- The recap card at the end: goal vs. done per person, team score, next steps, blockers, links.
- A "Last time…" brief from the previous recap whenever you open the room.
- Works with any OpenAI-compatible provider (NVIDIA, FreeLLMAPI, OpenRouter, Groq). Without AI, sessions still work and the recap is built from goals and scores.

**Focus (Phase 4)**
- Focus time = seconds with the Byte tab visible, measured in the browser. Byte never sees other sites.
- Research break pauses the clock for docs or videos.
- Score = 50% focus time + 35% goal + 15% check-ins on time. Team score on every recap.
- Daily streaks and badges (Early Bird, Night Owl, Deep Diver, Finisher) on the Your stats page.

**Phase 5**
- `@ai` in any message asks Byte AI about the room's history. It answers only from this room's messages and recaps.
- Calm mode (sidebar): hides typing indicators and folds away GIFs and stickers.
- Voice notes, with optional transcripts (Whisper-compatible endpoint, e.g. Groq).
- Open rooms: tick "Open to everyone" and the room shows in Discover, where anyone signed in can join.

**Profiles and rooms (v1.5)**
- Profile photos: Google photo or Gravatar picked up automatically at sign-up; upload PNG, JPG, WebP or GIF (5 MB). Calm mode freezes animated photos.
- **Profile & settings** page: photo, name, username, role, time zone, theme, reminders, calm mode.
- Edit your own text messages (shows "edited"). Owners can rename the room, remove people (they're bounced out live) and delete the room.

**Lock-in extras (v1.5)**
- Reminders: browser notifications 10 minutes before a session in your rooms, at the start, and when a check-in is due while Byte is in the background. Plus **Add to calendar** (.ics with a 10-minute alarm) on scheduled sessions.
- Reading tracker: pick **Reading** when dropping a goal, enter start and total pages, then the page you're on at each check-in. Page progress shows on the board, the session bar and the recap.
- Weekly stat card on **Your stats**: a 1200×630 PNG (light or dark) of your last 7 days to download or share.

**Voice huddles (v2)**
- One click joins the room's voice huddle (LiveKit). Mute, share your screen (with tab audio), see who's talking. The header shows who's already in.

**Integrations (v2)**
- Link previews for GitHub repos, PRs and issues (with state), Notion, Google Docs/Sheets/Slides/Drive, Figma and any page with Open Graph tags. Private pages show a branded card without leaking content.
- GitHub webhook per room: pushes, PRs, issues and releases post into the chat, and `@ai`, live notes and recaps can use them.

## Run it locally

### 1. Create a Supabase project

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query** and run the three files in `supabase/migrations/`, **in order**:
   1. `20261123000000_phase1.sql`
   2. `20261123010000_sessions_ai_focus.sql`
   3. `20261123020000_grants.sql` (gives signed-in users access to the tables; without it you'll see "permission denied for table profiles")
   4. `20261124000000_profiles_rooms_reading_integrations.sql` (photo storage, room management, message edits, reading goals, GitHub integration)

   (Or with the Supabase CLI: `supabase link`, then `supabase db push`.)

### 2. Turn on sign-in

**Authentication → URL Configuration**
- Site URL: `http://localhost:3000`
- Redirect URLs: add `http://localhost:3000/auth/callback`

**Authentication → Sign In / Providers**
- Email: on by default. The built-in mailer is rate-limited, so add your own SMTP under **Authentication → Emails** before launch.
- **Optional: 6-digit codes in sign-in emails** (sign-in still works if a link expires or an email scanner opens it first). New free Supabase projects can only edit email templates after setting up custom SMTP (see below). Once you have it, edit **Magic Link** and **Confirm signup** under **Authentication → Emails → Templates**, add this line under the link, then set `NEXT_PUBLIC_EMAIL_CODE=on` in `.env.local`:
  ```html
  <p>Or type this code in Byte: <strong>{{ .Token }}</strong></p>
  ```
- **Custom SMTP (needed before other people can sign up).** Supabase's built-in email only reaches members of your Supabase organization. Free options: Gmail with an app password (`smtp.gmail.com`, port 465, needs 2-step verification) or Brevo (300 emails/day, verify a single sender address). Add the details under **Authentication → Emails → SMTP Settings**.
- Google: turn it on and paste a Client ID and Secret from [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (OAuth client, "Web application"). In Google, add the callback URL Supabase shows (`https://<project-ref>.supabase.co/auth/v1/callback`) as an authorised redirect URI.

### 3. Add your keys

```bash
cp .env.example .env.local
```

| Variable | Needed for | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Everything | Supabase → Project Settings → API |
| `SUPABASE_SECRET_KEY` | Recaps, AI notes, `@ai`, transcripts | Same page, the **secret** (service role) key. Server-only: never put it in a `NEXT_PUBLIC_` variable. |
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | AI notes, AI recaps, `@ai` | Your AI provider (see below) |
| `GIPHY_API_KEY` | GIF picker | [developers.giphy.com](https://developers.giphy.com) |
| `AI_TRANSCRIBE_*` | Voice transcripts | Any Whisper-compatible endpoint, e.g. Groq |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Voice huddles and screen share | [cloud.livekit.io](https://cloud.livekit.io): free Build plan, no card. Create a project → Settings → API keys. The URL starts with `wss://`. Without these, the Huddle button is hidden. |
| `GITHUB_TOKEN` | Optional: richer GitHub previews (PR state, stars) and a higher rate limit | GitHub → Settings → Developer settings → fine-grained token with public read only |

**Extra settings** (add to `.env.local` only if you need them):

```dotenv
# Turn off "thinking" on reasoning models (Nemotron, GLM, Qwen) so they answer directly
AI_THINKING=off
# Stronger model just for end-of-session recaps
AI_RECAP_MODEL=
# Voice note transcripts (OpenAI-compatible /audio/transcriptions, e.g. Groq Whisper)
AI_TRANSCRIBE_BASE_URL=https://api.groq.com/openai/v1
AI_TRANSCRIBE_API_KEY=
AI_TRANSCRIBE_MODEL=whisper-large-v3-turbo
# Public URL used in invite links (defaults to the browser's address)
NEXT_PUBLIC_SITE_URL=https://your-domain.com
# Older Supabase projects show an "anon" key instead of a publishable key
NEXT_PUBLIC_SUPABASE_ANON_KEY=
# Hide the Google button until Google sign-in is set up
NEXT_PUBLIC_GOOGLE_AUTH=off
# Show the 6-digit code box on sign-in (needs edited email templates, see above)
NEXT_PUBLIC_EMAIL_CODE=on
```

Other AI providers, same three `AI_` values:

| Provider | `AI_BASE_URL` | Example `AI_MODEL` |
|---|---|---|
| NVIDIA (default) | `https://integrate.api.nvidia.com/v1` | `nvidia/nemotron-3.5-bolt-e4b` (with `AI_THINKING=off`) |
| OpenRouter | `https://openrouter.ai/api/v1` | `inclusionai/ling-3.2-flash:free` |
| FreeLLMAPI (local) | `http://localhost:3001/v1` | `auto` |

**Choosing an AI provider.** Byte speaks the OpenAI chat format, so switching is just these three values:

- **NVIDIA** (`https://integrate.api.nvidia.com/v1`): free key at [build.nvidia.com](https://build.nvidia.com). Pick a chat model there and copy its ID into `AI_MODEL`. The free tier is for development and testing, limited to about 40 requests a minute shared across your whole app.
- **FreeLLMAPI** (`http://localhost:3001/v1`): run [freellmapi](https://github.com/tashfeenahmed/freellmapi) on your machine; it rotates across many free tiers. Great for development; its author says not to use it in production.
- **For launch**: a paid key from OpenRouter, Groq or NVIDIA. Byte's AI is cheap: each update sends only new messages plus the running summary.

### 4. Start

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Test it end to end

Use two browsers (or a normal and a private window) with two different emails.

1. **Sign up** in window A, create a Lock-in room, and copy the invite link.
2. **Join** with the link in window B. Chat both ways: messages, a reply, a reaction, a GIF, a sticker, a file, a voice note.
3. **Start a session** in A: "Start lock-in" → Start now → 25 min → check in every 30 min (short, so you can see the end).
   Tip: for a fast test of check-ins, pick 50 min with 30-minute check-ins, or temporarily edit `starts_at` in Supabase's table editor.
4. Both windows **drop a goal**. Watch the Board update live in both.
5. Switch tabs for a minute in B, come back, and see B's focus % drop on the board.
6. With AI configured, chat 20+ messages or wait 10 minutes: **Live notes** appear in the side panel.
7. Type `@ai what are we working on?` in the chat.
8. When time's up (or press **End now** in A), both **drop what they did**. The **recap card** posts when everyone's in.
9. Open **Your stats** to see the score, streak and badges. Toggle **Calm mode** in the sidebar.
10. In the room's **People** tab (as owner), turn on **Open to everyone** and check it shows in **Discover** for B.
11. **Profile & settings** (sidebar): upload a photo or GIF, change your username, turn on **Lock-in reminders**.
12. Edit a message (hover → pencil). As owner, rename the room, then remove B: B's window goes back home with a notice.
13. Schedule a session 15 minutes out: **Add to calendar** downloads an .ics; with reminders on you get a notification 10 minutes before.
14. Drop a **Reading** goal with pages, post a check-in with a page number, and watch the page bar on the board.
15. With LiveKit keys set, click **Huddle** in both windows, talk, and share a screen.
16. Paste a GitHub PR link in chat to see the preview. As owner, **People → Integrations → GitHub → Connect**, add the webhook on a repo, push a commit, and see it post.
17. **Your stats → Your week, as a card**: download or share the PNG.

## Deploy to Vercel

1. Push to GitHub and import the repo at [vercel.com/new](https://vercel.com/new).
2. Add the same environment variables in Vercel (keep `SUPABASE_SECRET_KEY` server-side; Vercel never exposes non-`NEXT_PUBLIC_` variables to the browser).
3. In Supabase, set the Site URL to your domain and add `https://your-domain/auth/callback` to Redirect URLs.
4. Switch `AI_*` to a production-allowed provider before real users arrive.

## How it works

```
src/
  app/
    page.tsx                     landing page
    signup/, onboarding/, login/ chatbot sign-up and setup, returning users
    auth/callback/route.ts       finishes Google and magic-link sign-in
    join/[code]/                 invite link landing
    app/                         signed-in area
      r/[roomId]/                a room (chat, board, session)
      discover/                  open rooms
      me/                        your stats, streak, badges, weekly card
      settings/                  profile photo, details, theme, reminders, calm mode
    api/
      gifs/                      GIF search proxy (keeps the GIPHY key server-side)
      sessions/[id]/summary/     live AI notes
      sessions/[id]/recap/       scoring + recap card
      rooms/[id]/ask/            @ai answers
      voice/transcribe/          voice note transcripts
      card/week/                 weekly stat card PNG
      sessions/[id]/ics/         Add to calendar file
      huddle/[roomId]/           LiveKit tokens and who's in the huddle
      unfurl/                    link previews (blocks private network addresses)
      integrations/github/[roomId]/  signed GitHub webhook
    actions.ts                   server actions: rooms, invites, profile, photos, room management
  components/
    room/                        chat UI: room view, messages, composer, pickers, side panel, voice
    session/                     session bar, board, recap card, notes, focus tracker, start dialog
  lib/
    ai.ts                        provider-agnostic AI client and prompts
    session.ts                   session timing rules (mirrors the database)
    supabase/                    browser, server and admin clients
  proxy.ts                       keeps sessions fresh, guards signed-in pages
supabase/migrations/             schema, security rules, session logic, realtime, storage
```

**No cron jobs needed.** Timers and check-in prompts are computed from the session's start time in each browser. AI notes and recaps are triggered by members' browsers and run on the server. A database "claim" makes sure only one runs at a time, even if five people's browsers ask at once. The recap posts when everyone has dropped, 15 minutes after the end, or when someone taps "Post the recap now".

**Security**
- Row-level security on every table: you only see rooms you're in, plus their messages, sessions, files and recaps.
- Check-ins, scores, streaks and badges are written only by database functions that check the rules (one update per check-in, drops only after the start, scores only after the end).
- AI notes, recaps and AI messages are written only by the server with the secret key, after checking that the user is a member of the room.
- Messages can be edited or deleted by their author, but never changed into another type or moved to another room.
- GIF, AI, LiveKit and GitHub keys never reach the browser. Huddle tokens are issued only to room members and last 4 hours.
- Photos upload only into your own folder; profiles accept photo links only from Byte's storage, Google or Gravatar.
- GitHub webhooks are checked against a per-room secret (HMAC SHA-256). Only owners can see or change it.
- Link previews never fetch private, local or cloud-metadata addresses, including after redirects.

**Known limits:**
- Reminders are browser notifications, so they need Byte open in a tab on that device. Use Add to calendar for phone reminders.
- Typing indicators, reaction removals, huddle pings and remove/delete notices use Supabase broadcast on a channel named after the room's ID. Anyone who knew a room's ID could listen to those signals (never message content). Before a big public launch, switch them to [private channels with Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization).
