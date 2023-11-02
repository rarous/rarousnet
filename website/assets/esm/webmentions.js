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
 * @param {Node} itemTemplate
 * @param {*} item
 * @param {Element} section
 */
function webmentionLink(itemTemplate, item, section) {
  console.log(itemTemplate);
  const link = itemTemplate.querySelector("a");
  console.log(link);
  link.href = item.url;
  link.title = item.author.name;
  link.classList.add(section.id);
}

/**
 * @param {Node} itemTemplate
 * @param {*} item
 */
function webmentionDate(itemTemplate, item) {
  const date = itemTemplate.querySelector("date");
  date.dateTime = item.published;
}

/**
 * @param {Node} itemTemplate
 * @param {*} item
 */
function webmentionAvatar(itemTemplate, item) {
  const img = itemTemplate.querySelector("img");
  img.alt = item.author.name;
  img.src = item.author.photo;
}

/**
 * @param {Element} section
 * @param {Array} items
 */
function webmentionsCounter(section, items) {
  const counter = section.querySelector("data");
  counter.value = items.length;
  counter.insertAdjacentText("beforeend", ` ${items.length}x`);
}

/**
 * @param {Element} section
 * @param {DocumentFragment} template
 * @param {Array} items
 */
function injectItems(section, template, items) {
  if (!items?.length) {
    return section.remove();
  }
  webmentionsCounter(section, items);
  const list = section.querySelector(".items");
  const listItems = document.createDocumentFragment();
  for (const item of items) {
    const itemTemplate = template.cloneNode(true).content;
    webmentionLink(itemTemplate, item, section);
    webmentionDate(itemTemplate, item);
    webmentionAvatar(itemTemplate, item);
    listItems.appendChild(itemTemplate);
  }
  list.replaceChildren(listItems);
}

class WebMentions extends HTMLElement {
  async connectedCallback() {
    const likesOf = this.querySelector("#like-of");
    const repostsOf = this.querySelector("#repost-of");
    const template = this.querySelector("template");
    const apiEndpoint = this.getAttribute("api-endpoint") ?? "/api/v1/weblog";
    const url = this.getAttribute("href") ?? location.href;
    const resp = await fetch(`${apiEndpoint}?${new URLSearchParams({ url })}`);
    if (!resp.ok) {
      this.remove();
      return;
    }
    const { webmentions } = await resp.json();
    if (!webmentions.length) {
      this.remove();
    }
    const byType = groupByType(webmentions);
    injectItems(likesOf, template, byType.get("like-of"));
    injectItems(repostsOf, template, byType.get("repost-of"));
  }
}

customElements.define("rarous-webmentions", WebMentions);
