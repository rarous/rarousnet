import { processTypo } from "@hckr_/blendid/lib/texy.mjs";

/**
 *
 * @param {Window} globalScope
 * @returns {typeof TexyTypography}
 */
export function defTexyTypography({ HTMLElement, customElements, document }) {
  class TexyTypography extends HTMLElement {
    static register(tagName = "texy-typo") {
      this.tagName = tagName;
      customElements.define(tagName, this);
    }

    get lang() {
      return this.getAttribute("lang") ?? document?.documentElement?.lang ?? "cs";
    }

    connectedCallback() {
      const text = this.textContent;
      const locale = this.lang;
      this.innerText = processTypo(text, { locale });
    }
  }

  return TexyTypography;
}

if (globalThis.window?.customElements) {
  defTexyTypography(window).register();
}
