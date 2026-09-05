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

    /* Look up promotion codes with coupon expanded inline */
    const promos = await stripe.promotionCodes.list({
      code, active: true, limit: 1, expand: ["data.coupon"],
    });

    if (!promos.data || promos.data.length === 0) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ valid: false, error: "Invalid or expired promo code" }),
      };
    }

    const promo = promos.data[0];
    const coupon = promo.coupon;

    /* Log full promo object for debugging */
    console.log("Raw promo object:", JSON.stringify(promo, null, 2));

    const result = {
      valid: true,
      promo_id: promo.id,
      code: promo.code,
      name: (coupon && coupon.name) || promo.code,
    };

    if (coupon && coupon.percent_off != null && coupon.percent_off > 0) {
      result.type = "percent";
      result.percent_off = coupon.percent_off;
    } else if (coupon && coupon.amount_off != null && coupon.amount_off > 0) {
      result.type = "amount";
      result.amount_off = coupon.amount_off / 100;
    }

    /* Debug: log what we found */
    console.log("Promo validated:", {
      code: promo.code, promo_id: promo.id,
      coupon_type: typeof promo.coupon,
      coupon_id: coupon?.id,
      percent_off: coupon?.percent_off,
      amount_off: coupon?.amount_off,
      result_type: result.type,
    });

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
