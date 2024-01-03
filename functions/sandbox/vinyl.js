import { HTMLElement, parseHTML } from "linkedom/worker";

/**
 * @typedef {import("../env.d.ts").Env} Env
 */

/**
 * @param {Element} section
 * @param {Array} items
 */
function itemsCounter(section, items) {
  const counter = section.querySelector("data");
  counter.value = items.length;
  counter.textContent = items.length;
  return counter;
}

/**
 * @param {Element} section
 * @param {Element} template
 * @param {Array} items
 * @param {Function} applyTemplate
 */
function injectItems(section, template, items, applyTemplate) {
  if (!items?.length) {
    return section.remove();
  }
  itemsCounter(section, items);
  const list = section.querySelector(".items");
  const listItems = document.createDocumentFragment();
  for (const item of items) {
    const { content } = template.cloneNode(true);
    applyTemplate(content, item, section);
    listItems.appendChild(content);
  }
  list.replaceChildren(listItems);
}

/**
 * @param {EventContext<Env>} context
 */
export async function onRequestGet({ env }) {
  const resp = await env.ASSETS.fetch("https://www.rarous.net/kolekce/vinyly");
  const html = await resp.text();
  const window = parseHTML(html);
  console.log(window);
  globalThis.HTMLElement = HTMLElement;
  const { Discogs } = await import("../../website/assets/esm/discogs.js");
  customElements.define("rarous-discogs", Discogs);
  const document = window.document;
  const discogs = document.querySelector("rarous-discogs");
  discogs.data = await env.weblog.get("/kolekce/vinyly", "json");
  return new Response(document.toString(), resp);
}
