import { processTypo } from "@hckr_/blendid/lib/texy.mjs";

/**
 * @param {Window} globalScope
 * @return {typeof ArticlesFeed}
 */
export function defArticlesFeed({ HTMLElement, customElements }) {
  class ArticlesFeed extends HTMLElement {
    #itemTemplate;

    static register(tagName = "articles-feed") {
      this.tagName = tagName;
      customElements.define(tagName, this);
    }

    get endpoint() {
      return this.getAttribute("endpoint") ?? "https://www.rarous.net/api/v1/w3b/";
    }

    get lang() {
      return this.getAttribute("lang") ?? this.ownerDocument.documentElement.lang ?? "cs";
    }

    get loaded() {
      return this.hasAttribute("loaded");
    }

    set loaded(isLoaded) {
      this.toggleAttribute("loaded", Boolean(isLoaded));
    }

    set data(data) {
      if (!this.loaded) {
        this.appendChild(this.renderFeed(data));
        this.loaded = true;
      }
    }

    async loadDataFromApi(url) {
      if (this.loaded) return;
      const resp = await fetch(url ?? this.endpoint, {
        headers: { Accept: "application/json" },
      });
      this.data = await resp.json();
    }

    connectedCallback() {
      this.setAttribute("role", "feed");
      this.#itemTemplate = this.querySelector("template");
      this.addEventListener("click", e => {
        if (e.target.classList.contains("u-url")) {
          this.sendClickBeacon(e.target);
        }
      });
    }

    sendClickBeacon({ href }) {
      const params = new URLSearchParams({ url: href, event: "clicks" });
      navigator.sendBeacon("https://www.rarous.net/api/v1/w3b/beacon", params);
    }

    renderFeed(data) {
      const formatter = new Intl.DateTimeFormat(this.lang, { day: "numeric", month: "long", year: "numeric" });
      const items = this.ownerDocument.createDocumentFragment();
      for (const { entry } of data) {
        items.appendChild(this.renderItem(entry, formatter));
      }
      return items;
    }

    /**
     * @param {*} entry
     * @param {Intl.DateTimeFormat} formatter
     */
    renderItem(entry, formatter) {
      const item = this.#itemTemplate.content.cloneNode(true);

      const a = item.querySelector("a");
      a.href = entry.link;
      a.textContent = processTypo(entry.title);

      const published = item.querySelector(".dt-published");
      published.datetime = entry.published;
      published.textContent = formatter.format(new Date(entry.published));

      const hostname = item.querySelector("code");
      hostname.textContent = entry.hostname;

      return item;
    }
  }

  return ArticlesFeed;
}

if (globalThis.window?.customElements) {
  defArticlesFeed(window).register();
}
