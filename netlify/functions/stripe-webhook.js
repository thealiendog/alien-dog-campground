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

  /* Shared email constants */
  const FONT_H = "'Trebuchet MS', 'Lucida Sans', Arial, sans-serif";
  const FONT_B = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
  const NEON = "#39ff14";
  const PURPLE = "#c77dff";
  const BG = "#03000f";
  const BG2 = "#06001e";
  const TEXT = "#e8f4e3";
  const DIM = "#8aad80";
  const BORDER = "#0d0d2a";

  const labelCell = (text) => `<td bgcolor="${BG2}" style="padding:10px 12px;color:${DIM};font-family:${FONT_H};font-size:10px;letter-spacing:2px;text-transform:uppercase;border-bottom:1px solid ${BORDER};background-color:${BG2};">${text}</td>`;
  const valueCell = (text, highlight) => `<td bgcolor="${BG2}" style="padding:10px 12px;color:${highlight ? NEON : TEXT};font-family:${FONT_B};font-size:14px;text-align:right;border-bottom:1px solid ${BORDER};background-color:${BG2};${highlight ? "font-weight:bold;font-size:20px;" : ""}">${text}</td>`;

  /* Dark mode meta + wrapper shared by both emails */
  const EMAIL_HEAD = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="dark only"><meta name="supported-color-schemes" content="dark only"><style>:root{color-scheme:dark only}body,html{background-color:' + BG + '!important}*{color-scheme:dark only}</style></head><body bgcolor="' + BG + '" style="margin:0;padding:0;background-color:' + BG + ';">';
  const EMAIL_FOOT = '</body></html>';
  const outerTableOpen = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="' + BG + '" style="background-color:' + BG + ';min-width:100%;width:100%;"><tr><td bgcolor="' + BG + '" style="background-color:' + BG + ';padding:32px 16px;" align="center">';
  const outerTableClose = '</td></tr></table>';

  /* --- Guest confirmation email --- */
  const guestHtml = `${EMAIL_HEAD}
${outerTableOpen}
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" bgcolor="${BG2}" style="max-width:560px;width:100%;background-color:${BG2};border:1px solid #162040;border-radius:6px;overflow:hidden;">
        <tr><td bgcolor="${NEON}" style="height:3px;background-color:${NEON};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td bgcolor="${BG2}" style="padding:36px 32px 28px;text-align:center;background-color:${BG2};">
          <div style="font-size:42px;line-height:1;margin-bottom:16px;">&#x1F6F8;</div>
          <h1 style="margin:0 0 4px;font-family:${FONT_H};font-size:24px;font-weight:900;color:${NEON};letter-spacing:4px;text-transform:uppercase;">Booking Confirmed</h1>
          <p style="margin:0;font-family:${FONT_H};font-size:11px;color:${PURPLE};letter-spacing:3px;text-transform:uppercase;">Alien Dog Campground &middot; Joshua Tree, CA</p>
        </td></tr>
        <tr><td bgcolor="${BG2}" style="padding:0 32px;background-color:${BG2};"><div style="height:1px;background:${BORDER};"></div></td></tr>
        <tr><td bgcolor="${BG2}" style="padding:24px 32px 20px;background-color:${BG2};">
          <p style="margin:0;font-family:${FONT_B};font-size:15px;color:${TEXT};line-height:1.7;">Hey ${guestName.split(" ")[0]} &mdash; your desert escape is locked in. The universe has your reservation.</p>
        </td></tr>
        <tr><td bgcolor="${BG2}" style="padding:0 32px;background-color:${BG2};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BG2}" style="border:1px solid ${BORDER};border-radius:4px;overflow:hidden;background-color:${BG2};">
            <tr>${labelCell("Check-in")}${valueCell(checkInFmt)}</tr>
            <tr>${labelCell("Check-out")}${valueCell(checkOutFmt)}</tr>
            <tr>${labelCell("Nights")}${valueCell(nights)}</tr>
            ${parseInt(pets, 10) > 0 ? `<tr>${labelCell("Pets")}${valueCell(pets)}</tr>` : ""}
            <tr>${labelCell("Total Paid")}${valueCell("$" + amountPaid, true)}</tr>
          </table>
        </td></tr>
        <tr><td bgcolor="${BG2}" style="padding:24px 32px;background-color:${BG2};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0a0f24" style="background-color:#0a0f24;border-left:3px solid ${PURPLE};border-radius:0 4px 4px 0;"><tr><td bgcolor="#0a0f24" style="padding:16px 20px;background-color:#0a0f24;">
            <p style="margin:0 0 4px;font-family:${FONT_H};font-size:10px;color:${PURPLE};letter-spacing:2px;text-transform:uppercase;">What happens next</p>
            <p style="margin:0;font-family:${FONT_B};font-size:13px;color:${DIM};line-height:1.7;">Check-in instructions and property access details will arrive closer to your stay. 5 acres of desert magic are waiting.</p>
          </td></tr></table>
        </td></tr>
        <tr><td bgcolor="${BG2}" style="padding:0 32px 28px;background-color:${BG2};">
          <p style="margin:0;font-family:${FONT_B};font-size:12px;color:${DIM};">Questions? <a href="mailto:onlinesupport@aliendog.com" style="color:${NEON};text-decoration:none;">onlinesupport@aliendog.com</a></p>
        </td></tr>
        <tr><td bgcolor="${BG2}" style="padding:16px 32px;border-top:1px solid ${BORDER};text-align:center;background-color:${BG2};">
          <p style="margin:0;font-family:${FONT_H};font-size:9px;color:#4a5a44;letter-spacing:2px;text-transform:uppercase;">Alien Dog Campground &middot; Joshua Tree, California</p>
        </td></tr>
      </table>
${outerTableClose}
${EMAIL_FOOT}`;

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

  const calIcon = calendarSuccess ? "&#x2713;" : "&#x2717;";
  const calColor = calendarSuccess ? NEON : "#ff5050";
  const calText = calendarSuccess ? "Dates blocked in Hospitable" : "FAILED to block dates — do this manually ASAP";
  const guestIcon = guestEmailSuccess ? "&#x2713;" : "&#x2717;";
  const guestColor = guestEmailSuccess ? NEON : "#ff5050";
  const guestText = guestEmailSuccess ? "Confirmation sent" : "Failed or skipped";

  const ownerHtml = `${EMAIL_HEAD}
${outerTableOpen}
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" bgcolor="${BG2}" style="max-width:560px;width:100%;background-color:${BG2};border:1px solid #162040;border-radius:6px;overflow:hidden;">
        <tr><td bgcolor="${NEON}" style="height:3px;background-color:${NEON};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td bgcolor="${BG2}" style="padding:28px 32px 20px;background-color:${BG2};">
          <h1 style="margin:0 0 4px;font-family:${FONT_H};font-size:20px;font-weight:900;color:${NEON};letter-spacing:3px;text-transform:uppercase;">&#x1F6F8; New Direct Booking</h1>
          <p style="margin:0;font-family:${FONT_H};font-size:10px;color:${PURPLE};letter-spacing:2px;">${checkIn} &rarr; ${checkOut}</p>
        </td></tr>
        <tr><td bgcolor="${BG2}" style="padding:0 32px;background-color:${BG2};"><div style="height:1px;background:${BORDER};"></div></td></tr>
        <tr><td bgcolor="${BG2}" style="padding:20px 32px;background-color:${BG2};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BG2}" style="border:1px solid ${BORDER};border-radius:4px;overflow:hidden;background-color:${BG2};">
            <tr>${labelCell("Guest")}${valueCell(guestName)}</tr>
            <tr>${labelCell("Email")}<td bgcolor="${BG2}" style="padding:10px 12px;font-family:${FONT_B};font-size:14px;text-align:right;border-bottom:1px solid ${BORDER};background-color:${BG2};"><a href="mailto:${guestEmail}" style="color:${NEON};text-decoration:none;">${guestEmail}</a></td></tr>
            <tr>${labelCell("Phone")}${valueCell(guestPhone || "Not provided")}</tr>
            <tr>${labelCell("Check-in")}${valueCell(checkInFmt)}</tr>
            <tr>${labelCell("Check-out")}${valueCell(checkOutFmt)}</tr>
            <tr>${labelCell("Nights")}${valueCell(nights)}</tr>
            <tr>${labelCell("Pets")}${valueCell(pets)}</tr>
            <tr>${labelCell("Total Paid")}${valueCell("$" + amountPaid, true)}</tr>
          </table>
        </td></tr>
        <tr><td bgcolor="${BG2}" style="padding:0 32px 20px;background-color:${BG2};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0a0f24" style="background-color:#0a0f24;border:1px solid ${BORDER};border-radius:4px;"><tr><td bgcolor="#0a0f24" style="padding:16px 20px;background-color:#0a0f24;">
            <p style="margin:0 0 4px;font-family:${FONT_H};font-size:10px;color:${PURPLE};letter-spacing:2px;text-transform:uppercase;">System Status</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
              <tr>
                <td bgcolor="#0a0f24" style="padding:4px 0;font-family:${FONT_B};font-size:13px;color:${DIM};background-color:#0a0f24;">Calendar</td>
                <td bgcolor="#0a0f24" style="padding:4px 0;font-family:${FONT_B};font-size:13px;color:${calColor};text-align:right;background-color:#0a0f24;">${calIcon} ${calText}</td>
              </tr>
              <tr>
                <td bgcolor="#0a0f24" style="padding:4px 0;font-family:${FONT_B};font-size:13px;color:${DIM};background-color:#0a0f24;">Guest email</td>
                <td bgcolor="#0a0f24" style="padding:4px 0;font-family:${FONT_B};font-size:13px;color:${guestColor};text-align:right;background-color:#0a0f24;">${guestIcon} ${guestText}</td>
              </tr>
            </table>
            <p style="margin:10px 0 0;font-family:${FONT_B};font-size:11px;color:#4a5a44;">Stripe: ${session.id}</p>
          </td></tr></table>
        </td></tr>
        <tr><td bgcolor="${BG2}" style="padding:0 32px 24px;background-color:${BG2};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#1a1000" style="background-color:#1a1000;border:1px solid #4d3800;border-left:3px solid #ffd60a;border-radius:0 4px 4px 0;"><tr><td bgcolor="#1a1000" style="padding:16px 20px;background-color:#1a1000;">
            <p style="margin:0 0 6px;font-family:${FONT_H};font-size:11px;color:#ffd60a;letter-spacing:2px;text-transform:uppercase;">&#x26A0; Action Required</p>
            <p style="margin:0;font-family:${FONT_B};font-size:13px;color:${TEXT};line-height:1.6;">Add this guest's reservation manually in Hospitable to trigger automated messaging (check-in instructions, house rules, etc).</p>
          </td></tr></table>
        </td></tr>
        <tr><td bgcolor="${BG2}" style="padding:16px 32px;border-top:1px solid ${BORDER};text-align:center;background-color:${BG2};">
          <p style="margin:0;font-family:${FONT_H};font-size:9px;color:#4a5a44;letter-spacing:2px;text-transform:uppercase;">Alien Dog Campground &middot; Internal Notification</p>
        </td></tr>
      </table>
${outerTableClose}
${EMAIL_FOOT}`;

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
