# Byte sign-in email templates

Paste these into Supabase → **Authentication → Emails → Templates** (needs custom SMTP on new free projects).

| Supabase template | File | Subject line |
|---|---|---|
| **Magic Link** | `magic-link.html` | `Your Byte sign-in link` |
| **Confirm signup** | `confirm-signup.html` | `Confirm your email for Byte` |

Both include the 6-digit code (`{{ .Token }}`). After saving them, add `NEXT_PUBLIC_EMAIL_CODE=on`
to `.env.local` and restart `npm run dev` so Byte shows the "type the code" box.
