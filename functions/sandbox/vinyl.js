import { parseHTML } from "linkedom/worker";

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
  const resp = await env.ASSETS.fetch("https://www.rarous.net/kolekce/vinyly.html");
  const html = await resp.text();
  const { document, customElements, HTMLElement } = parseHTML(html);

  class Discogs extends HTMLElement {
    constructor() {
      super();
    }

    set data(albums) {
      if (!albums?.length) return;

      const template = this.querySelector("template");
      const collection = this.querySelector("section");

      function itemTemplate(content, item) {
        const link = content.querySelector("a");
        link.href = link.href + item.id;

        const img = content.querySelector("img");
        img.src = `https://res.cloudinary.com/rarous/image/fetch/dpr_auto,f_auto/${item.image}`;
        img.alt = `Obal desky ${item.artist.name} - ${item.title} (${item.year})`;

        const name = content.querySelector("[property=name]");
        name.textContent = item.title;

        const byArtist = content.querySelector("[property=byArtist]");
        byArtist.textContent = item.artist.name;

        const copyrightYear = content.querySelector("[property=copyrightYear]");
        copyrightYear.textContent = item.year;

        const button = content.querySelector("button");
        if (!item.spotifyUri) {
          button.remove();
        } else {
          button.dataset.spotifyUri = item.spotifyUri;
        }
      }

      injectItems(collection, template, albums, itemTemplate);
    }
  }

  customElements.define("rarous-discogs", Discogs);
  const discogs = document.querySelector("rarous-discogs");
  discogs.data = await env.weblog.get("/kolekce/vinyly", "json");
  return new Response(document.toString(), {
    headers: {
      "content-type": "text/html",
    },
  });
}
