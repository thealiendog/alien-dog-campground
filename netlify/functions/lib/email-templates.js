const FONT_H = "'Trebuchet MS', 'Lucida Sans', Arial, sans-serif";
const FONT_B = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
const NEON = "#39ff14";
const PURPLE = "#c77dff";
const BG = "#03000f";
const BG2 = "#06001e";
const TEXT = "#e8f4e3";
const DIM = "#8aad80";
const BORDER = "#0d0d2a";

const labelCell = (text) =>
  `<td bgcolor="${BG2}" style="padding:10px 12px;color:${DIM};font-family:${FONT_H};font-size:10px;letter-spacing:2px;text-transform:uppercase;border-bottom:1px solid ${BORDER};background-color:${BG2};">${text}</td>`;

const valueCell = (text, highlight) =>
  `<td bgcolor="${BG2}" style="padding:10px 12px;color:${highlight ? NEON : TEXT};font-family:${FONT_B};font-size:14px;text-align:right;border-bottom:1px solid ${BORDER};background-color:${BG2};${highlight ? "font-weight:bold;font-size:20px;" : ""}">${text}</td>`;

const EMAIL_HEAD =
  '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="dark only"><meta name="supported-color-schemes" content="dark only"><style>:root{color-scheme:dark only}body,html{background-color:' +
  BG +
  '!important}*{color-scheme:dark only}</style></head><body bgcolor="' +
  BG +
  '" style="margin:0;padding:0;background-color:' +
  BG +
  ';">';
const EMAIL_FOOT = "</body></html>";
const outerTableOpen =
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="' +
  BG +
  '" style="background-color:' +
  BG +
  ';min-width:100%;width:100%;"><tr><td bgcolor="' +
  BG +
  '" style="background-color:' +
  BG +
  ';padding:32px 16px;" align="center">';
const outerTableClose = "</td></tr></table>";

