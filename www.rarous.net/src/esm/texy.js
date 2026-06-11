import { processTypo } from "@gryphoon/texy";

export { processTypo };

/**
 *
 * @param {Window} globalScope
 * @returns {typeof TexyTypography}
 */
export function defTexyTypography({ HTMLElement, customElements }) {
  class TexyTypography extends HTMLElement {
    static register(tagName = "texy-typo") {
      this.tagName = tagName;
      customElements.define(tagName, this);
    }

    get lang() {
      return this.getAttribute("lang") ?? this.ownerDocument?.documentElement?.lang ?? "cs";
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
