import { processTypo } from "@hckr_/blendid/lib/texy.mjs";
import { comp, drop, iterator, take } from "@thi.ng/transducers";

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
      return this.getAttribute("endpoint");
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
      if (this.loaded) return;
      this.appendChild(this.renderFeed(data));
      this.loaded = true;
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
      navigator.sendBeacon(this.endpoint + "beacon", params);
    }

    get pageIndex() {
      const val = this.dataset.pageIndex ?? "0";
      return Number.parseInt(val, 10);
    }

    get pageSize() {
      const val = this.dataset.pageSize ?? "0";
      return Number.parseInt(val, 10);
    }

    filterData(data) {
      const tag = this.dataset.tag;
      if (tag) {
        const byTag = new Map();
        for (const { entry, stats } of data) {
          const tags = entry.tags?.split(",")?.map(x => x.trim().toLowerCase()) ?? [];
          for (const tag of tags) {
            const items = byTag.get(tag) ?? [];
            items.push({ entry, stats });
            byTag.set(tag, items);
          }
        }
        data = byTag.get(tag);
      }

      const sortKey = this.dataset.sortBy ?? "published";
      const sortDirection = this.dataset.sortDir ?? "desc";
      const dir = sortDirection === "desc" ? -1 : 1;
      const filteredData = data.sort((a, b) => dir * a.entry[sortKey].localeCompare(b.entry[sortKey]));
      if (!this.pageSize) return filteredData;
      return iterator(
        comp(
          drop(this.pageIndex * this.pageSize),
          take(this.pageSize)
        ),
        filteredData
      );
    }

    renderFeed(data) {
      const formatter = new Intl.DateTimeFormat(this.lang, { day: "numeric", month: "long", year: "numeric" });
      const items = this.ownerDocument.createDocumentFragment();
      for (const { entry } of this.filterData(data)) {
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
      const locale = (entry.lang || this.lang).split("-").at(0);
      const article = item.querySelector("article");

      if (entry.rating) {
        article.dataset.rating = entry.rating;
      }
      if (entry.lang) {
        article.lang = entry.lang;
      }

      const a = item.querySelector("[itemprop=url]");
      a.href = entry.link ?? entry.url;
      a.textContent = processTypo(entry.title, { locale });

      const published = item.querySelector("[itemprop=published]");
      if (published) {
        published.datetime = entry.published;
        published.textContent = formatter.format(new Date(entry.published));
      }

      const author = item.querySelector("[itemprop=author] [itemprop=name]");
      if (author) {
        if (entry.author) {
          author.textContent = entry.author;
        } else {
          author.remove();
        }
      }

      const description = item.querySelector("[itemprop=abstract]");
      if (description) {
        if (entry.description) {
          description.textContent = processTypo(entry.description, {locale});
        } else {
          description.remove();
        }
      }

      const hostname = item.querySelector("code");
      if (hostname) {
        hostname.textContent = entry.hostname;
      }

      const image = item.querySelector("img");
      if (image) {
        if (entry.image) {
          image.src += entry.image;
        } else {
          image.remove();
        }
      }

      const tags = item.querySelector(".tags");
      if (tags && entry.tags) {
        const ul = tags.querySelector("ul");
        const li = tags.querySelector("li");
        const items = this.ownerDocument.createDocumentFragment();
        for (const tag of entry.tags.split(",")) {
          const item = li.cloneNode(true);
          const link = item.querySelector("a");
          link.textContent = tag.trim();
          link.href += encodeURIComponent(tag.trim().toLowerCase());
          items.appendChild(item);
        }
        ul.replaceChildren(items);
      }

      return item;
    }
  }

  return ArticlesFeed;
}

if (globalThis.window?.customElements) {
  defArticlesFeed(window).register();
}
