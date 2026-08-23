exports.handler = async function () {
  try {
    const icalUrl = process.env.HOSPITABLE_ICAL_URL;
    if (!icalUrl) throw new Error("HOSPITABLE_ICAL_URL not configured");
    const res = await fetch(icalUrl);
    if (!res.ok) throw new Error(`iCal fetch failed: ${res.status}`);
    const icsText = await res.text();

    const events = [];
    const blocks = icsText.split("BEGIN:VEVENT");
    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i];
      const get = (key) => {
        const m = block.match(new RegExp(`${key}[^:]*:(.+)`));
        return m ? m[1].trim() : null;
      };
      const dtstart = get("DTSTART");
      const dtend = get("DTEND");
      const summary = get("SUMMARY");
      if (dtstart && dtend) {
        events.push({
          start: dtstart.replace(/(\d{4})(\d{2})(\d{2}).*/, "$1-$2-$3"),
          end: dtend.replace(/(\d{4})(\d{2})(\d{2}).*/, "$1-$2-$3"),
          summary: summary || "Booked",
        });
      }
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
      },
      body: JSON.stringify({ events }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
