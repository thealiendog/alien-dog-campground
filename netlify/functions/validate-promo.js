const Stripe = require("stripe");

exports.handler = async function (event) {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");

    const params = event.queryStringParameters || {};
    const code = (params.code || "").trim().toUpperCase();

    if (!code) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ valid: false, error: "No promo code provided" }),
      };
    }

    const stripe = new Stripe(stripeKey);

    /* Look up promotion codes matching this code string */
    const promos = await stripe.promotionCodes.list({ code, active: true, limit: 1 });

    if (!promos.data || promos.data.length === 0) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ valid: false, error: "Invalid or expired promo code" }),
      };
    }

    const promo = promos.data[0];

    /* Expand the coupon if it came back as just an ID string */
    let coupon = promo.coupon;
    if (typeof coupon === "string") {
      coupon = await stripe.coupons.retrieve(coupon);
    }

    /* If coupon couldn't be resolved, still allow — Stripe will validate at checkout */
    const result = {
      valid: true,
      promo_id: promo.id,
      code: promo.code,
      name: (coupon && coupon.name) || promo.code,
    };

    if (coupon && coupon.percent_off) {
      result.type = "percent";
      result.percent_off = coupon.percent_off;
    } else if (coupon && coupon.amount_off) {
      result.type = "amount";
      result.amount_off = coupon.amount_off / 100; /* Convert from cents */
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(result),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ valid: false, error: err.message }),
    };
  }
};
