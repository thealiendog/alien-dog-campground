// Temporary function to unblock Jan 11-12 2027 test dates
exports.handler = async function () {
  const token = process.env.HOSPITABLE_API_TOKEN;
  if (!token) return { statusCode: 500, body: "HOSPITABLE_API_TOKEN not set" };

  const PROPERTY_ID = "c947e17d-8779-41bc-a0ff-b15487fcae8f";
  const BASE = "https://public.api.hospitable.com";

  try {
    const res = await fetch(`${BASE}/v2/properties/${PROPERTY_ID}/calendar`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        dates: [
          { date: "2027-01-11", available: true, note: "Unblocked - test reservation cleared" },
          { date: "2027-01-12", available: true, note: "Unblocked - test reservation cleared" },
        ],
      }),
    });

    const body = await res.text();
    return {
      statusCode: res.status,
      headers: { "Content-Type": "application/json" },
      body: body,
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
