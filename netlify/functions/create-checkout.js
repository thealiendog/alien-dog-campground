const Stripe = require("stripe");

const LISTING_ID = "c947e17d-8779-41bc-a0ff-b15487fcae8f";
const PMS = "smartbnb";
const TOT_RATE = 0.07;

/* House booking constants */
const HOUSE_CLEANING_FEE = 200;
const HOUSE_PET_FEE_PER = 100;
const HOUSE_MAX_PETS = 2;

/* Group booking constants */
const GROUP_NIGHTLY_RATE = 1000;
const GROUP_CLEANING_FEE = 400;
const GROUP_DOG_FEE_PER = 50;
const GROUP_MAX_DOGS = 10;
const GROUP_MIN_NIGHTS = 2;

async function fetchPrices(dateFrom, dateTo) {
  const apiKey = process.env.PRICELABS_API_KEY;
  if (!apiKey) throw new Error("PRICELABS_API_KEY not configured");

  const res = await fetch("https://api.pricelabs.co/v1/listing_prices", {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      listings: [{ id: LISTING_ID, pms: PMS, dateFrom, dateTo }],
    }),
  });

  if (!res.ok) throw new Error(`PriceLabs returned ${res.status}`);
  return res.json();
}

function extractPrices(data) {
  if (Array.isArray(data) && data.length > 0) return data[0].prices || data[0].data;
  if (data.prices) return data.prices;
  if (data.data && Array.isArray(data.data)) {
    if (data.data.length > 0 && data.data[0].prices) return data.data[0].prices;
    return data.data;
  }
  return null;
}

function countNights(checkIn, checkOut) {
  const start = new Date(checkIn + "T12:00:00Z");
  const end = new Date(checkOut + "T12:00:00Z");
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

function errorResponse(statusCode, message) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ error: message }),
  };
}

function extractGuestInfo(body) {
  return {
    name: (body.guest_name || "").substring(0, 200),
    email: (body.guest_email || "").substring(0, 200),
    phone: (body.guest_phone || "").substring(0, 50),
    city: (body.guest_city || "").substring(0, 100),
    state: (body.guest_state || "").substring(0, 50),
  };
}

async function handleHouseBooking(body, stripeKey) {
  const { check_in, check_out } = body;
  const pets = Math.min(Math.max(parseInt(body.pets, 10) || 0, 0), HOUSE_MAX_PETS);
  const guests = Math.min(Math.max(parseInt(body.guests, 10) || 1, 1), 4);
  const guest = extractGuestInfo(body);

  const priceData = await fetchPrices(check_in, check_out);
  const prices = extractPrices(priceData);

  if (!prices || !Array.isArray(prices) || prices.length === 0) {
    return errorResponse(400, "No pricing available for these dates");
  }

  let nightlyTotal = 0;
  let nightCount = 0;
  for (const p of prices) {
    if (p.date >= check_in && p.date < check_out) {
      nightlyTotal += (p.user_price > 0) ? p.user_price : p.price;
      nightCount++;
    }
  }

  if (nightCount === 0) {
    return errorResponse(400, "No pricing data for the selected nights");
  }

  const petFee = pets * HOUSE_PET_FEE_PER;
  const taxableBase = nightlyTotal + HOUSE_CLEANING_FEE + petFee;
  const tot = Math.round(taxableBase * TOT_RATE * 100) / 100;
  const grandTotal = Math.round((taxableBase + tot) * 100) / 100;
  const amountCents = Math.round(grandTotal * 100);

  const stripe = new Stripe(stripeKey);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: guest.email || undefined,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `Alien Dog Campground — House — ${check_in} to ${check_out}`,
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      booking_type: "house",
      check_in,
      check_out,
      nights: String(nightCount),
      nightly_total: String(nightlyTotal),
      cleaning_fee: String(HOUSE_CLEANING_FEE),
      pet_fee: String(petFee),
      pets: String(pets),
      guests: String(guests),
      tot: String(tot),
      guest_name: guest.name,
      guest_phone: guest.phone,
      guest_city: guest.city,
      guest_state: guest.state,
    },
    success_url: "https://aliendogcampground.com/booking-success",
    cancel_url: "https://aliendogcampground.com/",
  });

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ url: session.url }),
  };
}

async function handleGroupBooking(body, stripeKey) {
  const { check_in, check_out } = body;
  const dogs = Math.min(Math.max(parseInt(body.dogs, 10) || 0, 0), GROUP_MAX_DOGS);
  const guests = Math.min(Math.max(parseInt(body.guests, 10) || 1, 1), 20);
  const notes = (body.notes || "").substring(0, 500);
  const guest = extractGuestInfo(body);
  const nightCount = countNights(check_in, check_out);

  if (nightCount < GROUP_MIN_NIGHTS) {
    return errorResponse(400, `Group bookings require a minimum of ${GROUP_MIN_NIGHTS} nights`);
  }

  const nightlyTotal = nightCount * GROUP_NIGHTLY_RATE;
  const dogFee = dogs * GROUP_DOG_FEE_PER;
  const taxableBase = nightlyTotal + GROUP_CLEANING_FEE + dogFee;
  const tot = Math.round(taxableBase * TOT_RATE * 100) / 100;
  const grandTotal = Math.round((taxableBase + tot) * 100) / 100;
  const amountCents = Math.round(grandTotal * 100);

  const stripe = new Stripe(stripeKey);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: guest.email || undefined,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `Alien Dog Campground — Group Booking — ${check_in} to ${check_out}`,
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      booking_type: "group",
      check_in,
      check_out,
      nights: String(nightCount),
      nightly_total: String(nightlyTotal),
      cleaning_fee: String(GROUP_CLEANING_FEE),
      dog_fee: String(dogFee),
      dogs: String(dogs),
      guests: String(guests),
      tot: String(tot),
      notes: notes,
      guest_name: guest.name,
      guest_phone: guest.phone,
      guest_city: guest.city,
      guest_state: guest.state,
    },
    success_url: "https://aliendogcampground.com/booking-success",
    cancel_url: "https://aliendogcampground.com/",
  });

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ url: session.url }),
  };
}

exports.handler = async function (event) {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");

    const body = JSON.parse(event.body || "{}");
    const { check_in, check_out, booking_type } = body;

    if (!check_in || !check_out) {
      return errorResponse(400, "check_in and check_out are required");
    }
    if (check_in >= check_out) {
      return errorResponse(400, "check_out must be after check_in");
    }

    if (booking_type === "group") {
      return await handleGroupBooking(body, stripeKey);
    }
    return await handleHouseBooking(body, stripeKey);
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
