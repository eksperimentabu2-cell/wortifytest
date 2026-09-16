// netlify/functions/promo-admin.mjs
//
// Admin-only endpoint for the "Promo codes" tab of the in-app admin panel.
// Requires the PROMO_ADMIN_SECRET environment variable to be set on the
// site (Site settings -> Environment variables). The client sends it back
// as the `x-admin-secret` header; requests without a matching header are
// rejected with 401.
//
// Promo codes are stored in a Netlify Blobs store called "promo-codes",
// one blob per code, so every device reading/writing this store sees the
// same data. That's the piece that was missing before: previously codes
// only ever lived in the browser localStorage of whoever created them.

import { getStore } from "@netlify/blobs";

const PROMO_TYPES = ["monthly", "yearly", "permanent", "discount", "gems"];

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  };
}

function isAuthorized(event) {
  const secret = process.env.PROMO_ADMIN_SECRET;
  // Fail closed: if no secret is configured on the server, nobody is an admin.
  if (!secret) return false;
  const headers = event.headers || {};
  const provided = headers["x-admin-secret"] || headers["X-Admin-Secret"] || "";
  return provided === secret;
}

function generateCodeString() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 10; i++) {
    if (i > 0 && i % 5 === 0) out += "-";
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return respond(405, { ok: false, message: "Method not allowed." });
  }
  if (!isAuthorized(event)) {
    return respond(401, { ok: false, message: "Invalid admin key." });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return respond(400, { ok: false, message: "Malformed request." });
  }

  const store = getStore({ name: "promo-codes", consistency: "strong" });
  const action = body.action;

  try {
    if (action === "list") {
      const { blobs } = await store.list();
      const entries = await Promise.all(
        blobs.map((b) => store.get(b.key, { type: "json" }))
      );
      const codes = entries.filter(Boolean).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      return respond(200, { ok: true, codes });
    }

    if (action === "create") {
      const type = body.type;
      if (!PROMO_TYPES.includes(type)) {
        return respond(400, { ok: false, message: "Invalid promo type." });
      }

      let code = generateCodeString();
      // Vanishingly unlikely to collide, but check anyway and retry a few times.
      for (let attempt = 0; attempt < 5; attempt++) {
        const existing = await store.get(code, { type: "json" });
        if (!existing) break;
        code = generateCodeString();
      }

      const entry = { code, type, createdAt: Date.now(), used: false, usedAt: null };
      if (type === "discount") {
        const opts = body.options || {};
        entry.percent = Math.min(100, Math.max(1, Math.round(Number(opts.percent) || 0)));
        entry.maxUses = Math.max(1, Math.round(Number(opts.maxUses) || 1));
        entry.usesCount = 0;
        entry.expiresAt = opts.expiresAt || null;
      }
      if (type === "gems") {
        const opts = body.options || {};
        entry.amount = Math.max(1, Math.round(Number(opts.amount) || 0));
      }

      await store.setJSON(code, entry, { onlyIfNew: true });
      return respond(200, { ok: true, code: entry });
    }

    if (action === "delete") {
      const code = (body.code || "").trim().toUpperCase();
      if (!code) return respond(400, { ok: false, message: "Missing code." });
      await store.delete(code);
      return respond(200, { ok: true });
    }

    return respond(400, { ok: false, message: "Unknown action." });
  } catch (e) {
    return respond(500, { ok: false, message: "Server error." });
  }
};
