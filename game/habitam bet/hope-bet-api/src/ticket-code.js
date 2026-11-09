"use strict";

/**
 * Generate the stable public identifier printed on a ticket and encoded in
 * the ticket's QR/status link. The arithmetic intentionally mirrors the
 * browser receipt generator in frontend/game.js.
 */
function generateTicketPublicCode(ticketId, timestamp) {
  let h1 = 0x811c9dc5;
  let h2 = 0x5bd1e995;
  const seed = String(ticketId || "TKT") + "-" + String(timestamp || "");

  for (let i = 0; i < seed.length; i += 1) {
    const c = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
  }

  const hex1 = (h1 >>> 0).toString(16).toUpperCase().padStart(8, "0");
  const hex2 = (h2 >>> 0).toString(16).toUpperCase().padStart(8, "0");
  return (`505685${hex1}${hex2}645A3D`).slice(0, 20);
}

function ticketPublicCode(ticket) {
  if (!ticket) return "";
  return String(
    ticket.public_code ||
    ticket.ticket_hash ||
    generateTicketPublicCode(ticket.ticket_id, ticket.placed_at || ticket.created_at || "")
  );
}

module.exports = {
  generateTicketPublicCode,
  ticketPublicCode,
};
