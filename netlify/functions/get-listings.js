exports.handler = async function () {
  try {
    const apiKey = process.env.PRICELABS_API_KEY;
    if (!apiKey) throw new Error("PRICELABS_API_KEY not configured");

    const res = await fetch("https://api.pricelabs.co/v1/listings", {
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
    });

    const data = await res.text();

    return {
      statusCode: res.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
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
