/**
 * @param {Element} section
 * @param {Number} itemsLength
 */
function itemsCounter(section, itemsLength) {
  const counter = section.querySelector("data");
  counter.value = itemsLength;
  counter.textContent = itemsLength;
  return counter;
}

/**
 * @param {Element} section
 * @param {Element} template
 * @param {Array} items
 * @param {Function} applyTemplate
 */
function injectItems(section, template, items, applyTemplate) {
  if (!items?.length) return section.remove();

  itemsCounter(section, items.length);
  const list = section.querySelector(".items");
  const listItems = section.ownerDocument.createDocumentFragment();
  for (const [index, item] of items.entries()) {
    const { content } = template.cloneNode(true);
    applyTemplate(content, item, section, index);
    listItems.appendChild(content);
  }
  list.replaceChildren(listItems);
}

/**
 * @param {Window} window
 * @return {typeof Discogs}
 */
export function defDiscogs({ HTMLElement, customElements }) {
  class Discogs extends HTMLElement {

    static register(tagName = "rarous-discogs") {
      this.tagName = tagName;
      customElements.define(tagName, this);
    }

    get endpoint() {
      return this.getAttribute("api-endpoint") ?? "/api/v1/collections/vinyls";
    }

    get loaded() {
      return this.hasAttribute("loaded");
    }

    set loaded(isLoaded) {
      if (isLoaded) {
        this.setAttribute("loaded", "");
      }
      else {
        this.removeAttribute("loaded");
      }
    }

    set data(albums) {
      if (!albums?.length) return;
      this.loaded = true;

      const template = this.querySelector("template");
      const collection = this.querySelector("section");

      function itemTemplate(content, item, section, index) {
        const link = content.querySelector("a");
        link.href = link.href + item.id;

        const img = content.querySelector("img");
        img.src += item.image;
        img.alt += ` ${item.artist.name} - ${item.title} (${item.year})`;
        // TODO: chose value depending on media query
        if (index < 1) img.removeAttribute("loading");

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
      if (this.loaded) return;
      const resp = await fetch(url ?? this.endpoint, {
        headers: { "Accept": "application/json" },
      });
      this.data = await resp.json();
    }
  }

  return Discogs;
}

// auto-register component when in browser env with customElements support
if (globalThis.window?.customElements) {
  defDiscogs(window).register();
}
