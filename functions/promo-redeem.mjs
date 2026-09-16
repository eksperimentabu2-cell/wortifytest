// netlify/functions/promo-redeem.mjs
//
// Public endpoint: any device can call this to redeem a promo code. It
// checks the code against the shared "promo-codes" Netlify Blobs store
// (the same store promo-admin.mjs writes to), so a code created on one
// device is valid on every device, and a single-use code really can only
// be used once, no matter which device gets there first.
//
// Uses conditional writes (onlyIfMatch on the blob's ETag) with a short
// retry loop so two people redeeming the same code at the same instant
// can't both succeed.
//
// This function only validates and marks the code as used/consumed. It
// does NOT touch the caller's premium status or gems balance -- those
// still live in that device's own localStorage, same as before. The
// client applies the effect locally based on the `kind` field returned
// here.

import { getStore } from "@netlify/blobs";

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  };
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return respond(405, { ok: false, message: "Method not allowed." });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return respond(400, { ok: false, message: "Malformed request." });
  }

  const code = (body.code || "").trim().toUpperCase();
  if (!code) return respond(200, { ok: false, message: "Enter a code." });

  const store = getStore({ name: "promo-codes", consistency: "strong" });
  const MAX_ATTEMPTS = 4;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let current;
    try {
      current = await store.getWithMetadata(code, { type: "json" });
    } catch (e) {
      return respond(500, { ok: false, message: "Server error. Try again." });
    }
    if (!current || !current.data) {
      return respond(200, { ok: false, message: "That code isn't valid." });
    }

    const entry = current.data;
    const etag = current.etag;
    const now = Date.now();

    if (entry.type === "discount") {
      const expired = !!(entry.expiresAt && entry.expiresAt < now);
      if (expired) return respond(200, { ok: false, message: "That code has expired." });
      const exhausted = typeof entry.maxUses === "number" && (entry.usesCount || 0) >= entry.maxUses;
      if (exhausted) return respond(200, { ok: false, message: "That code has reached its usage limit." });

      const next = { ...entry, usesCount: (entry.usesCount || 0) + 1 };
      const result = await store.setJSON(code, next, { onlyIfMatch: etag });
      if (!result.modified) continue; // someone redeemed it in the meantime, retry

      return respond(200, {
        ok: true,
        message: `${entry.percent}% discount applied at checkout!`,
        kind: "discount",
        percent: entry.percent,
        code: entry.code,
        expiresAt: entry.expiresAt
      });
    }

    if (entry.used) {
      return respond(200, { ok: false, message: "That code has already been used." });
    }

    const next = { ...entry, used: true, usedAt: now };
    const result = await store.setJSON(code, next, { onlyIfMatch: etag });
    if (!result.modified) continue; // lost a race with another redemption, retry

    if (entry.type === "gems") {
      const amount = Math.max(1, Math.round(Number(entry.amount) || 0));
      return respond(200, { ok: true, message: `+${amount} gems added!`, kind: "gems", amount });
    }

    return respond(200, {
      ok: true,
      message: `Premium unlocked (${entry.type})!`,
      kind: "premium",
      type: entry.type
    });
  }

  return respond(200, { ok: false, message: "That code was just redeemed elsewhere. Please try again." });
};
