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
  const SP_ID = "e6d66975-3dd6-47a8-afb9-20846be79f15";

  /* Test 1: GET /v2/properties — FULL response to find Alien Dog property ID */
  try {
    const r1 = await fetch(`${BASE}/v2/properties`, { headers });
    results.v2_properties_full = { status: r1.status, body: await r1.text() };
  } catch (e) {
    results.v2_properties_full = { error: e.message };
  }

  /* Test 2: GET /v2/reservations with properties filter — see reservation data structure */
  try {
    const r2 = await fetch(`${BASE}/v2/reservations?properties[]=${SP_ID}`, { headers });
    results.v2_reservations_filtered = { status: r2.status, body: await r2.text() };
  } catch (e) {
    results.v2_reservations_filtered = { error: e.message };
  }

  /* Test 3: GET /v2/properties/{id}/calendar — check if calendar endpoint exists */
  try {
    const r3 = await fetch(`${BASE}/v2/properties/${SP_ID}/calendar?start_date=2027-01-01&end_date=2027-01-05`, { headers });
    results.v2_calendar = { status: r3.status, body: await r3.text() };
  } catch (e) {
    results.v2_calendar = { error: e.message };
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(results, null, 2),
  };
};
