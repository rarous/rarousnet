let meCardTags = new Map([
  ["email", "EMAIL"],
  ["name", "N"],
  ["nickname", "NICKNAME"],
  ["note", "NOTE"],
  ["phone", "TEL"],
  ["web", "URL"],
  ["address", "ADR"],
  ["birthday", "BDAY"],
  ["sound", "SOUND"],
  ["videophone", "TEL-AV"]
]);

function formatAddress(contact) {
  if (contact.address) return contact.address;
  return [
    contact.POBox,
    contact.roomNumber,
    contact.houseNumber,
    contact.city,
    contact.prefecture,
    contact.postCode,
    contact.country
  ].map(x => x ?? "").join(",");
}

function formatName(contact) {
  if (contact.name) return contact.name;
  if  (!(contact.lastName || contact.firstName)) return undefined;
  return `${contact.lastName},${contact.firstName}`;
}

function formatBirthday(contact) {
  if (contact.birthday instanceof Date && !isNaN(contact.birthday)) {
    return contact.birthday.toISOString().substring(0, 10).replaceAll("-", "");
  }
  return contact.birthday;
}

function normalizeTags(contact) {
  return {
    name: formatName(contact),
    nickname: contact.nickname,
    email: contact.email,
    phone: contact.phone,
    web: contact.web,
    address: formatAddress(contact),
    birthday: formatBirthday(contact),
    note: contact.note,
  }
}

/**
 *
 * @param contact
 * @returns {string}
 */
function meCard(contact) {
  const builder = ["MECARD:"];
  for (const [key, value] of Object.entries(normalizeTags(contact))) {
    if (!value) continue;
    builder.push(`${meCardTags.get(key) ?? "key"}:${value}`);
  }
  builder.push(";");
  return builder.join(";");
}

function searchParams(obj) {
  return new URLSearchParams(obj).toString();
}

export default {
  currentYear: new Date().getFullYear(),
  contact: {
    name: "Roubíček,Aleš",
    phone: "+420737461283",
    email: "ales@roubicek.name",
    web: "https://www.rarous.net/"
  },
  meCard,
  searchParams
}
