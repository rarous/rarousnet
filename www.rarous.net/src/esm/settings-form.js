/**
 * @param {HTMLElement} root
 * @param {IterableIterator<[key: string, value: string]>} data
 */
function updateSettings(root, data) {
  for (const [key, value] of data) {
    root.dataset[key] = value;
  }
}

/**
 * @param {HTMLFormElement} form
 * @param {IterableIterator<[key: string, value: string]>} data
 */
function updateForm(form, data) {
  for (const [key, value] of data) {
    form[key].value = value;
  }
}

/**
 * This component stores user preferences in `localStorage`
 * and applies them when changed or when user comes back.
 * Preferences are applied as data attributes on the root element.
 * You can then use them in CSS or scripts.
 *
 * This component is progressive enhancement wrapper
 * and expects a form element with associated inputs inside.
 *
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
        updateSettings(root, data);
        localStorage.setItem("settings", JSON.stringify(Object.fromEntries(data)));
      });

      const settings = Object.entries(JSON.parse(localStorage.getItem("settings") ?? "{}"));
      updateSettings(root, settings);
      updateForm(form, settings);
    }
  }

  return SettingsForm;
}

if (globalThis.window?.customElements) {
  defSettingsForm(window).register();
}
