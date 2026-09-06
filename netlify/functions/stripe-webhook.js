const Stripe = require("stripe");

const HOSPITABLE_BASE = "https://public.api.hospitable.com";
const PROPERTY_ID = "c947e17d-8779-41bc-a0ff-b15487fcae8f";
const RESEND_URL = "https://api.resend.com/emails";
const FROM_ADDRESS = "Alien Dog Campground <onlinesupport@aliendogcampground.com>";
const REPLY_TO = "onlinesupport@thealiendog.com";

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
  const bookingType = meta.booking_type || "house";
  const checkIn = meta.check_in;
  const checkOut = meta.check_out;
  const nights = meta.nights || "0";
  const pets = meta.pets || "0";
  const dogs = meta.dogs || "0";
  const guests = meta.guests || "1";
  const notes = meta.notes || "";
  const guestName = meta.guest_name || session.customer_details?.name || "Direct Booking Guest";
  const guestEmail = session.customer_details?.email || "";
  const guestPhone = meta.guest_phone || session.customer_details?.phone || "";
  const addr = session.customer_details?.address || {};
  const metaCity = [meta.guest_city, meta.guest_state].filter(Boolean).join(", ");
  const stripeCity = [addr.city, addr.state].filter(Boolean).join(", ");
  const guestCity = metaCity || stripeCity || "";
  const amountPaid = session.amount_total ? (session.amount_total / 100).toFixed(2) : "unknown";
  const isGroup = bookingType === "group";
  const petDisplay = isGroup ? dogs : pets;
  const nightlyTotal = meta.nightly_total || "0";
  const cleaningFee = meta.cleaning_fee || "0";
  const petFee = isGroup ? (meta.dog_fee || "0") : (meta.pet_fee || "0");
  const tot = meta.tot || "0";

  console.log("Payment completed:", {
    sessionId: session.id,
    bookingType,
    guestName,
    guestEmail,
    guestPhone,
    amountPaid,
    checkIn,
    checkOut,
    nights,
    pets: petDisplay,
    guests: isGroup ? guests : "N/A",
  });

  if (!checkIn || !checkOut) {
    console.error("Missing check_in or check_out in session metadata");
    return { statusCode: 200, body: "No dates in metadata — skipping" };
  }

  /* Build array of dates to block (check-in through day before check-out) */
  const dates = [];
  const typeLabel = isGroup ? "Group booking" : "House booking";
  const calNote = `${typeLabel} - ${guestName} - ${guestEmail} - ${isGroup ? "Dogs: " + dogs + " - Guests: " + guests : "Pets: " + pets}${notes ? " - Notes: " + notes : ""} - Stripe: ${session.id}`;
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

  const { buildGuestEmail, buildOwnerEmail } = require("./lib/email-templates");

  /* --- Guest confirmation email --- */
  const guestHtml = buildGuestEmail({
    guestName, checkIn, checkOut, nights, amountPaid,
    pets: petDisplay,
    bookingType: isGroup ? "Group Booking" : null,
    guests: isGroup ? guests : null,
  });

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
          reply_to: REPLY_TO,
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
  const ownerHtml = buildOwnerEmail({
    guestName, guestEmail, guestPhone, checkIn, checkOut,
    nights, pets: petDisplay, amountPaid, sessionId: session.id,
    calendarSuccess, guestEmailSuccess,
    bookingType: isGroup ? "Group Booking" : "House Booking",
    guests: guests,
    guestCity: guestCity,
    notes: notes || null,
    nightlyTotal, cleaningFee, petFee, tot,
  });

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
        reply_to: REPLY_TO,
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

  /* --- SMS notification via Twilio --- */
  /* --- SMS notification via Twilio Content Template --- */
  let smsSuccess = false;
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_FROM_NUMBER;
  const twilioTo = process.env.TWILIO_TO_NUMBER;
  const twilioContentSid = process.env.TWILIO_CONTENT_SID;

  if (twilioSid && twilioAuth && twilioFrom && twilioTo && twilioContentSid) {
    try {
      const smsParams = new URLSearchParams();
      smsParams.append("To", twilioTo);
      smsParams.append("From", twilioFrom);
      smsParams.append("ContentSid", twilioContentSid);
      smsParams.append("ContentVariables", JSON.stringify({
        "1": isGroup ? "Group" : "House",
        "2": guestName,
        "3": checkIn,
        "4": checkOut,
        "5": "$" + amountPaid,
      }));

      const smsRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: "Basic " + Buffer.from(`${twilioSid}:${twilioAuth}`).toString("base64"),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: smsParams.toString(),
        }
      );
      const smsData = await smsRes.text();
      console.log("Twilio SMS response:", smsRes.status, smsData);
      smsSuccess = smsRes.ok || smsRes.status === 201;
      if (!smsSuccess) console.error("SMS failed:", smsRes.status, smsData);
    } catch (err) {
      console.error("SMS error:", err.message);
    }
  } else {
    console.log("Twilio not fully configured — skipping SMS");
  }

  console.log("Webhook complete:", {
    calendarBlocked: calendarSuccess,
    guestEmailSent: guestEmailSuccess,
    ownerEmailSent: ownerEmailSuccess,
    smsSent: smsSuccess,
  });

  return { statusCode: 200, body: "Processed" };
};
