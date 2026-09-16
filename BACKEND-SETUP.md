# Wortify backend: promo codes + device count

This adds a small server-side piece so promo codes work across devices and
the admin panel's "Known devices" number is real. It uses **Netlify Blobs**,
which is built into Netlify — no separate database or account to sign up
for, as long as the site is deployed on Netlify (which it already is, since
the app already calls `/.netlify/functions/presence-*`).

## What's in here

```
index.html                          <- updated (promo/device logic now calls the backend)
netlify/functions/promo-admin.mjs   <- list/create/delete promo codes (admin only)
netlify/functions/promo-redeem.mjs  <- redeem a code (any device, public)
netlify/functions/device-register.mjs
netlify/functions/devices-count.mjs
package.json                        <- adds the @netlify/blobs dependency
netlify.toml                        <- points Netlify at netlify/functions
BACKEND-SETUP.md                    <- this file
```

## 1. Add these files to your site's repo

Drop `netlify/functions/*.mjs` into your existing `netlify/functions/`
folder (next to your existing `presence-*.js` functions — both can coexist,
nothing here touches those).

- **If you already have a `package.json`**: don't overwrite it — just add
  `"@netlify/blobs": "^11.1.0"` to its `dependencies`.
- **If you already have a `netlify.toml`**: don't overwrite it — just make
  sure it has `functions = "netlify/functions"` under `[build]` (it
  presumably already does, since the presence functions work today).
- Replace your `index.html` with the one in this folder.

## 2. Set the admin secret

This is the piece that didn't exist before: the old admin panel was "secure"
only in the sense that the create/delete buttons were hidden behind a tap
gesture. Anyone who found them could mint free-Premium codes. Now the
server enforces a real check.

In the Netlify dashboard: **Site settings → Environment variables → Add a
variable**

- Key: `PROMO_ADMIN_SECRET`
- Value: any long random string only you know (e.g. generate one with
  `openssl rand -hex 24`)

Then redeploy (env var changes require a new deploy to take effect).

## 3. Deploy

```
git add netlify/functions package.json netlify.toml index.html
git commit -m "Add server-side promo codes and device count"
git push
```

Netlify Blobs needs no extra setup beyond the deploy itself.

## 4. Enter the key in the app

Open the app, use the existing hidden gesture to open the admin panel, go
to the **Promo codes** tab, and paste the same value you put in
`PROMO_ADMIN_SECRET` into the "Admin key" field, then **Save & reload**.
It's stored in this browser's localStorage so you only do this once per
device you administer from.

## 5. Test it actually works cross-device

1. On device/browser A (with the admin key saved): generate a promo code.
2. On device/browser B (a different phone, or an incognito window — no
   admin key needed here): go to Premium → enter the code → Apply.
3. It should say "Premium unlocked" / "+N gems" / "X% discount applied",
   not "That code isn't valid."
4. Back in the admin panel's Overview tab, "Known devices" should now show
   2 (or however many distinct browsers have opened the app since this
   went live — it only counts devices going forward, not historical
   opens).

## Notes / things you may want to change later

- **Local testing**: `netlify dev` emulates Blobs locally, so you can test
  before deploying.
- **Premium status and gems balance are still local to each device.** Only
  the *validity and one-time use of a promo code* is now shared. This was
  a deliberate minimal change — it fixes "can another device use this
  code" without rewriting how Premium/gems are tracked. If you later want
  a user's Premium status to follow them across their own devices too,
  that's a bigger change (you'd need some form of login, not just a device
  ID) — happy to help with that when you're ready.
- **Abuse**: `promo-redeem` is public and unauthenticated (it has to be —
  any user redeems codes). It's rate-limited only by Netlify's platform
  defaults. If you start seeing code-guessing attempts, consider adding a
  simple per-IP rate limit or CAPTCHA in front of it.