function fmtDate(d) {
  return new Date(d + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * @param {object} data
 * @param {string} data.guestName
 * @param {string} data.checkIn       YYYY-MM-DD
 * @param {string} data.checkOut      YYYY-MM-DD
 * @param {string} data.nights
 * @param {string} data.pets
 * @param {string} data.amountPaid    e.g. "715.83"
 */
function buildGuestEmail(data) {
  const { guestName, checkIn, checkOut, nights, pets, amountPaid, bookingType, guests } = data;
  const checkInFmt = fmtDate(checkIn);
  const checkOutFmt = fmtDate(checkOut);
  const typeLabel = bookingType || "Booking";

  return `${EMAIL_HEAD}
${outerTableOpen}
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" bgcolor="${BG2}" style="max-width:560px;width:100%;background-color:${BG2};border:1px solid #162040;border-radius:6px;overflow:hidden;">
        <tr><td bgcolor="${NEON}" style="height:3px;background-color:${NEON};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td bgcolor="${BG2}" style="padding:36px 32px 28px;text-align:center;background-color:${BG2};">
          <div style="font-size:42px;line-height:1;margin-bottom:16px;">&#x1F6F8;</div>
          <h1 style="margin:0 0 4px;font-family:${FONT_H};font-size:24px;font-weight:900;color:${NEON};letter-spacing:4px;text-transform:uppercase;">Booking Confirmed</h1>
          <p style="margin:0;font-family:${FONT_H};font-size:11px;color:${PURPLE};letter-spacing:3px;text-transform:uppercase;">Alien Dog Campground &middot; Joshua Tree, CA</p>
        </td></tr>
        <tr><td bgcolor="${BG2}" style="padding:0 32px;background-color:${BG2};"><div style="height:1px;background:${BORDER};"></div></td></tr>
        <tr><td bgcolor="${BG2}" style="padding:24px 32px 20px;background-color:${BG2};">
          <p style="margin:0;font-family:${FONT_B};font-size:15px;color:${TEXT};line-height:1.7;">Hey ${guestName.split(" ")[0]} &mdash; your desert escape is locked in. The universe has your reservation.</p>
        </td></tr>
        <tr><td bgcolor="${BG2}" style="padding:0 32px;background-color:${BG2};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BG2}" style="border:1px solid ${BORDER};border-radius:4px;overflow:hidden;background-color:${BG2};">
            <tr>${labelCell("Check-in")}${valueCell(checkInFmt)}</tr>
            <tr>${labelCell("Check-out")}${valueCell(checkOutFmt)}</tr>
            <tr>${labelCell("Nights")}${valueCell(nights)}</tr>
            ${guests ? `<tr>${labelCell("Guests")}${valueCell(guests)}</tr>` : ""}
            ${parseInt(pets, 10) > 0 ? `<tr>${labelCell(bookingType === "Group Booking" ? "Dogs" : "Pets")}${valueCell(pets)}</tr>` : ""}
            <tr>${labelCell("Total Paid")}${valueCell("$" + amountPaid, true)}</tr>
          </table>
        </td></tr>
        <tr><td bgcolor="${BG2}" style="padding:24px 32px;background-color:${BG2};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0a0f24" style="background-color:#0a0f24;border-left:3px solid ${PURPLE};border-radius:0 4px 4px 0;"><tr><td bgcolor="#0a0f24" style="padding:16px 20px;background-color:#0a0f24;">
            <p style="margin:0 0 4px;font-family:${FONT_H};font-size:10px;color:${PURPLE};letter-spacing:2px;text-transform:uppercase;">What happens next</p>
            <p style="margin:0;font-family:${FONT_B};font-size:13px;color:${DIM};line-height:1.7;">Check-in instructions and property access details will arrive closer to your stay. 5 acres of desert magic are waiting.</p>
          </td></tr></table>
        </td></tr>
        <tr><td bgcolor="${BG2}" style="padding:0 32px 28px;background-color:${BG2};">
          <p style="margin:0;font-family:${FONT_B};font-size:12px;color:${DIM};">Questions? <a href="mailto:onlinesupport@thealiendog.com" style="color:${NEON};text-decoration:none;">onlinesupport@thealiendog.com</a></p>
        </td></tr>
        <tr><td bgcolor="${BG2}" style="padding:16px 32px;border-top:1px solid ${BORDER};text-align:center;background-color:${BG2};">
          <p style="margin:0;font-family:${FONT_H};font-size:9px;color:#4a5a44;letter-spacing:2px;text-transform:uppercase;">Alien Dog Campground &middot; Joshua Tree, California</p>
        </td></tr>
      </table>
${outerTableClose}
${EMAIL_FOOT}`;
}

/**
 * @param {object} data
 * @param {string} data.guestName
 * @param {string} data.guestEmail
 * @param {string} data.guestPhone
 * @param {string} data.checkIn
 * @param {string} data.checkOut
 * @param {string} data.nights
 * @param {string} data.pets
 * @param {string} data.amountPaid
 * @param {string} data.sessionId
 * @param {boolean} data.calendarSuccess
 * @param {boolean} data.guestEmailSuccess
 */
function buildOwnerEmail(data) {
  const {
    guestName, guestEmail, guestPhone, checkIn, checkOut,
    nights, pets, amountPaid, sessionId, calendarSuccess, guestEmailSuccess,
    bookingType, guests, guestCity, notes,
    nightlyTotal, cleaningFee, petFee, tot,
  } = data;
  const typeLabel = bookingType || "House Booking";
  const checkInFmt = fmtDate(checkIn);
  const checkOutFmt = fmtDate(checkOut);
  const calIcon = calendarSuccess ? "&#x2713;" : "&#x2717;";
  const calColor = calendarSuccess ? NEON : "#ff5050";
  const calText = calendarSuccess ? "Dates blocked in Hospitable" : "FAILED to block dates — do this manually ASAP";
  const gIcon = guestEmailSuccess ? "&#x2713;" : "&#x2717;";
  const gColor = guestEmailSuccess ? NEON : "#ff5050";
  const gText = guestEmailSuccess ? "Confirmation sent" : "Failed or skipped";

  return `${EMAIL_HEAD}
${outerTableOpen}
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" bgcolor="${BG2}" style="max-width:560px;width:100%;background-color:${BG2};border:1px solid #162040;border-radius:6px;overflow:hidden;">
        <tr><td bgcolor="${NEON}" style="height:3px;background-color:${NEON};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td bgcolor="${BG2}" style="padding:28px 32px 20px;background-color:${BG2};">
          <h1 style="margin:0 0 4px;font-family:${FONT_H};font-size:20px;font-weight:900;color:${NEON};letter-spacing:3px;text-transform:uppercase;">&#x1F6F8; New ${typeLabel}</h1>
          <p style="margin:0;font-family:${FONT_H};font-size:10px;color:${PURPLE};letter-spacing:2px;">${checkIn} &rarr; ${checkOut}</p>
        </td></tr>
        <tr><td bgcolor="${BG2}" style="padding:0 32px;background-color:${BG2};"><div style="height:1px;background:${BORDER};"></div></td></tr>
        <tr><td bgcolor="${BG2}" style="padding:20px 32px;background-color:${BG2};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BG2}" style="border:1px solid ${BORDER};border-radius:4px;overflow:hidden;background-color:${BG2};">
            <tr>${labelCell("Guest Name")}${valueCell(guestName)}</tr>
            <tr>${labelCell("Email")}<td bgcolor="${BG2}" style="padding:10px 12px;font-family:${FONT_B};font-size:14px;text-align:right;border-bottom:1px solid ${BORDER};background-color:${BG2};"><a href="mailto:${guestEmail}" style="color:${NEON};text-decoration:none;">${guestEmail}</a></td></tr>
            <tr>${labelCell("Phone")}${valueCell(guestPhone || "Not provided")}</tr>
            ${guestCity ? `<tr>${labelCell("From")}${valueCell(guestCity)}</tr>` : ""}
            <tr>${labelCell("Check-in")}${valueCell(checkInFmt)}</tr>
            <tr>${labelCell("Check-out")}${valueCell(checkOutFmt)}</tr>
            <tr>${labelCell("Nights")}${valueCell(nights)}</tr>
            <tr>${labelCell("Guests")}${valueCell(guests || "1")}</tr>
            <tr>${labelCell(typeLabel === "Group Booking" ? "Dogs" : "Pets")}${valueCell(pets)}</tr>
            ${notes ? `<tr>${labelCell("Notes")}${valueCell(notes)}</tr>` : ""}
          </table>
        </td></tr>
        <tr><td bgcolor="${BG2}" style="padding:0 32px 20px;background-color:${BG2};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BG2}" style="border:1px solid ${BORDER};border-radius:4px;overflow:hidden;background-color:${BG2};">
            <tr><td colspan="2" bgcolor="${BG2}" style="padding:10px 12px;font-family:${FONT_H};font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${PURPLE};background-color:${BG2};border-bottom:1px solid ${BORDER};">Price Breakdown</td></tr>
            <tr>${labelCell(nights + " nights" + (nightlyTotal && nights ? " \u00d7 $" + Math.round(nightlyTotal / nights) + "/night" : ""))}${valueCell("$" + nightlyTotal)}</tr>
            <tr>${labelCell("Cleaning fee")}${valueCell("$" + cleaningFee)}</tr>
            ${parseInt(petFee, 10) > 0 ? `<tr>${labelCell((typeLabel === "Group Booking" ? "Dog" : "Pet") + " fee (" + pets + " \u00d7 $" + Math.round(petFee / Math.max(parseInt(pets,10),1)) + ")")}${valueCell("$" + petFee)}</tr>` : ""}
            <tr>${labelCell("Occupancy Tax (7%)")}${valueCell("$" + tot)}</tr>
            <tr>${labelCell("Total Paid")}${valueCell("$" + amountPaid, true)}</tr>
          </table>
        </td></tr>
        <tr><td bgcolor="${BG2}" style="padding:0 32px 20px;background-color:${BG2};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0a0f24" style="background-color:#0a0f24;border:1px solid ${BORDER};border-radius:4px;"><tr><td bgcolor="#0a0f24" style="padding:16px 20px;background-color:#0a0f24;">
            <p style="margin:0 0 4px;font-family:${FONT_H};font-size:10px;color:${PURPLE};letter-spacing:2px;text-transform:uppercase;">System Status</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
              <tr>
                <td bgcolor="#0a0f24" style="padding:4px 0;font-family:${FONT_B};font-size:13px;color:${DIM};background-color:#0a0f24;">Calendar</td>
                <td bgcolor="#0a0f24" style="padding:4px 0;font-family:${FONT_B};font-size:13px;color:${calColor};text-align:right;background-color:#0a0f24;">${calIcon} ${calText}</td>
              </tr>
              <tr>
                <td bgcolor="#0a0f24" style="padding:4px 0;font-family:${FONT_B};font-size:13px;color:${DIM};background-color:#0a0f24;">Guest email</td>
                <td bgcolor="#0a0f24" style="padding:4px 0;font-family:${FONT_B};font-size:13px;color:${gColor};text-align:right;background-color:#0a0f24;">${gIcon} ${gText}</td>
              </tr>
            </table>
            <p style="margin:10px 0 0;font-family:${FONT_B};font-size:11px;color:#4a5a44;">Stripe: ${sessionId}</p>
          </td></tr></table>
        </td></tr>
        <tr><td bgcolor="${BG2}" style="padding:0 32px 24px;background-color:${BG2};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#1a1000" style="background-color:#1a1000;border:1px solid #4d3800;border-left:3px solid #ffd60a;border-radius:0 4px 4px 0;"><tr><td bgcolor="#1a1000" style="padding:16px 20px;background-color:#1a1000;">
            <p style="margin:0 0 6px;font-family:${FONT_H};font-size:11px;color:#ffd60a;letter-spacing:2px;text-transform:uppercase;">&#x26A0; Action Required</p>
            <p style="margin:0;font-family:${FONT_B};font-size:13px;color:${TEXT};line-height:1.6;">Add this guest's reservation manually in Hospitable to trigger automated messaging (check-in instructions, house rules, etc).</p>
          </td></tr></table>
        </td></tr>
        <tr><td bgcolor="${BG2}" style="padding:16px 32px;border-top:1px solid ${BORDER};text-align:center;background-color:${BG2};">
          <p style="margin:0;font-family:${FONT_H};font-size:9px;color:#4a5a44;letter-spacing:2px;text-transform:uppercase;">Alien Dog Campground &middot; Internal Notification</p>
        </td></tr>
      </table>
${outerTableClose}
${EMAIL_FOOT}`;
}

module.exports = { buildGuestEmail, buildOwnerEmail };
