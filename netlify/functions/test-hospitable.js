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

  /* Test 1: GET v1/reservations */
  try {
    const r1 = await fetch("https://api.hospitable.com/v1/reservations", { headers });
    results.v1_get = { status: r1.status, body: await r1.text().then(t => t.substring(0, 500)) };
  } catch (e) {
    results.v1_get = { error: e.message };
  }

  /* Test 2: GET v2/reservations */
  try {
    const r2 = await fetch("https://api.hospitable.com/v2/reservations", { headers });
    results.v2_get = { status: r2.status, body: await r2.text().then(t => t.substring(0, 500)) };
  } catch (e) {
    results.v2_get = { error: e.message };
  }

  /* Test 3: POST v2/reservations with minimal payload */
  try {
    const r3 = await fetch("https://api.hospitable.com/v2/reservations", {
      method: "POST",
      headers,
      body: JSON.stringify({
        property_id: "2301785",
        check_in: "2099-01-01",
        check_out: "2099-01-03",
        source: "direct",
        guest_name: "Test Guest",
        guest_email: "test@example.com",
      }),
    });
    results.v2_post = { status: r3.status, body: await r3.text().then(t => t.substring(0, 500)) };
  } catch (e) {
    results.v2_post = { error: e.message };
  }

  /* Test 4: POST v1/reservations with minimal payload */
  try {
    const r4 = await fetch("https://api.hospitable.com/v1/reservations", {
      method: "POST",
      headers,
      body: JSON.stringify({
        property_id: "2301785",
        check_in: "2099-01-01",
        check_out: "2099-01-03",
        source: "direct",
        guest_name: "Test Guest",
        guest_email: "test@example.com",
      }),
    });
    results.v1_post = { status: r4.status, body: await r4.text().then(t => t.substring(0, 500)) };
  } catch (e) {
    results.v1_post = { error: e.message };
  }

  /* Test 5: GET v2/properties to see if v2 works at all */
  try {
    const r5 = await fetch("https://api.hospitable.com/v2/properties", { headers });
    results.v2_properties = { status: r5.status, body: await r5.text().then(t => t.substring(0, 500)) };
  } catch (e) {
    results.v2_properties = { error: e.message };
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(results, null, 2),
  };
};
