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
  const listItems = section.ownerDocument.createDocumentFragment();
  for (const item of items) {
    const { content } = template.cloneNode(true);
    applyTemplate(content, item, section);
    listItems.appendChild(content);
  }
  list.replaceChildren(listItems);
}

/**
 * @param {Window} window
 */
export function defDiscogs({ HTMLElement, customElements }) {
  class Discogs extends HTMLElement {
    constructor() {
      super();
    }

    static register(tagName = "rarous-discogs") {
      customElements.define(tagName, this);
    }

    set data(albums) {
      if (!albums?.length) return;
      this.setAttribute("loaded", "");

      const template = this.querySelector("template");
      const collection = this.querySelector("section");

      function itemTemplate(content, item) {
        const link = content.querySelector("a");
        link.href = link.href + item.id;

        const img = content.querySelector("img");
        img.src += item.image;
        img.alt += ` ${item.artist.name} - ${item.title} (${item.year})`;

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

    async loadDataFromApi(url) {
      if (this.getAttribute("loaded")) return;
      const endpoint = url ?? this.getAttribute("api-endpoint") ?? "/api/v1/collections/vinyls";
      const resp = await fetch(endpoint, {
        headers: {"Accept": "application/json"}
      });
      this.data = await resp.json();
    }
  }
  return Discogs;
}
