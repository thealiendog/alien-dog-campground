const Stripe = require("stripe");

const HOSPITABLE_BASE = "https://public.api.hospitable.com";
const PROPERTY_ID = "c947e17d-8779-41bc-a0ff-b15487fcae8f";
const FORMSPREE_URL = "https://formspree.io/f/mjgaepaq";

exports.handler = async function (event) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const hospitableToken = process.env.HOSPITABLE_API_TOKEN;

  if (!stripeKey || !webhookSecret || !hospitableToken) {
    console.error("Missing env vars:", {
      STRIPE_SECRET_KEY: !!stripeKey,
      STRIPE_WEBHOOK_SECRET: !!webhookSecret,
      HOSPITABLE_API_TOKEN: !!hospitableToken,
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
    pets,
  });

  if (!checkIn || !checkOut) {
    console.error("Missing check_in or check_out in session metadata");
    return { statusCode: 200, body: "No dates in metadata — skipping" };
  }

  /* Build array of dates to block (check-in through day before check-out) */
  const dates = [];
  const note = `Direct booking - ${guestName} - ${guestEmail} - Pets: ${pets} - Stripe: ${session.id}`;
  const start = new Date(checkIn + "T12:00:00Z");
  const end = new Date(checkOut + "T12:00:00Z");
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    dates.push({ date: `${yyyy}-${mm}-${dd}`, available: false, note });
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

  /* Send notification via Formspree */
  let formspreeSuccess = false;
  try {
    const formData = {
      _subject: `New Direct Booking - ${guestName} - ${checkIn} to ${checkOut}`,
      name: guestName,
      email: guestEmail,
      phone: guestPhone || "Not provided",
      check_in: checkIn,
      check_out: checkOut,
      pets: pets,
      total_paid: `$${amountPaid}`,
      stripe_session: session.id,
      calendar_blocked: calendarSuccess ? "Yes" : "FAILED — block dates manually",
      message:
        "New direct booking — add guest reservation manually in Hospitable to trigger automated messaging." +
        (calendarSuccess ? "" : " WARNING: Calendar dates were NOT blocked automatically — do this manually ASAP."),
    };

    console.log("Sending Formspree notification:", JSON.stringify(formData));

    const formRes = await fetch(FORMSPREE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(formData),
    });
    const formBody = await formRes.text();
    console.log("Formspree response:", formRes.status, formBody);
    formspreeSuccess = formRes.ok;
    if (!formRes.ok) {
      console.error("Formspree notification failed:", formRes.status, formBody);
    }
  } catch (err) {
    console.error("Formspree request error:", err.message);
  }

  console.log("Webhook complete:", {
    calendarBlocked: calendarSuccess,
    notificationSent: formspreeSuccess,
  });

  return { statusCode: 200, body: "Processed" };
};
