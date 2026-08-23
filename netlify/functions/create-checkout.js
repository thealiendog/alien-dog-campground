const Stripe = require("stripe");

const LISTING_ID = "c947e17d-8779-41bc-a0ff-b15487fcae8f";
const PMS = "smartbnb";
const CLEANING_FEE = 150;

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

exports.handler = async function (event) {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");

    const body = JSON.parse(event.body || "{}");
    const { check_in, check_out } = body;

    if (!check_in || !check_out) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "check_in and check_out are required" }),
      };
    }

    if (check_in >= check_out) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "check_out must be after check_in" }),
      };
    }

    const priceData = await fetchPrices(check_in, check_out);
    const prices = extractPrices(priceData);

    if (!prices || !Array.isArray(prices) || prices.length === 0) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "No pricing available for these dates" }),
      };
    }

    let nightlyTotal = 0;
    let nightCount = 0;
    for (const p of prices) {
      if (p.date >= check_in && p.date < check_out) {
        nightlyTotal += p.user_price !== undefined ? p.user_price : p.price;
        nightCount++;
      }
    }

    if (nightCount === 0) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "No pricing data for the selected nights" }),
      };
    }

    const grandTotal = nightlyTotal + CLEANING_FEE;
    const amountCents = Math.round(grandTotal * 100);

    const stripe = new Stripe(stripeKey);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Alien Dog Campground — ${check_in} to ${check_out}`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        check_in,
        check_out,
        nights: String(nightCount),
        nightly_total: String(nightlyTotal),
        cleaning_fee: String(CLEANING_FEE),
      },
      success_url: "https://aliendogcampground.com/booking-success",
      cancel_url: "https://aliendogcampground.com/",
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
