let meCardTags = new Map([
  ["email", "EMAIL"],
  ["name", "N"],
  ["phone", "TEL"],
  ["web", "URL"]
]);

/**
 *
 * @param card
 * @returns {string}
 */
function meCard(card) {
  const builder = ["MECARD:"];
  for (const [key, value] of Object.entries(card)) {
    builder.push(`${meCardTags.get(key) ?? "key"}:${value}`);
  }
  builder.push(";");
  return builder.join(";");
}

export default {
  currentYear: new Date().getFullYear(),
  contact: {
    name: "Roubíček,Aleš",
    phone: "+420737461283",
    email: "ales@roubicek.name",
    web: "https://www.rarous.net/"
  },
  meCard
}
