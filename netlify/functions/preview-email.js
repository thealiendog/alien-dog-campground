const { buildGuestEmail } = require("./lib/email-templates");

exports.handler = async function () {
  const html = buildGuestEmail({
    guestName: "Caro Manos",
    checkIn: "2027-01-11",
    checkOut: "2027-01-13",
    nights: "2",
    pets: "1",
    amountPaid: "715.83",
  });

  return {
    statusCode: 200,
    headers: { "Content-Type": "text/html" },
    body: html,
  };
};
