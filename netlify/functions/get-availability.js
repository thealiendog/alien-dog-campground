const PROPERTY_ID = "c947e17d-8779-41bc-a0ff-b15487fcae8f";
const HOSPITABLE_BASE = "https://public.api.hospitable.com";

exports.handler = async function () {
  const icalUrl = process.env.HOSPITABLE_ICAL_URL;
  const hospitableToken = process.env.HOSPITABLE_API_TOKEN;
  const events = [];

  /* Source 1: iCal feed (Airbnb/channel bookings) */
  if (icalUrl) {
    try {
      const res = await fetch(icalUrl);
      if (res.ok) {
        const icsText = await res.text();
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
      }
    } catch (e) {
      console.error("iCal fetch error:", e.message);
    }
  }

  /* Source 2: Hospitable calendar API (direct bookings / manual blocks) */
  if (hospitableToken) {
    try {
      const now = new Date();
      const startDate = now.toISOString().split("T")[0];
      const endDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())
        .toISOString().split("T")[0];

      const res = await fetch(
        `${HOSPITABLE_BASE}/v2/properties/${PROPERTY_ID}/calendar?start_date=${startDate}&end_date=${endDate}`,
        {
          headers: {
            Authorization: `Bearer ${hospitableToken}`,
            Accept: "application/json",
          },
        }
      );

      if (res.ok) {
        const calData = await res.json();
        const dates = calData.data || calData.dates || calData;

        if (Array.isArray(dates)) {
          /* Group consecutive unavailable dates into event ranges */
          let blockStart = null;
          let blockEnd = null;

          for (const d of dates) {
            const date = d.date;
            const available = d.available !== false && d.status !== "unavailable" && d.status !== "blocked";

            if (!available) {
              if (!blockStart) {
                blockStart = date;
                blockEnd = date;
              } else {
                /* Check if consecutive */
                const prev = new Date(blockEnd + "T12:00:00Z");
                const curr = new Date(date + "T12:00:00Z");
                const diffDays = (curr - prev) / (1000 * 60 * 60 * 24);
                if (diffDays <= 1) {
                  blockEnd = date;
                } else {
                  /* Push previous block */
                  const endPlusOne = new Date(blockEnd + "T12:00:00Z");
                  endPlusOne.setDate(endPlusOne.getDate() + 1);
                  events.push({
                    start: blockStart,
                    end: endPlusOne.toISOString().split("T")[0],
                    summary: "Blocked",
                  });
                  blockStart = date;
                  blockEnd = date;
                }
              }
            } else {
              if (blockStart) {
                const endPlusOne = new Date(blockEnd + "T12:00:00Z");
                endPlusOne.setDate(endPlusOne.getDate() + 1);
                events.push({
                  start: blockStart,
                  end: endPlusOne.toISOString().split("T")[0],
                  summary: "Blocked",
                });
                blockStart = null;
                blockEnd = null;
              }
            }
          }
          /* Flush last block if any */
          if (blockStart) {
            const endPlusOne = new Date(blockEnd + "T12:00:00Z");
            endPlusOne.setDate(endPlusOne.getDate() + 1);
            events.push({
              start: blockStart,
              end: endPlusOne.toISOString().split("T")[0],
              summary: "Blocked",
            });
          }
        }
      }
    } catch (e) {
      console.error("Hospitable calendar API error:", e.message);
    }
  }

  /* Deduplicate: if a date is covered by multiple events, it's still just booked */
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
    },
    body: JSON.stringify({ events }),
  };
};
