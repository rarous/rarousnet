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
 * @param {HTMLTemplateElement} template
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
  const listItems = section.ownerDocument.createDocumentFragment();
  for (const item of items) {
    const content = template.content.cloneNode(true);
    applyTemplate(content, item, section);
    listItems.appendChild(content);
  }
  list.replaceChildren(listItems);
}

/**
 *
 * @param {Window} window
 * @returns {typeof WebMentions}
 */
export function defWebMentions({ HTMLElement, customElements }) {
  class WebMentions extends HTMLElement {

    static register(tagName = "gryphoon-webmentions") {
      this.tagName = tagName;
      customElements.define(tagName, this);
    }

    set data(webmentions) {
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

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b,
  0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7,
  0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152,
  0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
  0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
  0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

function hashBlocks(w, v, p) {
  let a, b, c, d, e, f, g, h, u, i, j, t1, t2;

  let position = 0;
  let { length } = p;

  while (length >= 64) {
    a = v[0];
    b = v[1];
    c = v[2];
    d = v[3];
    e = v[4];
    f = v[5];
    g = v[6];
    h = v[7];

    for (i = 0; i < 16; i++) {
      j = position + i * 4;
      w[i] = (((p[j] & 0xff) << 24) | ((p[j + 1] & 0xff) << 16) | ((p[j + 2] & 0xff) << 8) | (p[j + 3] & 0xff));
    }

    for (i = 16; i < 64; i++) {
      u = w[i - 2];
      t1 = (u >>> 17 | u << (32 - 17)) ^ (u >>> 19 | u << (32 - 19)) ^ (u >>> 10);

      u = w[i - 15];
      t2 = (u >>> 7 | u << (32 - 7)) ^ (u >>> 18 | u << (32 - 18)) ^ (u >>> 3);

      w[i] = (t1 + w[i - 7] | 0) + (t2 + w[i - 16] | 0);
    }

    for (i = 0; i < 64; i++) {
      t1 = (((((e >>> 6 | e << (32 - 6)) ^ (e >>> 11 | e << (32 - 11)) ^ (e >>> 25 | e << (32 - 25))) + ((e & f) ^ (~e & g))) | 0) + ((h + ((K[i] + w[i]) | 0)) | 0)) | 0;
      t2 = (((a >>> 2 | a << (32 - 2)) ^ (a >>> 13 | a << (32 - 13)) ^ (a >>> 22 | a << (32 - 22))) + ((a & b) ^ (a & c) ^ (b & c))) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }

    v[0] += a;
    v[1] += b;
    v[2] += c;
    v[3] += d;
    v[4] += e;
    v[5] += f;
    v[6] += g;
    v[7] += h;

    position += 64;
    length -= 64;
  }
}

function buildPadding(data) {
  const dataLength = data.length;
  const trailerLength = (dataLength % 64);

  const paddingLength = (dataLength % 64 < 56) ? 64 : 128;
  const padding = new Uint8Array(paddingLength);

  const bitLenHi = (dataLength / 0x20000000) | 0;
  const bitLenLo = (dataLength << 3);

  padding.set(data.subarray(dataLength - trailerLength));

  padding[trailerLength] = 0x80;

  padding[paddingLength - 8] = (bitLenHi >>> 24) & 0xff;
  padding[paddingLength - 7] = (bitLenHi >>> 16) & 0xff;
  padding[paddingLength - 6] = (bitLenHi >>> 8) & 0xff;
  padding[paddingLength - 5] = (bitLenHi >>> 0) & 0xff;
  padding[paddingLength - 4] = (bitLenLo >>> 24) & 0xff;
  padding[paddingLength - 3] = (bitLenLo >>> 16) & 0xff;
  padding[paddingLength - 2] = (bitLenLo >>> 8) & 0xff;
  padding[paddingLength - 1] = (bitLenLo >>> 0) & 0xff;

  return padding;
}

function sha256(buffer) {
  const state = new Int32Array(8);
  const temp = new Int32Array(64);

  state[0] = 0x6a09e667;
  state[1] = 0xbb67ae85;
  state[2] = 0x3c6ef372;
  state[3] = 0xa54ff53a;
  state[4] = 0x510e527f;
  state[5] = 0x9b05688c;
  state[6] = 0x1f83d9ab;
  state[7] = 0x5be0cd19;

  const data = new Uint8Array(buffer);
  const padding = buildPadding(data);

  hashBlocks(temp, state, data);
  hashBlocks(temp, state, padding);

  const output = new Uint8Array(32);

  for (let i = 0; i < 8; i++) {
    output[i * 4 + 0] = (state[i] >>> 24) & 0xff;
    output[i * 4 + 1] = (state[i] >>> 16) & 0xff;
    output[i * 4 + 2] = (state[i] >>> 8) & 0xff;
    output[i * 4 + 3] = (state[i] >>> 0) & 0xff;
  }

  return output.buffer;
}

/**
 * @param {string} input
 */
function getSha256(input) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = sha256(data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((x) => x.toString(16).padStart(2, "0")).join("");
}

function gravatarUrl(item) {
  const email = item.author?.email ?? item.author?.name ?? crypto.randomUUID();
  const normalized = email.trim().toLowerCase();
  const sha = getSha256(normalized);
  return `https://gravatar.com/avatar/${sha}?d=identicon`;
}

/**
 *
 * @param {Window} window
 * @returns {typeof Comments}
 */
export function defComments({ HTMLElement, customElements, document }) {
  class Comments extends HTMLElement {

    static register(tagName = "gryphoon-comments") {
      this.tagName = tagName;
      customElements.define(tagName, this);
    }

    get lang() {
      return this.getAttribute("lang") ?? document.documentElement.lang ?? "cs"
    }

    /**
     * @param {Array} comments
     */
    set data(comments) {
      if (!comments?.length) return;

      const template = this.querySelector("template");
      const section = this.querySelector("#comments");
      const locale = this.lang;

      function itemTemplate(content, item, section) {
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
            src: gravatarUrl(item),
            alt: item.author.name,
          },
          ".p-author .u-url": { href: item.author.web },
          ".e-content": { innerHTML: item.text },
          ".dt-published": {
            datetime: item.created,
            textContent: `${date.toLocaleDateString(locale)} v ${date.toLocaleTimeString(locale)}`,
          },
        });
      }

      injectItems(section, template, comments, itemTemplate);
    }
  }

  return Comments;
}

