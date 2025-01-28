/**
 * @param {Window} globalScope
 * @return {typeof FeedPagination}
 */
export function defFeedPagination({ HTMLElement, customElements }) {
  class FeedPagination extends HTMLElement {
    static register(tagName = "feed-pagination") {
      this.tagName = tagName;
      customElements.define(tagName, this);
    }

    static get observedAttributes() {
      return ["data-items-count", "data-current-page"];
    }

    connectedCallback() {
      this.firstLink = this.querySelector(".first");
      this.lastLink = this.querySelector(".last");
      this.nextLink = this.querySelector(".next");
      this.prevLink = this.querySelector(".prev");
      this.updatePaginationLinks();
    }

    attributeChangedCallback() {
      this.updatePaginationLinks();
    }

    updatePaginationLinks() {
      const { pageSize, itemsCount, currentPage } = this.dataset;
      if (!(itemsCount || currentPage)) return;
      const totalPages = Math.ceil(itemsCount / pageSize);
      const pageIndex = Number.parseInt(currentPage, 10);
      const lastPage = totalPages - 1;
      const prevPage = Math.max(0, pageIndex - 1);
      const nextPage = Math.min(lastPage, pageIndex + 1);

      if (pageIndex === 0) {
        this.firstLink?.setAttribute("disabled", "disabled");
        this.prevLink?.setAttribute("disabled", "disabled");
      }
      if (pageIndex === lastPage) {
        this.lastLink?.setAttribute("disabled", "disabled");
        this.nextLink?.setAttribute("disabled", "disabled");
      }

      const { search } = new URL(this.ownerDocument.location.href);
      if (this.prevLink) {
        const prevParams = new URLSearchParams(search);
        prevParams.set("page", prevPage);
        this.prevLink.href = `?${prevParams}`;
      }

      if (this.nextLink) {
        const nextParams = new URLSearchParams(search);
        nextParams.set("page", nextPage);
        this.nextLink.href = `?${nextParams}`;
      }

      if (this.lastLink) {
        const lastParams = new URLSearchParams(search);
        lastParams.set("page", lastPage);
        this.lastLink.href = `?${lastParams}`;
      }
    }
  }

  return FeedPagination;
}

if (globalThis.window?.customElements) {
  defFeedPagination(window).register();
}
