// netlify/functions/devices-count.mjs
//
// Returns the number of distinct devices that have ever called
// device-register.mjs. Polled by the admin panel's "Known devices" stat,
// replacing the old hardcoded value of "1".

import { getStore } from "@netlify/blobs";

export const handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "" };
  }

  const store = getStore({ name: "devices", consistency: "eventual" });
  try {
    const { blobs } = await store.list();
    return {
      statusCode: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
      body: JSON.stringify({ count: blobs.length })
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ count: null })
    };
  }
};
