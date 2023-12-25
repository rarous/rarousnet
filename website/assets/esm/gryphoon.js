function groupByType(webmentions) {
  const byType = new Map();
  for (const post of webmentions) {
    const key = post["wm-property"];
    const values = byType.get(key) ?? [];
    values.push(post);
    byType.set(key, values);
  }
  return byType;
}

/**
 * @param {Element} section
 * @param {Array} items
 */
function itemsCounter(section, items) {
  const counter = section.querySelector("data");
  counter.value = items.length;
  counter.insertAdjacentText("beforeend", ` ${items.length}x`);
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

class WebMentions extends HTMLElement {
  constructor() {
    super();
  }

  set data(webmentions) {
    const likesOf = this.querySelector("#like-of");
    const repostsOf = this.querySelector("#repost-of");
    const template = this.querySelector("template");

    const byType = groupByType(webmentions);

    function itemTemplate(content, item, section) {
      const link = content.querySelector("a");
      link.href = item.url;
      link.title = item.author.name;
      link.classList.add(section.id);

      const time = content.querySelector("time");
      time.dateTime = item.published ?? item["wm-received"];

      const img = content.querySelector("img");
      img.alt = item.author.name;
      img.src = item.author.photo;
    }

    injectItems(likesOf, template, byType.get("like-of"), itemTemplate);
    injectItems(repostsOf, template, byType.get("repost-of"), itemTemplate);
  }
}

/**
 * @param {string} input
 */
async function getSha256(input) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function gravatarUrl(item) {
  const email = item.author?.email ?? item.author?.name ?? crypto.randomUUID();
  const normalized = email.trim().toLowerCase();
  const sha = await getSha256(normalized);
  return `https://gravatar.com/avatar/${sha}?d=identicon`;
}

class Comments extends HTMLElement {
  constructor() {
    super();
  }

  set data(comments) {
    if (!comments?.length) return;
    const template = this.querySelector("template");
    const section = this.querySelector("section");

    async function itemTemplate(content, item, section) {
      const date = new Date(item.created);

      const entry = content.querySelector(".h-entry");
      entry.id = `komentar-${date.valueOf()}`;
      const permalink = entry.querySelector(".u-url[rel=bookmark]");
      permalink.href = "#" + entry.id;

      const img = entry.querySelector(".u-photo");
      img.src = await gravatarUrl(item);
      img.alt = item.author.name;

      const name = entry.querySelector(".p-name");
      if (item.author.web) {
        const link = document.createElement("a");
        link.href = item.author.web;
        link.rel = "nofollow";
        link.textContent = item.author.name;
        name.insertAdjacentElement("beforeend", link);
      } else {
        name.textContent = item.author.name;
      }

      const website = entry.querySelector(".p-author .u-url");
      website.href = item.author.web;

      const cnt = entry.querySelector(".e-content");
      cnt.innerHTML = item.text;

      const published = entry.querySelector(".dt-published");
      published.datetime = item.created;
      published.textContent = `${date.toLocaleDateString("cs")} v ${date.toLocaleTimeString("cs")}`;
    }

    injectItems(section, template, comments, itemTemplate);
  }
}

class Weblog extends HTMLElement {
  constructor() {
    super();
  }

  async connectedCallback() {
    const commentsComp = this.querySelector("gryphoon-comments");
    const webMentionsComp = this.querySelector("gryphoon-webmentions");

    const apiEndpoint = this.getAttribute("api-endpoint") ?? "/api/v1/weblog";
    const url = this.getAttribute("href") ?? location.href;
    const resp = await fetch(`${apiEndpoint}?${new URLSearchParams({ url })}`);
    if (!resp.ok) {
      return this.remove();
    }
    const { comments, webmentions } = await resp.json();
    if (!comments?.length && !webmentions?.length) {
      return this.remove();
    }

    if (commentsComp && !comments?.length) {
      commentsComp.remove();
    }
    if (webMentionsComp && !webmentions?.length) {
      webMentionsComp.remove();
    }

    if (commentsComp) commentsComp.data = comments;
    if (webMentionsComp) webMentionsComp.data = webmentions;
  }
}

customElements.define("gryphoon-comments", Comments);
customElements.define("gryphoon-webmentions", WebMentions);
customElements.define("gryphoon-weblog", Weblog);
