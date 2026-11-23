# Byte

**WhatsApp is where you talk. Byte is where you lock in.**

Byte is a web app for team work sessions: real-time rooms for your project, timed lock-in sessions, and AI recaps, all on your laptop so your phone stays face down.

This is **Phase 1** of the PRD: accounts, rooms, invite links and real-time chat.

## What's in Phase 1

- **Landing page** at `/` for first-time visitors, in light and dark.
- **Chatbot sign-up** at `/signup`: Byte asks your name, then you sign in with Google or an emailed magic link (no passwords).
- **Onboarding chat** at `/onboarding`: username (checked for clashes), role, time zone (auto-detected), then start a room, join one with a link, or skip.
- **Rooms**: Build rooms (one project) and Lock-in rooms (sessions arrive in Phase 2). Create from the sidebar or the home screen.
- **Invite links**: `/join/<code>` shows the room, then signs you up or in and drops you straight into it. Owners can reset the link, which kills the old one.
- **Real-time chat**: messages, replies, emoji reactions, @mentions with autocomplete, code blocks, typing indicator, delete with undo, and reconnect catch-up.
- **GIFs** (GIPHY, optional key), an original **sticker pack**, and **file sharing** up to 25 MB, private to room members.
- **Side panel**: people, invite link, plus links and files collected from the chat.
- **Theme** follows the user's system setting by default, with a toggle.

Coming next (PRD Phase 2+): timed sessions with goal check-ins, hourly progress, end-of-session drop, AI recaps and the focus score.

## Stack

Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · Supabase (Auth, Postgres, Realtime, Storage) · deploys on Vercel.

## Run it locally

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com), create a free project.
2. Open **SQL Editor → New query**, paste everything in `supabase/migrations/20261123000000_phase1.sql`, and click **Run**. This creates the tables, security rules, realtime and the file bucket.
   - Using the Supabase CLI instead? `supabase link` then `supabase db push`.

### 2. Turn on sign-in

In **Authentication → URL Configuration**:

- **Site URL**: `http://localhost:3000` (change to your real domain when you deploy)
- **Redirect URLs**: add `http://localhost:3000/auth/callback` and, later, `https://your-domain.com/auth/callback`

In **Authentication → Sign In / Providers**:

- **Email**: on by default. Magic links work out of the box (Supabase's built-in email is rate-limited; add your own SMTP under **Authentication → Emails** before launch).
- **Google**: turn it on and paste a Client ID and Secret from [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (OAuth client, type "Web application"). In Google, add the callback URL Supabase shows you (`https://<project-ref>.supabase.co/auth/v1/callback`) as an authorised redirect URI.

### 3. Add your keys

```bash
cp .env.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from **Project Settings → API**. Add a free `GIPHY_API_KEY` if you want GIFs; without it, the GIF picker tells people GIFs are off.

### 4. Start

```bash
npm install
npm run dev
```

Open http://localhost:3000. To test chat between two people, sign up in a normal window and a private window with two different emails.

## Deploy to Vercel

1. Push this folder to GitHub and import it on [vercel.com/new](https://vercel.com/new).
2. Add the same environment variables in the Vercel project settings.
3. In Supabase, set the **Site URL** to your Vercel domain and add `https://your-domain/auth/callback` to **Redirect URLs**.

## Project map

```
src/
  app/
    page.tsx                 landing page
    signup/                  chatbot sign-up (name → Google or magic link)
    onboarding/              chatbot setup (username, role, time zone, first room)
    login/                   returning users
    auth/callback/route.ts   finishes Google and magic-link sign-in
    join/[code]/             invite link landing
    app/                     signed-in area: sidebar + rooms
      r/[roomId]/            a room
    api/gifs/route.ts        GIF search proxy (keeps the GIPHY key server-side)
    actions.ts               server actions: create/join/leave room, reset link, sign out
  components/
    room/                    chat: room view, messages, composer, pickers, side panel
    setup-chat.tsx           shared chat UI for sign-up and onboarding
  lib/supabase/              browser and server clients
  proxy.ts                   keeps sessions fresh, guards signed-in pages
supabase/migrations/         database schema, security rules, realtime, storage
public/stickers/             the starter sticker pack (original SVGs)
```

## How security works

Every table has row-level security, so the rules live in the database, not just the UI:

- You only see rooms you're a member of, and only their messages, reactions, members and files.
- You can only post as yourself, and only edit or delete your own messages.
- Joining happens through `join_room_by_code`, which checks the invite code on the server.
- Files are stored at `attachments/<room_id>/…` and only room members can read or upload them. Links to files are signed and expire after an hour.
- The GIPHY key never reaches the browser.

**Known limit:** typing indicators and reaction removals use Supabase broadcast on a channel named after the room's ID. Anyone who knows a room's ID could listen to those two signals (who is typing, which reaction was removed), though never to message content. Before a public launch, switch these to [private channels with Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization).
