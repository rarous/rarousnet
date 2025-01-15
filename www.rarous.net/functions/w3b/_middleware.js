import { defArticlesFeed } from "@rarousnet/website/articles-feed.js";
import { defFeedPagination } from "@rarousnet/website/feed-pagination.js";
import { parseHTML } from "linkedom";

/**
 * @param {EventContext<Env>} context
 */
export async function onRequestGet({ request, env, next }) {
  const resp = await next();
  const { searchParams } = new URL(request.url);
  const contentType = resp.headers.get("content-type");
  if (resp.ok && contentType?.startsWith("text/html")) {
    const html = await resp.text();
    const { document, window } = parseHTML(html, { location: new URL(request.url) });
    const ArticlesFeed = defArticlesFeed(window);
    const FeedPagination = defFeedPagination(window);
    ArticlesFeed.register();
    FeedPagination.register();
    const feed = document.querySelector(ArticlesFeed.tagName);
    if (feed) {
      if (searchParams.has("page")) {
        feed.dataset.pageIndex = searchParams.get("page");
      }
      if (searchParams.has("tag")) {
        feed.dataset.tag = searchParams.get("tag");
      }
      const data = await env.w3b.get("/latest", "json");
      feed.data = Object.values(data).sort((a, b) => -1 * a.entry.published.localeCompare(b.entry.published));
    }
    const pagination = document.querySelector(FeedPagination.tagName);
    if (pagination) {
      if (searchParams.has("page")) {
        pagination.dataset.currentPage = searchParams.get("page");
      }
      if (feed) {
        pagination.dataset.itemsCount = feed.itemsCount;
      }
    }
    return new Response(document.toString(), resp);
  }
  return resp;
}
