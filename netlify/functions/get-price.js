exports.handler = async function (event) {
  try {
    const apiKey = process.env.PRICELABS_API_KEY;
    if (!apiKey) throw new Error("PRICELABS_API_KEY not configured");

    const params = event.queryStringParameters || {};
    const dateFrom = params.date_from;
    const dateTo = params.date_to;

    if (!dateFrom || !dateTo) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "date_from and date_to query parameters are required" }),
      };
    }

    const res = await fetch("https://api.pricelabs.co/v1/listing_prices", {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        listings: [
          {
            id: "c947e17d-8779-41bc-a0ff-b15487fcae8f",
            pms: "smartbnb",
            dateFrom: dateFrom,
            dateTo: dateTo,
          },
        ],
      }),
    });

    const data = await res.text();

    return {
      statusCode: res.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
      },
      body: data,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
