const Stripe = require("stripe");

const HOSPITABLE_PROPERTY_ID = "2301785";

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

  /* Only handle checkout.session.completed */
  if (stripeEvent.type !== "checkout.session.completed") {
    console.log("Ignoring event type:", stripeEvent.type);
    return { statusCode: 200, body: "Event ignored" };
  }

  const session = stripeEvent.data.object;
  const meta = session.metadata || {};
  const checkIn = meta.check_in;
  const checkOut = meta.check_out;
  const pets = meta.pets || "0";
  const nightlyTotal = meta.nightly_total;
  const cleaningFee = meta.cleaning_fee;
  const petFee = meta.pet_fee || "0";
  const tot = meta.tot || "0";

  console.log("Payment completed:", {
    sessionId: session.id,
    customerEmail: session.customer_details?.email,
    amountTotal: session.amount_total,
    checkIn,
    checkOut,
    pets,
    nightlyTotal,
    cleaningFee,
    petFee,
    tot,
  });

  if (!checkIn || !checkOut) {
    console.error("Missing check_in or check_out in session metadata");
    return { statusCode: 200, body: "No dates in metadata — skipping reservation" };
  }

  /* Create reservation in Hospitable */
  try {
    const reservationBody = {
      property_id: HOSPITABLE_PROPERTY_ID,
      check_in: checkIn,
      check_out: checkOut,
      source: "direct",
      guest_name: session.customer_details?.name || "Direct Booking Guest",
      guest_email: session.customer_details?.email || "",
      guest_phone: session.customer_details?.phone || "",
      number_of_guests: 1,
      total_price: session.amount_total / 100,
      currency: "usd",
      notes: `Direct booking via Stripe. Pets: ${pets}. Session: ${session.id}`,
    };

    console.log("Creating Hospitable reservation:", JSON.stringify(reservationBody));

    const hospRes = await fetch(
      "https://api.hospitable.com/v1/reservations",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hospitableToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(reservationBody),
      }
    );

    const hospText = await hospRes.text();
    console.log("Hospitable response:", hospRes.status, hospText);

    if (!hospRes.ok) {
      console.error("Hospitable reservation failed:", hospRes.status, hospText);
      /* Return 200 to Stripe anyway — we don't want retries flooding a broken endpoint.
         The log will show the failure for manual follow-up. */
      return {
        statusCode: 200,
        body: "Payment processed, reservation creation failed — see logs",
      };
    }

    console.log("Reservation created successfully");
    return { statusCode: 200, body: "Reservation created" };
  } catch (err) {
    console.error("Error creating Hospitable reservation:", err.message);
    return {
      statusCode: 200,
      body: "Payment processed, reservation error — see logs",
    };
  }
};
