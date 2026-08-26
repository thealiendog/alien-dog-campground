exports.handler = async function () {
  try {
    const apiKey = process.env.PRICELABS_API_KEY;
    if (!apiKey) return { statusCode: 500, body: "PRICELABS_API_KEY not set" };

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
            dateFrom: "2027-01-11",
            dateTo: "2027-01-13",
          },
        ],
      }),
    });

    const data = await res.text();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: data,
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
