# Auth email templates

Branded replacements for Supabase's default auth emails, sent through Resend.

| File | Supabase template |
| --- | --- |
| `confirm-signup.html` | Confirm signup |
| `reset-password.html` | Reset password |

## Where the Resend key belongs

**Not in this repository.** `RESEND_API_KEY` in `.env.local` does nothing: Vite only
exposes variables prefixed `VITE_` to client code, and a Resend key must never reach
a browser — anyone could read it out of the bundle and send mail as your domain.

Supabase does the sending. The key goes into Supabase's SMTP settings, where it stays
server-side. You can delete the line from `.env.local`.

## 1. Send from a domain Resend has verified

Resend refuses any `From` address on a domain the account has not proven ownership
of. The rejection surfaces as `500 Error sending confirmation email` from
`/auth/v1/signup` — the failure is at the SMTP hop, so Supabase reports only that
something went wrong.

The verified domain on this account is **`maduraindunil.com`**, which is also where
the app is deployed. Use it:

    noreply@maduraindunil.com

To send as `adeemuniform.com` instead, add it under Resend → **Domains**, publish
the DKIM/SPF records it gives you, and wait for **Verified** before changing the
sender here.

`onboarding@resend.dev` needs no verification but delivers only to the Resend
account holder's own address, so it is useless for staff.

## 2. Point Supabase at Resend

Supabase → **Authentication → Emails → SMTP Settings** → enable custom SMTP:

| Field | Value |
| --- | --- |
| Sender email address | `noreply@adeemuniform.com` |
| Sender name | `Adeem Uniform` |
| Host | `smtp.resend.com` |
| Port number | `465` |
| Minimum interval per user | `60` (drop to `10` while testing) |
| Username | `resend` — the literal word, not your email |
| Password | your `re_…` API key |

Port 465 is implicit TLS. If your host blocks it, `587` also works.

Two things the username field catches people on: it is the fixed string `resend`
for every account, and the password is the API key itself — Resend has no separate
SMTP password.

Enabling custom SMTP raises Supabase's auth email ceiling from a handful per hour
to **30 per hour** — that is a Supabase limit, not a Resend one, and it is what was
producing `over_email_send_rate_limit` on "Add employee". Raise it further under
**Authentication → Rate Limits** if 30 is ever tight.

`Minimum interval per user` throttles repeat sends to the *same* address. At 60
seconds, retrying a confirmation for one person inside a minute is silently
refused, which is confusing while testing.

## 3. Paste the templates

Supabase → **Authentication → Emails**. For each template, replace the message body
with the contents of the matching file here.

Subject lines:

- Confirm signup — `Confirm your email — Adeem Uniform`
- Reset password — `Reset your password — Adeem Uniform`

## Template variables

`{{ .ConfirmationURL }}` and `{{ .Email }}` are substituted by Supabase. Leave them
exactly as written; the double braces are Go template syntax, not placeholders to
fill in by hand. Also available: `{{ .Token }}` (6-digit code), `{{ .TokenHash }}`,
`{{ .SiteURL }}`, `{{ .RedirectTo }}`.

## Why the markup looks dated

Email clients are not browsers. Outlook renders through Word, which ignores flexbox,
grid and external stylesheets. So: table layout, inline styles, a VML fallback for
the button, and a visible copy of the raw URL for clients that strip buttons
entirely.

The logo is hot-linked from `adeemuniform.com` because email cannot bundle assets.
If that URL ever moves, both templates need updating.

## Redirect target

Supabase → **Authentication → URL Configuration** → Site URL must be the deployed
app (`https://test.maduraindunil.com`), or the confirmation link will bounce
recipients to `localhost:3000` and appear broken.
