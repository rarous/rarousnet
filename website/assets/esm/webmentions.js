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
 * @param {Element} itemTemplate
 * @param {*} item
 * @param {Element} section
 * @return {Element}
 */
function webmentionLink(itemTemplate, item, section) {
  const link = itemTemplate.querySelector("a");
  link.href = item.url;
  link.title = item.author.name;
  link.classList.add(section.id);
  return link;
}

/**
 * @param {Element} itemTemplate
 * @param {*} item
 * @return {Element}
 */
function webmentionDate(itemTemplate, item) {
  const date = itemTemplate.querySelector("time");
  date.dateTime = item.published;
  return date;
}

/**
 * @param {Element} itemTemplate
 * @param {*} item
 * @return {Element}
 */
function webmentionAvatar(itemTemplate, item) {
  const img = itemTemplate.querySelector("img");
  img.alt = item.author.name;
  img.src = item.author.photo;
  return img;
}

/**
 * @param {Element} section
 * @param {Array} items
 */
function webmentionsCounter(section, items) {
  const counter = section.querySelector("data");
  counter.value = items.length;
  counter.insertAdjacentText("beforeend", ` ${items.length}x`);
  return counter;
}

/**
 * @param {Element} section
 * @param {Element} template
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
    const { content } = template.cloneNode(true);
    webmentionLink(content, item, section);
    webmentionDate(content, item);
    webmentionAvatar(content, item);
    listItems.appendChild(content);
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
      return this.remove();
    }
    const { webmentions } = await resp.json();
    if (!webmentions.length) {
      return this.remove();
    }
    const byType = groupByType(webmentions);
    injectItems(likesOf, template, byType.get("like-of"));
    injectItems(repostsOf, template, byType.get("repost-of"));
  }
}

customElements.define("rarous-webmentions", WebMentions);