/**
 *
 * @param {Window} window
 * @param {Object} dependencies
 * @param {typeof Comments} dependencies.Comments
 * @param {typeof WebMentions} dependencies.WebMentions
 * @returns {typeof Weblog}
 */
export function defWeblog({ HTMLElement, customElements, location }, { Comments, WebMentions }) {
  class Weblog extends HTMLElement {

    static register(tagName = "gryphoon-weblog") {
      this.tagName = tagName;
      WebMentions.register();
      Comments.register();
      customElements.define(tagName, this);
    }

    get apiEndpoint() {
      return this.getAttribute("api-endpoint") ?? "/api/v1/weblog";
    }

    get url() {
      return this.getAttribute("href") ?? location.href;
    }

    get loaded() {
      return this.hasAttribute("loaded");
    }

    set loaded(isLoaded) {
      if (isLoaded) {
        this.setAttribute("loaded", "");
      } else {
        this.removeAttribute("loaded");
      }
    }

    async connectedCallback() {
      const commentsComp = this.querySelector(Comments.tagName);
      const webMentionsComp = this.querySelector(WebMentions.tagName);

      if (this.loaded) return;

      const params = new URLSearchParams({ url: this.url });
      const resp = await fetch(`${this.apiEndpoint}?${params}`);
      const { comments, webmentions } = await resp.json();

      if (commentsComp && !comments?.length) commentsComp.remove();
      if (commentsComp) commentsComp.data = comments;

      if (webMentionsComp && !webmentions?.length) webMentionsComp.remove();
      if (webMentionsComp) webMentionsComp.data = webmentions;

      this.loaded = true;
    }
  }

  return Weblog;
}

// auto-register components when in browser env with customElements support
if (globalThis.window?.customElements) {
  const Comments = defComments(window);
  const WebMentions = defWebMentions(window);
  defWeblog(window, { Comments, WebMentions }).register();
}
