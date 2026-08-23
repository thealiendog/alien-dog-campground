exports.handler = async function () {
  const token = process.env.HOSPITABLE_API_TOKEN;
  if (!token) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "HOSPITABLE_API_TOKEN not set" }),
    };
  }

  const results = {};
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const BASE = "https://public.api.hospitable.com";

  /* Test 1: GET /v2/properties — confirm auth, get property/listing IDs */
  try {
    const r1 = await fetch(`${BASE}/v2/properties`, { headers });
    const text1 = await r1.text();
    results.v2_properties = { status: r1.status, body: text1.substring(0, 2000) };
  } catch (e) {
    results.v2_properties = { error: e.message };
  }

  /* Test 2: GET /v2/reservations — confirm endpoint exists */
  try {
    const r2 = await fetch(`${BASE}/v2/reservations`, { headers });
    const text2 = await r2.text();
    results.v2_reservations = { status: r2.status, body: text2.substring(0, 2000) };
  } catch (e) {
    results.v2_reservations = { error: e.message };
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(results, null, 2),
  };
};
