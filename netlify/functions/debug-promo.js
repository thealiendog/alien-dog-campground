const Stripe = require("stripe");

exports.handler = async function () {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) return { statusCode: 500, body: "STRIPE_SECRET_KEY not set" };

    const stripe = new Stripe(stripeKey);

    /* Try exact case variations */
    const results = {};

    for (const code of ["TEST90", "test90", "Test90"]) {
      const promos = await stripe.promotionCodes.list({ code, limit: 1 });
      if (promos.data.length > 0) {
        const p = promos.data[0];
        results[code] = {
          promo_id: p.id,
          promo_code: p.code,
          promo_active: p.active,
          promo_expires_at: p.expires_at,
          coupon_id: p.coupon?.id,
          coupon_valid: p.coupon?.valid,
          coupon_name: p.coupon?.name,
          coupon_percent_off: p.coupon?.percent_off,
          coupon_amount_off: p.coupon?.amount_off,
          coupon_redeem_by: p.coupon?.redeem_by,
          coupon_max_redemptions: p.coupon?.max_redemptions,
          coupon_times_redeemed: p.coupon?.times_redeemed,
          coupon_duration: p.coupon?.duration,
        };
      } else {
        results[code] = "not found";
      }
    }

    /* Also try without active filter */
    const allPromos = await stripe.promotionCodes.list({ code: "TEST90", limit: 5 });
    results.all_TEST90 = allPromos.data.map(p => ({
      id: p.id, code: p.code, active: p.active,
      coupon_valid: p.coupon?.valid, coupon_id: p.coupon?.id,
    }));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(results, null, 2),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
