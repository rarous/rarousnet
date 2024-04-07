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

function transform(el, transformations) {
  for (const [selector, props] of Object.entries(transformations)) {
    const target = el.querySelector(selector);
    if (typeof props === "function") {
      props(target);
      continue;
    }
    for (const [key, val] of Object.entries(props)) {
      if (typeof val === "function") val(target[key]);
      else target[key] = val;
    }
  }
}

/**
 * @param {Element} section
 * @param {Array} items
 */
function itemsCounter(section, items) {
  transform(section, {
    "data": {
      value: items.length,
      textContent: `${items.length}x`,
    },
  });
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
  if (!template) return;

  const list = section.querySelector(".items");
  const listItems = document.createDocumentFragment();
  for (const item of items) {
    const { content } = template.cloneNode(true);
    applyTemplate(content, item, section);
    listItems.appendChild(content);
  }
  list.replaceChildren(listItems);
}

export function defWebMentions({ HTMLElement, customElements }) {
  class WebMentions extends HTMLElement {
    constructor() {
      super();
    }

    static register(tagName = "gryphoon-webmentions") {
      this.tagName = tagName;
      customElements.define(tagName, this);
    }

    set data(webmentions) {
      // TODO: inject selectors via attributes
      const likesOf = this.querySelector("#like-of");
      const repostsOf = this.querySelector("#repost-of");
      const template = this.querySelector("template");

      const byType = groupByType(webmentions);

      function itemTemplate(content, item, section) {
        transform(content, {
          "a": {
            href: item.url,
            title: item.author.name,
            classList: (x) => x.add(section.id),
          },
          "time": { dateTime: item.published ?? item["wm-received"] },
          "img": {
            alt: item.author.name,
            src: item.author.photo,
          },
        });
      }

      injectItems(likesOf, template, byType.get("like-of"), itemTemplate);
      injectItems(repostsOf, template, byType.get("repost-of"), itemTemplate);
    }
  }

  return WebMentions;
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

export function defComments({ HTMLElement, customElements }) {
  class Comments extends HTMLElement {
    constructor() {
      super();
    }

    static register(tagName = "gryphoon-comments") {
      this.tagName = tagName;
      customElements.define(tagName, this);
    }

    set data(comments) {
      if (!comments?.length) return;
      // TODO: inject selectors via attributes
      const template = this.querySelector("template");
      const section = this.querySelector("#comments");

      async function itemTemplate(content, item, section) {
        const date = new Date(item.created);

        const entry = content.querySelector(".h-entry");
        entry.id += date.valueOf();

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

        transform(entry, {
          ".u-url[rel=bookmark]": { href: `#${entry.id}` },
          ".u-photo": {
            src: await gravatarUrl(item),
            alt: item.author.name,
          },
          ".p-author .u-url": { href: item.author.web },
          ".e-content": { innerHTML: item.text },
          ".dt-published": {
            datetime: item.created,
            textContent: `${date.toLocaleDateString("cs")} v ${date.toLocaleTimeString("cs")}`,
          },
        });
      }

      injectItems(section, template, comments, itemTemplate);
    }
  }

  return Comments;
}

export function defWeblog({ HTMLElement, customElements }, { Comments, WebMentions }) {
  class Weblog extends HTMLElement {
    constructor() {
      super();
    }

    static register(tagName = "gryphoon-weblog") {
      this.tagName = tagName;
      WebMentions.register();
      Comments.register();
      customElements.define(tagName, this);
    }

    async connectedCallback() {
      const commentsComp = this.querySelector(Comments.tagName);
      const webMentionsComp = this.querySelector(WebMentions.tagName);

      // TODO: bypass auto-fetch when already hydrated

      const apiEndpoint = this.getAttribute("api-endpoint") ?? "/api/v1/weblog";
      const url = this.getAttribute("href") ?? location.href;
      const resp = await fetch(`${apiEndpoint}?${new URLSearchParams({ url })}`);

      const { comments, webmentions } = await resp.json();

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

  return Weblog;
}

// autoregister components when in browser env with customELements support
if (window?.customElements) {
  const Comments = defComments(window);
  const WebMentions = defWebMentions(window);
  defWeblog(window, { Comments, WebMentions }).register();
}
