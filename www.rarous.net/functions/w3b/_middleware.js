import { defArticlesFeed } from "@rarousnet/website/w3b.js";
import { parseHTML } from "linkedom";

/**
 * @param {EventContext<Env>} context
 */
export async function onRequestGet({ env, next }) {
  const resp = await next();
  const contentType = resp.headers.get("content-type");
  if (resp.ok && contentType?.startsWith("text/html")) {
    const html = await resp.text();
    const { document, window } = parseHTML(html);
    const ArticlesFeed = defArticlesFeed(window);
    ArticlesFeed.register();
    const el = window.document.querySelector(ArticlesFeed.tagName);
    if (el) {
      const data = await env.w3b.get("/latest", "json");
      el.data = Object.values(data).sort((a, b) => -1 * a.entry.published.localeCompare(b.entry.published));
    }
    return new Response(document.toString(), resp);
  }
  return resp;
}
