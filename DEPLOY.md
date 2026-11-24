# Deploying Byte

Do these in order. Replace `byte-xyz.vercel.app` with your real address everywhere.
Nothing in Byte's code points at localhost: invite links, sign-in, Notion and GitHub all use whatever domain Byte runs on. The settings below are the dashboards outside the code that also need your live address.

---

## 1. Supabase: run the new SQL

SQL Editor → New query → run each file you haven't run yet, in order:

1. `supabase/migrations/20261124000000_profiles_rooms_reading_integrations.sql`
2. `supabase/migrations/20261125000000_private_realtime_push_connections.sql`

Then **Realtime → Settings** → turn **off** "Allow public access". Only room members can now listen to a room's live signals.

## 2. Make the secrets (on your laptop)

```bash
npx web-push generate-vapid-keys
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

The first gives a **Public Key** and **Private Key** for desktop notifications. The second gives a random string for `CRON_SECRET`.

## 3. Push the code to GitHub

```bash
git init
git add .
git commit -m "Byte"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/byte.git
git push -u origin main
```

`.env.local` is never uploaded (`.gitignore` blocks it).

## 4. Vercel

vercel.com → Add New → Project → import `byte`. Before deploying, add these Environment Variables:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | From your `.env.local` |
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, `AI_THINKING` | From your `.env.local` |
| `GIPHY_API_KEY` | From your `.env.local` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public Key from step 2 |
| `VAPID_PRIVATE_KEY` | Private Key from step 2 |
| `VAPID_SUBJECT` | `mailto:you@yourmail.com` |
| `CRON_SECRET` | Random string from step 2 |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | If you set up huddles |
| `GITHUB_TOKEN` | Optional |
| Google Drive and Notion values | After steps 7 and 8 (then redeploy) |

**Don't copy `NEXT_PUBLIC_SITE_URL=http://localhost…`** into Vercel. Leave it out, or set it to your live address. (Byte ignores a localhost value on a live site anyway.)

Deploy. You get `https://byte-xyz.vercel.app`.

## 5. Supabase: point sign-in at the live site

**Authentication → URL Configuration**
- Site URL: `https://byte-xyz.vercel.app`
- Redirect URLs: add `https://byte-xyz.vercel.app/auth/callback` (keep the localhost one for development)

**Authentication → Emails**: set up SMTP (Gmail app password: `smtp.gmail.com`, port 465) and paste the templates from `supabase/email-templates/`. Without SMTP, sign-up emails only reach you.

## 6. Google sign-in

console.cloud.google.com → APIs & Services → Credentials → your OAuth client:
- **Authorized JavaScript origins**: add `https://byte-xyz.vercel.app` (and `http://localhost:3000`)
- Authorized redirect URIs: keep the Supabase one (`https://<project>.supabase.co/auth/v1/callback`)

**OAuth consent screen → Publish app**, or only test users can sign in.

## 7. Google Drive sharing (optional)

In the same Google Cloud project:
1. **APIs & Services → Library**: enable **Google Picker API** and **Google Drive API**.
2. **OAuth consent screen → Data access → Add scopes**: add `.../auth/drive.file` ("See, edit, create and delete only the specific Google Drive files you use with this app"). It only covers files people pick.
3. **Credentials → Create credentials → API key**. Restrict it: Application restrictions → Websites → `https://byte-xyz.vercel.app/*` and `http://localhost:3000/*`; API restrictions → Google Picker API.
4. Project number: **IAM & Admin → Settings**.

Add to Vercel (and `.env.local`):
```
NEXT_PUBLIC_GOOGLE_API_KEY=the API key
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your OAuth client ID (same one Supabase uses)
NEXT_PUBLIC_GOOGLE_APP_ID=the project number
```

## 8. Notion (optional)

1. notion.so/profile/integrations → **New integration** → type **Public**.
2. Redirect URIs: `https://byte-xyz.vercel.app/api/integrations/notion/callback` and `http://localhost:3000/api/integrations/notion/callback`.
3. Capabilities: **Read content** only.
4. Notion asks for a website, privacy policy and terms URL for public integrations. Your Byte address works for the website.
5. Copy the **OAuth client ID** and **client secret**:

```
NOTION_CLIENT_ID=...
NOTION_CLIENT_SECRET=...
```

## 9. Redeploy

Vercel → Deployments → ⋯ → **Redeploy**, so the new variables take effect.

## 10. Turn on the notification clock

Supabase → **Database → Extensions**: enable **pg_cron** and **pg_net**.
Open `supabase/cron.sql`, replace `YOUR-SITE` and `YOUR-CRON-SECRET`, and run it in the SQL Editor. Byte now sends lock-in reminders, check-ins and "time's up" every minute, even when nobody has the tab open.

Check it: `select status_code, content from net._http_response order by created desc limit 3;` should show `200`.

## 11. GitHub webhooks

In a room: **People → Integrations → GitHub → Connect**, then add the shown Payload URL and Secret to a repo's **Settings → Webhooks**. Push a commit: it appears in the room.

---

## After deploying: quick test

1. Sign up with a second email (checks SMTP).
2. **Profile & settings → Notifications**: turn on, then **Send a test notification**. Close the Byte tab and schedule a lock-in 12 minutes out: the reminder arrives with the tab closed.
3. @mention someone: they get a desktop notification.
4. Composer **share button** (grid icon): pick a Drive file, then connect Notion and share a page.
5. Two windows: Huddle, share screen.
