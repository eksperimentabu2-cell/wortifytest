// netlify/functions/device-register.mjs
//
// Called once per app boot with a per-device UUID the client generates
// and keeps in localStorage (see getDeviceId() in index.html). Writes one
// blob per distinct device into the "devices" store; devices-count.mjs
// reports how many distinct blobs exist. `onlyIfNew` means repeat visits
// from the same device don't do anything after the first call.

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
    return respond(405, { ok: false });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return respond(400, { ok: false });
  }

  const deviceId = (body.deviceId || "").trim();
  if (!deviceId || deviceId.length > 200) {
    return respond(400, { ok: false });
  }

  const store = getStore({ name: "devices", consistency: "strong" });
  try {
    await store.setJSON(deviceId, { firstSeen: Date.now() }, { onlyIfNew: true });
  } catch (e) {
    // Non-critical: device counting failing shouldn't break the app.
  }

  return respond(200, { ok: true });
};
