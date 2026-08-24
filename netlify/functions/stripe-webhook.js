const Stripe = require("stripe");

const HOSPITABLE_BASE = "https://public.api.hospitable.com";
const PROPERTY_ID = "c947e17d-8779-41bc-a0ff-b15487fcae8f";
const RESEND_URL = "https://api.resend.com/emails";
const FROM_ADDRESS = "Alien Dog Campground <onboarding@resend.dev>";

exports.handler = async function (event) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const hospitableToken = process.env.HOSPITABLE_API_TOKEN;
  const resendKey = process.env.RESEND_API_KEY;
  const ownerEmail = process.env.OWNER_EMAIL;

  if (!stripeKey || !webhookSecret || !hospitableToken || !resendKey || !ownerEmail) {
    console.error("Missing env vars:", {
      STRIPE_SECRET_KEY: !!stripeKey,
      STRIPE_WEBHOOK_SECRET: !!webhookSecret,
      HOSPITABLE_API_TOKEN: !!hospitableToken,
      RESEND_API_KEY: !!resendKey,
      OWNER_EMAIL: !!ownerEmail,
    });
    return { statusCode: 500, body: "Server misconfigured" };
  }

  /* Verify Stripe signature */
  const stripe = new Stripe(stripeKey);
  const sig = event.headers["stripe-signature"];
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  if (stripeEvent.type !== "checkout.session.completed") {
    console.log("Ignoring event type:", stripeEvent.type);
    return { statusCode: 200, body: "Event ignored" };
  }

  const session = stripeEvent.data.object;
  const meta = session.metadata || {};
  const checkIn = meta.check_in;
  const checkOut = meta.check_out;
  const nights = meta.nights || "0";
  const pets = meta.pets || "0";
  const guestName = session.customer_details?.name || "Direct Booking Guest";
  const guestEmail = session.customer_details?.email || "";
  const guestPhone = session.customer_details?.phone || "";
  const amountPaid = session.amount_total ? (session.amount_total / 100).toFixed(2) : "unknown";

  console.log("Payment completed:", {
    sessionId: session.id,
    guestName,
    guestEmail,
    guestPhone,
    amountPaid,
    checkIn,
    checkOut,
    nights,
    pets,
  });

  if (!checkIn || !checkOut) {
    console.error("Missing check_in or check_out in session metadata");
    return { statusCode: 200, body: "No dates in metadata — skipping" };
  }

  /* Build array of dates to block (check-in through day before check-out) */
  const dates = [];
  const calNote = `Direct booking - ${guestName} - ${guestEmail} - Pets: ${pets} - Stripe: ${session.id}`;
  const start = new Date(checkIn + "T12:00:00Z");
  const end = new Date(checkOut + "T12:00:00Z");
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    dates.push({ date: `${yyyy}-${mm}-${dd}`, available: false, note: calNote });
  }

  console.log(`Blocking ${dates.length} dates in Hospitable:`, dates.map(d => d.date).join(", "));

  /* Block dates in Hospitable calendar */
  let calendarSuccess = false;
  try {
    const calRes = await fetch(
      `${HOSPITABLE_BASE}/v2/properties/${PROPERTY_ID}/calendar`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${hospitableToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ dates }),
      }
    );
    const calBody = await calRes.text();
    console.log("Hospitable calendar response:", calRes.status, calBody);
    calendarSuccess = calRes.ok;
    if (!calRes.ok) {
      console.error("Hospitable calendar block failed:", calRes.status, calBody);
    }
  } catch (err) {
    console.error("Hospitable calendar request error:", err.message);
  }

  /* Format dates for emails */
  const fmtDate = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  });
  const checkInFmt = fmtDate(checkIn);
  const checkOutFmt = fmtDate(checkOut);
  const petLine = parseInt(pets, 10) > 0
    ? `<tr><td style="padding:8px 0;color:#8aad80;border-bottom:1px solid #0a0a2a;">Pets</td><td style="padding:8px 0;color:#e8f4e3;border-bottom:1px solid #0a0a2a;text-align:right;">${pets}</td></tr>`
    : "";

  /* --- Guest confirmation email --- */
  const guestHtml = `
<div style="background:#03000f;padding:40px 20px;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#06001e;border:1px solid rgba(57,255,20,0.2);border-radius:4px;overflow:hidden;">
    <div style="background:rgba(57,255,20,0.08);padding:32px 28px;text-align:center;border-bottom:1px solid rgba(57,255,20,0.15);">
      <div style="font-size:36px;margin-bottom:12px;">&#x1F6F8;</div>
      <h1 style="color:#39ff14;font-size:22px;margin:0 0 6px;letter-spacing:2px;">BOOKING CONFIRMED</h1>
      <p style="color:#8aad80;font-size:13px;margin:0;letter-spacing:1px;">ALIEN DOG CAMPGROUND &middot; JOSHUA TREE, CA</p>
    </div>
    <div style="padding:28px;">
      <p style="color:#e8f4e3;font-size:15px;line-height:1.7;margin:0 0 20px;">
        Hey ${guestName.split(" ")[0]} &#x1F44B; &mdash; your desert escape is locked in. Here are your booking details:
      </p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr><td style="padding:8px 0;color:#8aad80;border-bottom:1px solid #0a0a2a;">Check-in</td><td style="padding:8px 0;color:#e8f4e3;border-bottom:1px solid #0a0a2a;text-align:right;">${checkInFmt}</td></tr>
        <tr><td style="padding:8px 0;color:#8aad80;border-bottom:1px solid #0a0a2a;">Check-out</td><td style="padding:8px 0;color:#e8f4e3;border-bottom:1px solid #0a0a2a;text-align:right;">${checkOutFmt}</td></tr>
        <tr><td style="padding:8px 0;color:#8aad80;border-bottom:1px solid #0a0a2a;">Nights</td><td style="padding:8px 0;color:#e8f4e3;border-bottom:1px solid #0a0a2a;text-align:right;">${nights}</td></tr>
        ${petLine}
        <tr><td style="padding:8px 0;color:#8aad80;font-weight:bold;">Total paid</td><td style="padding:8px 0;color:#39ff14;text-align:right;font-weight:bold;font-size:18px;">$${amountPaid}</td></tr>
      </table>
      <p style="color:#8aad80;font-size:13px;line-height:1.7;margin:0 0 24px;">
        We'll send you detailed check-in instructions and property access info closer to your stay. In the meantime, start getting excited &mdash; 5 acres of desert magic are waiting for you.
      </p>
      <p style="color:#8aad80;font-size:13px;margin:0;">
        Questions? Reach us at <a href="mailto:onlinesupport@aliendog.com" style="color:#39ff14;">onlinesupport@aliendog.com</a>
      </p>
    </div>
    <div style="background:rgba(57,255,20,0.05);padding:16px 28px;text-align:center;border-top:1px solid rgba(57,255,20,0.1);">
      <p style="color:#8aad80;font-size:11px;margin:0;">Alien Dog Campground &middot; Joshua Tree, California</p>
    </div>
  </div>
</div>`;

  let guestEmailSuccess = false;
  if (guestEmail) {
    try {
      const gRes = await fetch(RESEND_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM_ADDRESS,
          to: [guestEmail],
          subject: "Your Alien Dog Campground booking is confirmed \uD83D\uDC7D",
          html: guestHtml,
        }),
      });
      const gBody = await gRes.text();
      console.log("Guest email response:", gRes.status, gBody);
      guestEmailSuccess = gRes.ok;
      if (!gRes.ok) console.error("Guest email failed:", gRes.status, gBody);
    } catch (err) {
      console.error("Guest email error:", err.message);
    }
  } else {
    console.log("No guest email available — skipping guest confirmation");
  }

  /* --- Owner notification email --- */
  const calStatusLine = calendarSuccess
    ? '<span style="color:#39ff14;">&#x2713; Dates blocked in Hospitable</span>'
    : '<span style="color:#ff5050;font-weight:bold;">&#x2717; FAILED to block dates — do this manually ASAP</span>';

  const ownerHtml = `
<div style="font-family:'Helvetica Neue',Arial,sans-serif;padding:20px;background:#03000f;color:#e8f4e3;">
  <div style="max-width:520px;margin:0 auto;background:#06001e;border:1px solid rgba(57,255,20,0.2);border-radius:4px;padding:28px;">
    <h2 style="color:#39ff14;font-size:18px;margin:0 0 20px;">&#x1F6F8; New Direct Booking</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr><td style="padding:6px 0;color:#8aad80;">Guest</td><td style="padding:6px 0;color:#e8f4e3;text-align:right;">${guestName}</td></tr>
      <tr><td style="padding:6px 0;color:#8aad80;">Email</td><td style="padding:6px 0;text-align:right;"><a href="mailto:${guestEmail}" style="color:#39ff14;">${guestEmail}</a></td></tr>
      <tr><td style="padding:6px 0;color:#8aad80;">Phone</td><td style="padding:6px 0;color:#e8f4e3;text-align:right;">${guestPhone || "Not provided"}</td></tr>
      <tr><td style="padding:6px 0;color:#8aad80;">Check-in</td><td style="padding:6px 0;color:#e8f4e3;text-align:right;">${checkInFmt}</td></tr>
      <tr><td style="padding:6px 0;color:#8aad80;">Check-out</td><td style="padding:6px 0;color:#e8f4e3;text-align:right;">${checkOutFmt}</td></tr>
      <tr><td style="padding:6px 0;color:#8aad80;">Nights</td><td style="padding:6px 0;color:#e8f4e3;text-align:right;">${nights}</td></tr>
      <tr><td style="padding:6px 0;color:#8aad80;">Pets</td><td style="padding:6px 0;color:#e8f4e3;text-align:right;">${pets}</td></tr>
      <tr><td style="padding:6px 0;color:#8aad80;font-weight:bold;">Total paid</td><td style="padding:6px 0;color:#39ff14;text-align:right;font-weight:bold;">$${amountPaid}</td></tr>
    </table>
    <div style="border-top:1px solid #0a0a2a;padding-top:16px;margin-bottom:16px;">
      <p style="margin:0 0 8px;font-size:13px;">Calendar: ${calStatusLine}</p>
      <p style="margin:0 0 8px;font-size:13px;">Guest email: ${guestEmailSuccess ? '<span style="color:#39ff14;">&#x2713; Sent</span>' : '<span style="color:#ff5050;">&#x2717; Failed or skipped</span>'}</p>
      <p style="margin:0;font-size:11px;color:#8aad80;">Stripe session: ${session.id}</p>
    </div>
    <div style="background:rgba(255,214,10,0.08);border:1px solid rgba(255,214,10,0.3);border-radius:4px;padding:14px;margin-top:12px;">
      <p style="color:#ffd60a;font-size:13px;margin:0;font-weight:bold;">&#x26A0; Action required</p>
      <p style="color:#e8f4e3;font-size:13px;margin:8px 0 0;line-height:1.6;">Add this guest's reservation manually in Hospitable to trigger automated messaging (check-in instructions, house rules, etc).</p>
    </div>
  </div>
</div>`;

  let ownerEmailSuccess = false;
  try {
    const oRes = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [ownerEmail],
        subject: `New Direct Booking - ${guestName} - ${checkIn} to ${checkOut}`,
        html: ownerHtml,
      }),
    });
    const oBody = await oRes.text();
    console.log("Owner email response:", oRes.status, oBody);
    ownerEmailSuccess = oRes.ok;
    if (!oRes.ok) console.error("Owner email failed:", oRes.status, oBody);
  } catch (err) {
    console.error("Owner email error:", err.message);
  }

  console.log("Webhook complete:", {
    calendarBlocked: calendarSuccess,
    guestEmailSent: guestEmailSuccess,
    ownerEmailSent: ownerEmailSuccess,
  });

  return { statusCode: 200, body: "Processed" };
};
