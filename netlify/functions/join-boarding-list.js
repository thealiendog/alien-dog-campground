/* Adds an email to the Boarding List (a Resend audience).
   Needs env vars: RESEND_API_KEY and RESEND_AUDIENCE_ID.
   Only our own website signups go here. Never add Airbnb guest emails. */

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return respond(405, { error: "Method not allowed" });

  try {
    const apiKey = process.env.RESEND_API_KEY;
    const audienceId = process.env.RESEND_AUDIENCE_ID;
    if (!apiKey || !audienceId) return respond(500, { error: "Signup is not set up yet" });

    const body = JSON.parse(event.body || "{}");

    /* Honeypot: real people leave this empty. Pretend success for bots. */
    if (body.website) return respond(200, { ok: true });

    const email = String(body.email || "").trim().toLowerCase().substring(0, 200);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return respond(400, { error: "Please enter a valid email address" });
    }

    const res = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, unsubscribed: false }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Resend audience error", res.status, text.substring(0, 300));
      return respond(502, { error: "Could not join the list. Please try again." });
    }

    return respond(200, { ok: true });
  } catch (err) {
    console.error("join-boarding-list error", err.message);
    return respond(500, { error: "Something went wrong. Please try again." });
  }
};
