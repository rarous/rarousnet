/**
 * @param {Window} globalScope
 * @return {typeof SettingsForm}
 */
export function defSettingsForm({ HTMLElement, customElements, document }) {
  class SettingsForm extends HTMLElement {
    static register(tagName = "settings-form") {
      this.tagName = tagName;
      customElements.define(tagName, this);
    }

    connectedCallback() {
      const root = document.documentElement;
      const form = this.querySelector("form");
      form.addEventListener("submit", e => {
        const data = new FormData(e.target);
        for (const [key, value] of data) {
          console.log([key, value]);
          root.dataset[key] = value;
        }
        localStorage.setItem("settings", JSON.stringify(Object.fromEntries(data)));
      });

      const settings = JSON.parse(localStorage.getItem("settings") ?? "{}");
      for (const [key, value] of Object.entries(settings)) {
        root.dataset[key] = value;
      }
    }
  }

  return SettingsForm;
}

if (globalThis.window?.customElements) {
  defSettingsForm(window).register();
}
